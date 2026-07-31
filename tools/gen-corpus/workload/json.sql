-- feature: json (MySQL 5.7+) — a JSON column with inserts and a whole-value
-- UPDATE. Exercises the JSON column type + JSON row values in ROW format.
USE corpus;

CREATE TABLE json_docs (
  id  INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  doc JSON
) ENGINE=InnoDB;

INSERT INTO json_docs (doc) VALUES
  ('{"a": 1, "b": [1, 2, 3], "c": {"nested": true}}'),
  ('{"name": "テスト", "tags": ["x", "y"]}');

-- Whole-value replace (a full JSON value in the after-image, not a partial diff).
UPDATE json_docs SET doc = '{"a": 2, "replaced": true}' WHERE id = 1;
