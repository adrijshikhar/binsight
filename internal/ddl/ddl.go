// Package ddl parses MySQL/MariaDB CREATE/ALTER DDL SQL into a structured
// Schema model. It is backed by the vitess sqlparser library and is
// self-contained: no other package in this module depends on it yet.
package ddl

import "sort"

// Column describes a single column in a table.
type Column struct {
	Name     string
	DataType string
	IsPK     bool
	Nullable bool
}

// FKey describes a foreign-key constraint declared on a table.
type FKey struct {
	ChildCols   []string
	ParentDB    string
	ParentTable string
	ParentCols  []string
	OnDelete    string
}

// Table is the structured representation of a table definition.
type Table struct {
	DB      string
	Name    string
	Columns []Column
	FKeys   []FKey
}

// AlterOp is a single mutation produced by an ALTER TABLE statement.
// Op is one of: add_column, drop_column, add_fk, other.
type AlterOp struct {
	Op     string
	Column *Column
	FKey   *FKey
}

// TableRef is a db-qualified table name.
type TableRef struct {
	DB    string
	Table string
}

// Statement is the parsed form of a single DDL statement.
// Kind is one of: create, alter, drop, rename, truncate, other.
type Statement struct {
	Kind  string
	DB    string
	Table string
	// NewName/NewDB are the rename target (NewDB may be empty for same-db renames).
	NewName string
	NewDB   string
	// DropTables holds every table named by a DROP TABLE (a, b, c). DB/Table
	// mirror the first entry for callers that only look at one.
	DropTables []TableRef
	Create     *Table
	Alter      []AlterOp
}

// Parser parses a single DDL statement into a Statement.
type Parser interface {
	Parse(sql string) (Statement, error)
}

// Schema is a final-state fold of applied DDL statements. It tracks the
// current set of known tables keyed by db+table.
type Schema struct {
	tables map[string]*Table
}

// NewSchema returns an empty Schema.
func NewSchema() *Schema {
	return &Schema{tables: make(map[string]*Table)}
}

func key(db, table string) string {
	return db + "\x00" + table
}

// Apply folds a parsed Statement into the current schema state.
//   - create sets (replaces) the table
//   - drop deletes the table
//   - rename moves the table to its new name
//   - alter mutates an existing table; if the table is unknown it is a no-op
//
// Any other kind is ignored.
func (s *Schema) Apply(st Statement) {
	switch st.Kind {
	case "create":
		if st.Create != nil {
			t := *st.Create
			s.tables[key(t.DB, t.Name)] = &t
		}
	case "drop":
		if len(st.DropTables) > 0 {
			for _, ref := range st.DropTables {
				delete(s.tables, key(ref.DB, ref.Table))
			}
		} else {
			delete(s.tables, key(st.DB, st.Table))
		}
	case "rename":
		k := key(st.DB, st.Table)
		t, ok := s.tables[k]
		if !ok {
			return
		}
		delete(s.tables, k)
		nt := *t
		nt.Name = st.NewName
		if st.NewDB != "" {
			nt.DB = st.NewDB
		}
		nt.Columns = append([]Column(nil), t.Columns...)
		nt.FKeys = append([]FKey(nil), t.FKeys...)
		s.tables[key(nt.DB, nt.Name)] = &nt
	case "alter":
		t, ok := s.tables[key(st.DB, st.Table)]
		if !ok {
			return
		}
		s.tables[key(st.DB, st.Table)] = applyAlter(t, st.Alter)
	}
}

func applyAlter(t *Table, ops []AlterOp) *Table {
	nt := *t
	nt.Columns = append([]Column(nil), t.Columns...)
	nt.FKeys = append([]FKey(nil), t.FKeys...)
	for _, op := range ops {
		switch op.Op {
		case "add_column":
			if op.Column != nil {
				nt.Columns = append(nt.Columns, *op.Column)
			}
		case "drop_column":
			if op.Column != nil {
				nt.Columns = dropColumn(nt.Columns, op.Column.Name)
			}
		case "add_fk":
			if op.FKey != nil {
				nt.FKeys = append(nt.FKeys, *op.FKey)
			}
		}
	}
	return &nt
}

func dropColumn(cols []Column, name string) []Column {
	out := make([]Column, 0, len(cols))
	for _, c := range cols {
		if c.Name == name {
			continue
		}
		out = append(out, c)
	}
	return out
}

// Tables returns all known tables sorted by DB then Name.
func (s *Schema) Tables() []*Table {
	out := make([]*Table, 0, len(s.tables))
	for _, t := range s.tables {
		cp := *t
		cp.Columns = append([]Column(nil), t.Columns...)
		cp.FKeys = append([]FKey(nil), t.FKeys...)
		out = append(out, &cp)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].DB != out[j].DB {
			return out[i].DB < out[j].DB
		}
		return out[i].Name < out[j].Name
	})
	return out
}
