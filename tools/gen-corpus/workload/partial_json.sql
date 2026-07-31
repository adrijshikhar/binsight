-- feature: partial_json (MySQL 8.0.23+) — JSON_SET / JSON_REPLACE on a large
-- JSON value so the server emits PARTIAL_UPDATE_ROWS instead of a full
-- after-image. Requires binlog_row_value_options=PARTIAL_JSON (set via ExtraSrv
-- for the 8.0/8.4 configs in config.go); on a server without it these are just
-- ordinary UPDATE_ROWS.
USE corpus;

CREATE TABLE partial_docs (
  id  INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  doc JSON
) ENGINE=InnoDB;

-- A large value so a partial update is worthwhile for the server to log.
INSERT INTO partial_docs (doc) VALUES
  ('{"pad": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "b": 1, "c": "static"}');

-- In-place partial modifications (small leaf changes on a big document).
UPDATE partial_docs SET doc = JSON_SET(doc, '$.b', 2) WHERE id = 1;
UPDATE partial_docs SET doc = JSON_REPLACE(doc, '$.c', 'updated') WHERE id = 1;
