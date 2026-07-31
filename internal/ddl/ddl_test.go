package ddl

import "testing"

func TestParseCreateWithPKAndFK(t *testing.T) {
	p := NewVitessParser()
	st, err := p.Parse("CREATE TABLE shop.child (id INT NOT NULL, pid INT, name VARCHAR(50), PRIMARY KEY (id), CONSTRAINT fk1 FOREIGN KEY (pid) REFERENCES shop.parent (id) ON DELETE CASCADE)")
	if err != nil {
		t.Fatal(err)
	}
	if st.Kind != "create" || st.Table != "child" || st.DB != "shop" {
		t.Fatalf("got %+v", st)
	}
	if len(st.Create.Columns) != 3 {
		t.Fatalf("cols %d", len(st.Create.Columns))
	}
	if st.Create.Columns[0].Name != "id" || st.Create.Columns[0].DataType != "INT" || !st.Create.Columns[0].IsPK {
		t.Errorf("col0 %+v", st.Create.Columns[0])
	}
	if !st.Create.Columns[1].Nullable {
		t.Errorf("pid should be nullable")
	}
	if len(st.Create.FKeys) != 1 {
		t.Fatalf("fks %d", len(st.Create.FKeys))
	}
	fk := st.Create.FKeys[0]
	if fk.ParentTable != "parent" || fk.OnDelete != "CASCADE" || fk.ChildCols[0] != "pid" || fk.ParentCols[0] != "id" {
		t.Errorf("fk %+v", fk)
	}
}

func TestApplyAlterAddDropColumn(t *testing.T) {
	p := NewVitessParser()
	s := NewSchema()
	c, err := p.Parse("CREATE TABLE t (a INT, b INT)")
	if err != nil {
		t.Fatal(err)
	}
	s.Apply(c)
	a, err := p.Parse("ALTER TABLE t ADD COLUMN c VARCHAR(10)")
	if err != nil {
		t.Fatal(err)
	}
	s.Apply(a)
	d, err := p.Parse("ALTER TABLE t DROP COLUMN a")
	if err != nil {
		t.Fatal(err)
	}
	s.Apply(d)
	tbl := s.Tables()[0]
	var got []string
	for _, col := range tbl.Columns {
		got = append(got, col.Name)
	}
	if len(got) != 2 || got[0] != "b" || got[1] != "c" {
		t.Errorf("cols=%v want [b c]", got)
	}
}

func TestParseMalformedIsOther(t *testing.T) {
	p := NewVitessParser()
	st, err := p.Parse("CREATE TABLE (((")
	if err == nil {
		t.Error("want parse error")
	}
	if st.Kind != "other" {
		t.Errorf("kind=%s want other", st.Kind)
	}
}

func TestParseDropTruncateRename(t *testing.T) {
	p := NewVitessParser()
	cases := map[string]string{"DROP TABLE t": "drop", "TRUNCATE TABLE t": "truncate", "RENAME TABLE t TO t2": "rename"}
	for sql, kind := range cases {
		st, err := p.Parse(sql)
		if err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
		if st.Kind != kind {
			t.Errorf("%s -> %s want %s", sql, st.Kind, kind)
		}
	}
}

func TestParseFKOnDeleteActions(t *testing.T) {
	p := NewVitessParser()
	cases := map[string]string{
		"CREATE TABLE c (pid INT, FOREIGN KEY (pid) REFERENCES p (id) ON DELETE SET NULL)": "SET NULL",
		"CREATE TABLE c (pid INT, FOREIGN KEY (pid) REFERENCES p (id) ON DELETE RESTRICT)": "RESTRICT",
	}
	for sql, want := range cases {
		st, err := p.Parse(sql)
		if err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
		if len(st.Create.FKeys) != 1 {
			t.Fatalf("%s: fks %d", sql, len(st.Create.FKeys))
		}
		if got := st.Create.FKeys[0].OnDelete; got != want {
			t.Errorf("%s -> OnDelete=%q want %q", sql, got, want)
		}
	}
}

func TestApplyDropAndRename(t *testing.T) {
	p := NewVitessParser()
	s := NewSchema()

	c, err := p.Parse("CREATE TABLE t (a INT, b INT)")
	if err != nil {
		t.Fatal(err)
	}
	s.Apply(c)

	d, err := p.Parse("DROP TABLE t")
	if err != nil {
		t.Fatal(err)
	}
	s.Apply(d)
	if len(s.Tables()) != 0 {
		t.Fatalf("after drop, tables=%d want 0", len(s.Tables()))
	}

	c2, err := p.Parse("CREATE TABLE t (a INT, b INT)")
	if err != nil {
		t.Fatal(err)
	}
	s.Apply(c2)

	r, err := p.Parse("RENAME TABLE t TO t2")
	if err != nil {
		t.Fatal(err)
	}
	s.Apply(r)

	tbls := s.Tables()
	if len(tbls) != 1 {
		t.Fatalf("after rename, tables=%d want 1", len(tbls))
	}
	if tbls[0].Name != "t2" {
		t.Errorf("name=%s want t2", tbls[0].Name)
	}
	var got []string
	for _, col := range tbls[0].Columns {
		got = append(got, col.Name)
	}
	if len(got) != 2 || got[0] != "a" || got[1] != "b" {
		t.Errorf("cols=%v want [a b]", got)
	}
}

func TestPKColumnNotNullable(t *testing.T) {
	p := NewVitessParser()
	st, err := p.Parse("CREATE TABLE t (id INT PRIMARY KEY)")
	if err != nil {
		t.Fatal(err)
	}
	if len(st.Create.Columns) != 1 {
		t.Fatalf("cols %d", len(st.Create.Columns))
	}
	col := st.Create.Columns[0]
	if col.Name != "id" || !col.IsPK || col.Nullable {
		t.Errorf("col %+v; want id IsPK=true Nullable=false", col)
	}
}

func TestApplyDropMultipleTables(t *testing.T) {
	p := NewVitessParser()
	s := NewSchema()
	for _, sql := range []string{"CREATE TABLE a (x INT)", "CREATE TABLE b (y INT)", "CREATE TABLE c (z INT)"} {
		st, err := p.Parse(sql)
		if err != nil {
			t.Fatal(err)
		}
		s.Apply(st)
	}
	st, err := p.Parse("DROP TABLE a, c")
	if err != nil {
		t.Fatal(err)
	}
	s.Apply(st)
	tbls := s.Tables()
	if len(tbls) != 1 || tbls[0].Name != "b" {
		var names []string
		for _, tb := range tbls {
			names = append(names, tb.Name)
		}
		t.Fatalf("DROP TABLE a, c should leave only b, got %v", names)
	}
}

func TestApplyRenameCrossDB(t *testing.T) {
	p := NewVitessParser()
	s := NewSchema()
	c, err := p.Parse("CREATE TABLE shop.t (id INT)")
	if err != nil {
		t.Fatal(err)
	}
	s.Apply(c)
	r, err := p.Parse("RENAME TABLE shop.t TO archive.t")
	if err != nil {
		t.Fatal(err)
	}
	s.Apply(r)
	tbls := s.Tables()
	if len(tbls) != 1 || tbls[0].DB != "archive" || tbls[0].Name != "t" {
		t.Fatalf("cross-db rename should move to archive.t, got %+v", tbls)
	}
}
