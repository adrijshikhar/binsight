-- Base workload — applied to EVERY version in the matrix. The single source of
-- edge-case coverage (version-testing spec §6); add a base edge case here and it
-- flows to every version. Version-gated add-ons live in workload/<feature>.sql.
--
-- Goal: exercise DDL, all common column types, NULLs, multi-row + rolled-back +
-- autocommit transactions, and non-latin charset data — all in ROW format.

CREATE DATABASE IF NOT EXISTS corpus CHARACTER SET utf8mb4;
USE corpus;

-- DDL: create / alter / truncate / drop across the run.
CREATE TABLE types_all (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  i_signed      INT,
  big           BIGINT,
  big_unsigned  BIGINT UNSIGNED,
  dec_num       DECIMAL(18,4),
  f_float       FLOAT,
  d_double      DOUBLE,
  c_char        CHAR(8),
  v_varchar     VARCHAR(255),
  v_utf8        VARCHAR(64) CHARACTER SET utf8mb4,
  d_date        DATE,
  dt_datetime   DATETIME,
  ts_stamp      TIMESTAMP NULL,
  b_blob        BLOB,
  t_text        TEXT,
  e_enum        ENUM('a','b','c'),
  s_set         SET('x','y','z')
) ENGINE=InnoDB;

-- Single-row INSERT with a representative value in every column.
INSERT INTO types_all
  (i_signed,big,big_unsigned,dec_num,f_float,d_double,c_char,v_varchar,v_utf8,
   d_date,dt_datetime,ts_stamp,b_blob,t_text,e_enum,s_set)
VALUES
  (-42, 9223372036854775807, 18446744073709551615, 12345.6789, 3.14, 2.718281828,
   'fixedch', 'hello varchar', '日本語テスト', '2024-01-15', '2024-01-15 12:34:56',
   '2024-01-15 12:34:56', x'DEADBEEF', 'lorem ipsum text', 'b', 'x,z');

-- NULLs across nullable columns.
INSERT INTO types_all (i_signed, v_varchar, dt_datetime, e_enum) VALUES (NULL, NULL, NULL, NULL);

-- Multi-row INSERT (single WRITE_ROWS event with many rows).
INSERT INTO types_all (i_signed, v_varchar) VALUES
  (1,'r1'),(2,'r2'),(3,'r3'),(4,'r4'),(5,'r5'),(6,'r6'),(7,'r7'),(8,'r8');

-- UPDATE (before/after images) and DELETE.
UPDATE types_all SET v_varchar = CONCAT(v_varchar, '-upd') WHERE i_signed BETWEEN 1 AND 4;
DELETE FROM types_all WHERE i_signed IN (7, 8);

-- An explicit multi-statement transaction (one GTID-bounded txn, many events).
START TRANSACTION;
INSERT INTO types_all (i_signed, v_varchar) VALUES (100,'txn-a'),(101,'txn-b');
UPDATE types_all SET dec_num = 0 WHERE i_signed = 100;
COMMIT;

-- A rolled-back transaction (no row events should survive to the committed log).
START TRANSACTION;
INSERT INTO types_all (i_signed, v_varchar) VALUES (200,'rollback-me');
ROLLBACK;

-- DDL mutation mid-stream + truncate.
ALTER TABLE types_all ADD COLUMN added_col VARCHAR(16) NULL;
TRUNCATE TABLE types_all;

-- NOTE: no FLUSH here — version-gated feature workloads are appended AFTER this
-- file, and the generator issues a single FLUSH BINARY LOGS at the very end so
-- ALL events (base + features) land in mysql-bin.000001 (the file it copies out).
-- A FLUSH here would roll to .000002 and the feature events would be lost.
