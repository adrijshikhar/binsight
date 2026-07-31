package ddl

import (
	"fmt"
	"strings"

	"vitess.io/vitess/go/vt/sqlparser"
)

// vitessParser is a Parser backed by the vitess sqlparser library.
type vitessParser struct {
	p *sqlparser.Parser
}

// NewVitessParser returns a vitess-backed Parser.
func NewVitessParser() Parser {
	p, err := sqlparser.New(sqlparser.Options{})
	if err != nil {
		panic(fmt.Sprintf("ddl: init vitess parser: %v", err))
	}
	return &vitessParser{p: p}
}

// Parse parses a single DDL statement. On a parse error it returns
// Statement{Kind: "other"} along with the error.
func (v *vitessParser) Parse(sql string) (Statement, error) {
	stmt, err := v.p.Parse(sql)
	if err != nil {
		return Statement{Kind: "other"}, err
	}

	switch s := stmt.(type) {
	case *sqlparser.CreateTable:
		return parseCreate(s), nil
	case *sqlparser.AlterTable:
		return parseAlter(s), nil
	case *sqlparser.DropTable:
		st := Statement{Kind: "drop"}
		for _, t := range s.FromTables {
			st.DropTables = append(st.DropTables, TableRef{DB: t.Qualifier.String(), Table: t.Name.String()})
		}
		if len(st.DropTables) > 0 {
			st.DB = st.DropTables[0].DB
			st.Table = st.DropTables[0].Table
		}
		return st, nil
	case *sqlparser.RenameTable:
		st := Statement{Kind: "rename"}
		if len(s.TablePairs) > 0 {
			st.DB = s.TablePairs[0].FromTable.Qualifier.String()
			st.Table = s.TablePairs[0].FromTable.Name.String()
			st.NewName = s.TablePairs[0].ToTable.Name.String()
			st.NewDB = s.TablePairs[0].ToTable.Qualifier.String()
		}
		return st, nil
	case *sqlparser.TruncateTable:
		return Statement{
			Kind:  "truncate",
			DB:    s.Table.Qualifier.String(),
			Table: s.Table.Name.String(),
		}, nil
	default:
		return Statement{Kind: "other"}, nil
	}
}

func parseCreate(ct *sqlparser.CreateTable) Statement {
	db := ct.Table.Qualifier.String()
	name := ct.Table.Name.String()
	tbl := &Table{DB: db, Name: name}

	pkCols := primaryKeyColumns(ct)

	if ct.TableSpec != nil {
		for _, c := range ct.TableSpec.Columns {
			if c == nil {
				continue
			}
			col := Column{
				Name:     c.Name.String(),
				DataType: strings.ToUpper(c.Type.Type),
				Nullable: isNullable(c),
			}
			if pkCols[col.Name] {
				col.IsPK = true
			}
			// A PRIMARY KEY column is implicitly NOT NULL.
			if col.IsPK {
				col.Nullable = false
			}
			tbl.Columns = append(tbl.Columns, col)
		}
		for _, con := range ct.TableSpec.Constraints {
			if fk, ok := con.Details.(*sqlparser.ForeignKeyDefinition); ok {
				tbl.FKeys = append(tbl.FKeys, parseFK(fk))
			}
		}
	}

	return Statement{Kind: "create", DB: db, Table: name, Create: tbl}
}

func primaryKeyColumns(ct *sqlparser.CreateTable) map[string]bool {
	pk := make(map[string]bool)
	if ct.TableSpec == nil {
		return pk
	}
	// Inline column-level PRIMARY KEY (e.g. `id INT PRIMARY KEY`).
	for _, c := range ct.TableSpec.Columns {
		if c == nil {
			continue
		}
		if c.Type.Options != nil && c.Type.Options.KeyOpt == sqlparser.ColKeyPrimary {
			pk[c.Name.String()] = true
		}
	}
	for _, idx := range ct.TableSpec.Indexes {
		if idx.Info != nil && idx.Info.Type == sqlparser.IndexTypePrimary {
			for _, ic := range idx.Columns {
				pk[ic.Column.String()] = true
			}
		}
	}
	return pk
}

func isNullable(c *sqlparser.ColumnDefinition) bool {
	if c.Type.Options != nil && c.Type.Options.Null != nil && !*c.Type.Options.Null {
		return false
	}
	return true
}

func parseFK(fk *sqlparser.ForeignKeyDefinition) FKey {
	out := FKey{}
	for _, c := range fk.Source {
		out.ChildCols = append(out.ChildCols, c.String())
	}
	if fk.ReferenceDefinition != nil {
		ref := fk.ReferenceDefinition
		out.ParentDB = ref.ReferencedTable.Qualifier.String()
		out.ParentTable = ref.ReferencedTable.Name.String()
		for _, c := range ref.ReferencedColumns {
			out.ParentCols = append(out.ParentCols, c.String())
		}
		out.OnDelete = referenceAction(ref.OnDelete)
	}
	return out
}

func referenceAction(a sqlparser.ReferenceAction) string {
	switch a {
	case sqlparser.Cascade:
		return "CASCADE"
	case sqlparser.SetNull:
		return "SET NULL"
	case sqlparser.Restrict:
		return "RESTRICT"
	case sqlparser.NoAction:
		return "NO ACTION"
	case sqlparser.SetDefault:
		return "SET DEFAULT"
	default:
		return ""
	}
}

func parseAlter(at *sqlparser.AlterTable) Statement {
	db := at.Table.Qualifier.String()
	name := at.Table.Name.String()
	st := Statement{Kind: "alter", DB: db, Table: name}

	for _, opt := range at.AlterOptions {
		switch o := opt.(type) {
		case *sqlparser.AddColumns:
			for _, c := range o.Columns {
				if c == nil {
					continue
				}
				col := Column{
					Name:     c.Name.String(),
					DataType: strings.ToUpper(c.Type.Type),
					Nullable: isNullable(c),
				}
				st.Alter = append(st.Alter, AlterOp{Op: "add_column", Column: &col})
			}
		case *sqlparser.DropColumn:
			col := Column{Name: o.Name.Name.String()}
			st.Alter = append(st.Alter, AlterOp{Op: "drop_column", Column: &col})
		case *sqlparser.AddConstraintDefinition:
			if o.ConstraintDefinition != nil {
				if fk, ok := o.ConstraintDefinition.Details.(*sqlparser.ForeignKeyDefinition); ok {
					f := parseFK(fk)
					st.Alter = append(st.Alter, AlterOp{Op: "add_fk", FKey: &f})
					continue
				}
			}
			st.Alter = append(st.Alter, AlterOp{Op: "other"})
		default:
			st.Alter = append(st.Alter, AlterOp{Op: "other"})
		}
	}

	return st
}
