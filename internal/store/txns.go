package store

// Txn is one binlog transaction (GTID → ... → XID/DDL-commit).
type Txn struct {
	ID           int64  `json:"id"`
	FileID       int64  `json:"file_id"`
	GTID         string `json:"gtid"`
	StartPos     int64  `json:"start_pos"`
	EndPos       int64  `json:"end_pos"`
	StartTS      int64  `json:"start_ts"`
	CommitTS     int64  `json:"commit_ts"`
	EventCount   int64  `json:"event_count"`
	RowsInserted int64  `json:"rows_inserted"`
	RowsUpdated  int64  `json:"rows_updated"`
	RowsDeleted  int64  `json:"rows_deleted"`
	Status       string `json:"status"` // committed|rolled_back|incomplete
}

// InsertTxn creates a transaction record and returns its ID.
func (s *Store) InsertTxn(t *Txn) (int64, error) {
	res, err := s.DB.Exec(`INSERT INTO txns
		(file_id,gtid,start_pos,end_pos,start_ts,commit_ts,event_count,
		 rows_inserted,rows_updated,rows_deleted,status)
		VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
		t.FileID, t.GTID, t.StartPos, t.EndPos, t.StartTS, t.CommitTS, t.EventCount,
		t.RowsInserted, t.RowsUpdated, t.RowsDeleted, t.Status)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	t.ID = id
	return id, err
}

// UpdateTxn persists final stats/status when a transaction closes.
func (s *Store) UpdateTxn(t *Txn) error {
	_, err := s.DB.Exec(`UPDATE txns SET end_pos=?,commit_ts=?,event_count=?,
		rows_inserted=?,rows_updated=?,rows_deleted=?,status=? WHERE id=?`,
		t.EndPos, t.CommitTS, t.EventCount, t.RowsInserted, t.RowsUpdated, t.RowsDeleted,
		t.Status, t.ID)
	return err
}

// ListTxnGTIDs returns the GTIDs of committed transactions fully contained at
// or below maxEndPos — the set the streamer unions into its resume GTID set.
// Anonymous transactions store the literal string "ANONYMOUS" (not empty string)
// and are excluded along with any rows that somehow have an empty gtid.
// Open and rolled-back transactions are also excluded.
func (s *Store) ListTxnGTIDs(fileID, maxEndPos int64) ([]string, error) {
	rows, err := s.DB.Query(`SELECT gtid FROM txns
		WHERE file_id=? AND end_pos<=? AND status='committed' AND gtid NOT IN ('', 'ANONYMOUS')
		ORDER BY start_pos`, fileID, maxEndPos)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var g string
		if err := rows.Scan(&g); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

// ListTxns returns all transactions of a file ordered by start position.
func (s *Store) ListTxns(fileID int64) ([]*Txn, error) {
	rows, err := s.DB.Query(`SELECT id,file_id,gtid,start_pos,end_pos,start_ts,commit_ts,
		event_count,rows_inserted,rows_updated,rows_deleted,status
		FROM txns WHERE file_id=? ORDER BY start_pos`, fileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Txn
	for rows.Next() {
		var t Txn
		if err := rows.Scan(&t.ID, &t.FileID, &t.GTID, &t.StartPos, &t.EndPos, &t.StartTS,
			&t.CommitTS, &t.EventCount, &t.RowsInserted, &t.RowsUpdated, &t.RowsDeleted,
			&t.Status); err != nil {
			return nil, err
		}
		out = append(out, &t)
	}
	return out, rows.Err()
}
