package conformance

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/adrijshikhar/binsight/internal/adapter"
	"github.com/adrijshikhar/binsight/internal/adapter/gomysql"
	"github.com/adrijshikhar/binsight/internal/indexer"
	"github.com/adrijshikhar/binsight/internal/store"
)

func benchDecodePath(b *testing.B, relPath string) {
	b.Helper()
	absPath := filepath.Join(corpusRoot, relPath)
	if _, err := os.Stat(absPath); err != nil {
		b.Fatalf("fixture not found: %s", absPath)
	}

	dec := gomysql.New()
	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		st, err := dec.Decode(context.Background(), adapter.Source{Path: absPath}, adapter.DecodeOpts{})
		if err != nil {
			b.Fatalf("decode: %v", err)
		}
		count := 0
		for {
			_, err := st.Next()
			if errors.Is(err, io.EOF) {
				break
			}
			if err != nil {
				b.Fatalf("next: %v", err)
			}
			count++
		}
		st.Close()
	}
}

func BenchmarkDecode_GoMySQL_8_0(b *testing.B) {
	benchDecodePath(b, "8.0/mysql-8.0.binlog")
}

func BenchmarkDecode_GoMySQL_5_5(b *testing.B) {
	benchDecodePath(b, "5.5/mysql-5.5.binlog")
}

func BenchmarkDecode_GoMySQL_8_0_Full(b *testing.B) {
	benchDecodePath(b, "8.0-full/mysql-8.0-full.binlog")
}

func BenchmarkDecode_GoMySQL_MariaDB_10_6(b *testing.B) {
	benchDecodePath(b, "maria-10.6/mysql-maria-10.6.binlog")
}

func BenchmarkIndex_Pipeline_8_0(b *testing.B) {
	absPath := filepath.Join(corpusRoot, "8.0/mysql-8.0.binlog")
	fi, err := os.Stat(absPath)
	if err != nil {
		b.Fatalf("fixture not found: %s", absPath)
	}

	b.ReportAllocs()
	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		b.StopTimer()
		dir := b.TempDir()
		st, err := store.Open(filepath.Join(dir, "bench.db"))
		if err != nil {
			b.Fatal(err)
		}
		fileRec := &store.File{
			Path:    absPath,
			MagicOK: true,
			Size:    fi.Size(),
			State:   store.FileStateIndexing,
		}
		if err := st.UpsertFile(fileRec); err != nil {
			b.Fatal(err)
		}
		saved, err := st.GetFileByPath(absPath)
		if err != nil {
			b.Fatal(err)
		}
		fileRec.ID = saved.ID

		ix := indexer.New(st, gomysql.New())
		b.StartTimer()

		if err := ix.IndexFile(context.Background(), fileRec, nil); err != nil {
			b.Fatalf("IndexFile: %v", err)
		}

		b.StopTimer()
		st.Close()
		b.StartTimer()
	}
}

func BenchmarkStore_QueryEvents(b *testing.B) {
	absPath := filepath.Join(corpusRoot, "8.0/mysql-8.0.binlog")
	fi, err := os.Stat(absPath)
	if err != nil {
		b.Fatalf("fixture not found: %s", absPath)
	}

	dir := b.TempDir()
	st, err := store.Open(filepath.Join(dir, "query_bench.db"))
	if err != nil {
		b.Fatal(err)
	}
	defer st.Close()

	fileRec := &store.File{
		Path:    absPath,
		MagicOK: true,
		Size:    fi.Size(),
		State:   store.FileStateIndexing,
	}
	if err := st.UpsertFile(fileRec); err != nil {
		b.Fatal(err)
	}
	saved, err := st.GetFileByPath(absPath)
	if err != nil {
		b.Fatal(err)
	}
	fileRec.ID = saved.ID

	ix := indexer.New(st, gomysql.New())
	if err := ix.IndexFile(context.Background(), fileRec, nil); err != nil {
		b.Fatalf("IndexFile setup: %v", err)
	}

	b.ReportAllocs()
	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		page, err := st.QueryEvents(store.EventFilter{
			FileID: saved.ID,
			Limit:  50,
		})
		if err != nil {
			b.Fatalf("QueryEvents: %v", err)
		}
		if len(page.Events) == 0 {
			b.Fatal("expected events, got 0")
		}
	}
}
