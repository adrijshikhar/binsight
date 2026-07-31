package store

// DecodeError records a single-event decode failure (indexing continues).
type DecodeError struct {
	ID         int64  `json:"id"`
	FileID     int64  `json:"file_id"`
	Pos        int64  `json:"pos"`
	Adapter    string `json:"adapter"`
	Message    string `json:"message"`
	RawExcerpt []byte `json:"raw_excerpt,omitempty"`
}

func (s *Store) InsertDecodeError(e *DecodeError) error {
	_, err := s.DB.Exec(`INSERT INTO decode_errors (file_id,pos,adapter,message,raw_excerpt)
		VALUES (?,?,?,?,?)`, e.FileID, e.Pos, e.Adapter, e.Message, e.RawExcerpt)
	return err
}

func (s *Store) ListDecodeErrors(fileID int64) ([]*DecodeError, error) {
	rows, err := s.DB.Query(`SELECT id,file_id,pos,adapter,message,COALESCE(raw_excerpt,x'')
		FROM decode_errors WHERE file_id=? ORDER BY pos`, fileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*DecodeError
	for rows.Next() {
		var e DecodeError
		if err := rows.Scan(&e.ID, &e.FileID, &e.Pos, &e.Adapter, &e.Message, &e.RawExcerpt); err != nil {
			return nil, err
		}
		out = append(out, &e)
	}
	return out, rows.Err()
}
