package server

import (
	"context"
	"errors"
	"io"
	"strings"

	"github.com/adrijshikhar/binsight/internal/adapter"
	"github.com/adrijshikhar/binsight/internal/ddl"
	"github.com/adrijshikhar/binsight/internal/sqlkw"
	"github.com/adrijshikhar/binsight/internal/store"
)

// buildSchema is the server-side post-index pass: it decodes the file ONCE,
// folds every CREATE/ALTER/DROP/RENAME DDL statement into a Schema, and persists
// the resulting tables + foreign keys. It first clears any prior schema so a
// reindex produces a clean final-state fold.
//
// A single full decode (via the indexer adapter, which exposes Decoded.DB +
// Decoded.SQL for QUERY events) is O(file). The previous per-DDL-event re-decode
// was O(N_ddl × pos) — each event re-scanned the file from the start.
func (srv *Server) buildSchema(fileID int64, path string) error {
	if err := srv.store.ClearSchema(fileID); err != nil {
		return err
	}
	dec := srv.reg.ForRole(adapter.RoleIndexer)
	if dec == nil {
		return errors.New("no indexer adapter configured")
	}
	stream, err := dec.Decode(context.Background(), adapter.Source{Path: path}, adapter.DecodeOpts{})
	if err != nil {
		return err
	}
	defer stream.Close()

	p := ddl.NewVitessParser()
	sch := ddl.NewSchema()
	// A DDL that fails to parse can't be attributed to a table (the parse yields
	// nothing), but it may have altered any table — so the folded schema is
	// suspect. Persist every table "partial" in that case, so column-name
	// enrichment (which requires "full") won't serve possibly-wrong names.
	anyParseFail := false

	for {
		ev, err := stream.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			break // best-effort: stop on a stream error, persist what we folded
		}
		if ev.Decoded == nil || ev.Header.TypeName != "QUERY" {
			continue
		}
		sql := strings.TrimSpace(ev.Decoded.SQL)
		if !sqlkw.IsDDL(sql) { // skip BEGIN / DML without a full parse
			continue
		}
		st, perr := p.Parse(sql)
		if perr != nil {
			anyParseFail = true
			continue
		}
		// Unqualified DDL: the USE-context is lost in the stream, so fall back to
		// the db go-mysql recorded on the event. Keep st.Create.DB in sync so a
		// CREATE and a later ALTER key under the same (db,table) in Apply.
		if st.DB == "" {
			st.DB = ev.Decoded.DB
		}
		if st.Create != nil && st.Create.DB == "" {
			st.Create.DB = st.DB
		}
		sch.Apply(st)
	}

	for _, t := range sch.Tables() {
		cols := make([]store.SchemaColumn, len(t.Columns))
		for i, c := range t.Columns {
			cols[i] = store.SchemaColumn{
				Ordinal:  i + 1,
				Name:     c.Name,
				DataType: c.DataType,
				IsPK:     c.IsPK,
				Nullable: c.Nullable,
			}
		}
		confidence := "full"
		if anyParseFail {
			confidence = "partial"
		}
		if err := srv.store.UpsertTableSchema(fileID, t.DB, t.Name, cols, confidence); err != nil {
			return err
		}
	}

	var fks []store.FKey
	for _, t := range sch.Tables() {
		for _, fk := range t.FKeys {
			pdb := fk.ParentDB
			if pdb == "" {
				pdb = t.DB
			}
			fks = append(fks, store.FKey{
				ChildDB:     t.DB,
				ChildTable:  t.Name,
				ChildCols:   strings.Join(fk.ChildCols, ","),
				ParentDB:    pdb,
				ParentTable: fk.ParentTable,
				ParentCols:  strings.Join(fk.ParentCols, ","),
				OnDelete:    fk.OnDelete,
			})
		}
	}
	return srv.store.InsertFKeys(fileID, fks)
}
