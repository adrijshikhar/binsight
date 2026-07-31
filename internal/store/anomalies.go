package store

// Anomaly is one persisted detector finding (metadata only, disposable —
// rebuilt on every detection run).
type Anomaly struct {
	ID         int64  `json:"id"`
	FileID     int64  `json:"file_id"`
	Detector   string `json:"detector"`
	Severity   string `json:"severity"`
	TxnID      int64  `json:"txn_id,omitempty"`
	EventPos   int64  `json:"event_pos,omitempty"`
	DBName     string `json:"db_name,omitempty"`
	TableName  string `json:"table_name,omitempty"`
	Metric     int64  `json:"metric"`
	Threshold  int64  `json:"threshold"`
	Message    string `json:"message"`
	DetailJSON string `json:"detail_json"`
}

// AnomalySummary is the per-file rollup for sidebar/Overview badges.
type AnomalySummary struct {
	Count       int64  `json:"count"`
	MaxSeverity string `json:"max_severity"`
}

// severityCase ranks severities for ORDER BY and max-severity rollups.
// Lower number = more severe.
const severityCase = `CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1
	WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`

// InsertAnomalies bulk-inserts findings in one transaction. txn_id/event_pos
// are stored NULL when zero so the nullable columns stay meaningful.
func (s *Store) InsertAnomalies(as []*Anomaly) error {
	if len(as) == 0 {
		return nil
	}
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	stmt, err := tx.Prepare(`INSERT INTO anomalies
		(file_id,detector,severity,txn_id,event_pos,db_name,table_name,
		 metric,threshold,message,detail_json)
		VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	defer stmt.Close()
	for _, a := range as {
		detail := a.DetailJSON
		if detail == "" {
			detail = "{}"
		}
		var txnID, eventPos any
		if a.TxnID != 0 {
			txnID = a.TxnID
		}
		if a.EventPos != 0 {
			eventPos = a.EventPos
		}
		if _, err := stmt.Exec(a.FileID, a.Detector, a.Severity, txnID, eventPos,
			nullIfEmpty(a.DBName), nullIfEmpty(a.TableName),
			a.Metric, a.Threshold, a.Message, detail); err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

// ClearAnomalies deletes all findings for a file (idempotent re-detect).
func (s *Store) ClearAnomalies(fileID int64) error {
	_, err := s.DB.Exec(`DELETE FROM anomalies WHERE file_id=?`, fileID)
	return err
}

// ListAnomalies returns findings ranked critical→low then by event position.
// severity == "" means no filter.
func (s *Store) ListAnomalies(fileID int64, severity string) ([]*Anomaly, error) {
	q := `SELECT id,file_id,detector,severity,COALESCE(txn_id,0),COALESCE(event_pos,0),
		COALESCE(db_name,''),COALESCE(table_name,''),metric,threshold,message,detail_json
		FROM anomalies WHERE file_id=?`
	args := []any{fileID}
	if severity != "" {
		q += ` AND severity=?`
		args = append(args, severity)
	}
	q += ` ORDER BY ` + severityCase + `, COALESCE(event_pos,0)`
	rows, err := s.DB.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Anomaly
	for rows.Next() {
		var a Anomaly
		if err := rows.Scan(&a.ID, &a.FileID, &a.Detector, &a.Severity, &a.TxnID,
			&a.EventPos, &a.DBName, &a.TableName, &a.Metric, &a.Threshold,
			&a.Message, &a.DetailJSON); err != nil {
			return nil, err
		}
		out = append(out, &a)
	}
	return out, rows.Err()
}

// AnomalyFileSummary returns count + most-severe severity per file_id, for the
// /api/files badges. One grouped query for all files.
func (s *Store) AnomalyFileSummary() (map[int64]AnomalySummary, error) {
	rows, err := s.DB.Query(`SELECT file_id, count(*),
		MIN(` + severityCase + `) FROM anomalies GROUP BY file_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	rank := []string{"critical", "high", "medium", "low"}
	out := map[int64]AnomalySummary{}
	for rows.Next() {
		var fid, count int64
		var minRank int
		if err := rows.Scan(&fid, &count, &minRank); err != nil {
			return nil, err
		}
		sev := "low"
		if minRank >= 0 && minRank < len(rank) {
			sev = rank[minRank]
		}
		out[fid] = AnomalySummary{Count: count, MaxSeverity: sev}
	}
	return out, rows.Err()
}
