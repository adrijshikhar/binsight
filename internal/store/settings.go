package store

import "fmt"

// SetSetting stores a JSON value under key (UI settings persistence).
func (s *Store) SetSetting(key, valueJSON string) error {
	_, err := s.DB.Exec(`INSERT INTO settings (key,value_json) VALUES (?,?)
		ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json`, key, valueJSON)
	return err
}

func (s *Store) GetSetting(key string) (string, error) {
	var v string
	err := s.DB.QueryRow(`SELECT value_json FROM settings WHERE key=?`, key).Scan(&v)
	if err != nil {
		return "", fmt.Errorf("setting %q: %w", key, err)
	}
	return v, nil
}

func (s *Store) AllSettings() (map[string]string, error) {
	rows, err := s.DB.Query(`SELECT key,value_json FROM settings`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		out[k] = v
	}
	return out, rows.Err()
}
