package anomaly

import "testing"

func TestDefaultThresholds(t *testing.T) {
	d := DefaultThresholds()
	if d.TxnBytes != 1<<30 || d.TxnRows != 100_000 || d.TxnSeconds != 60 || d.EventRows != 50_000 {
		t.Fatalf("unexpected defaults: %+v", d)
	}
}

func TestClassifyDDL(t *testing.T) {
	cases := map[string]string{
		"DROP TABLE t":        SeverityHigh,
		"truncate table t":    SeverityHigh,
		"ALTER TABLE t ADD c": SeverityMedium,
		"CREATE TABLE t (a)":  SeverityLow,
	}
	for sql, want := range cases {
		got, ok := classifyDDL(sql)
		if !ok || got != want {
			t.Fatalf("classifyDDL(%q) = %q,%v want %q", sql, got, ok, want)
		}
	}
	if _, ok := classifyDDL("INSERT INTO t VALUES (1)"); ok {
		t.Fatal("non-DDL classified as DDL")
	}
	if _, ok := classifyDDL("DROPPED TABLE t"); ok {
		t.Fatal("DROPPED must not classify as DROP")
	}
	if _, ok := classifyDDL("ALTERATION"); ok {
		t.Fatal("ALTERATION must not classify as ALTER")
	}
}
