package store

// TableStat aggregates per-table activity within one file (Tables view).
type TableStat struct {
	ID              int64  `json:"id"`
	FileID          int64  `json:"file_id"`
	DBName          string `json:"db_name"`
	TableName       string `json:"table_name"`
	TableMapCount   int64  `json:"table_map_count"`
	ColumnTypesJSON string `json:"column_types_json"`
	Inserts         int64  `json:"inserts"`
	Updates         int64  `json:"updates"`
	Deletes         int64  `json:"deletes"`
	RowsTotal       int64  `json:"rows_total"`
	BytesTotal      int64  `json:"bytes_total"`
}

// UpsertTableStat replaces the aggregated stats for one table.
func (s *Store) UpsertTableStat(t *TableStat) error {
	_, err := s.DB.Exec(`INSERT INTO tables
		(file_id,db_name,table_name,table_map_count,column_types_json,
		 inserts,updates,deletes,rows_total,bytes_total)
		VALUES (?,?,?,?,?,?,?,?,?,?)
		ON CONFLICT(file_id,db_name,table_name) DO UPDATE SET
			table_map_count=excluded.table_map_count,
			column_types_json=excluded.column_types_json,
			inserts=excluded.inserts, updates=excluded.updates, deletes=excluded.deletes,
			rows_total=excluded.rows_total, bytes_total=excluded.bytes_total`,
		t.FileID, t.DBName, t.TableName, t.TableMapCount, t.ColumnTypesJSON,
		t.Inserts, t.Updates, t.Deletes, t.RowsTotal, t.BytesTotal)
	return err
}

func (s *Store) ListTableStats(fileID int64) ([]*TableStat, error) {
	rows, err := s.DB.Query(`SELECT id,file_id,db_name,table_name,table_map_count,
		column_types_json,inserts,updates,deletes,rows_total,bytes_total
		FROM tables WHERE file_id=? ORDER BY bytes_total DESC`, fileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*TableStat
	for rows.Next() {
		var t TableStat
		if err := rows.Scan(&t.ID, &t.FileID, &t.DBName, &t.TableName, &t.TableMapCount,
			&t.ColumnTypesJSON, &t.Inserts, &t.Updates, &t.Deletes, &t.RowsTotal,
			&t.BytesTotal); err != nil {
			return nil, err
		}
		out = append(out, &t)
	}
	return out, rows.Err()
}
