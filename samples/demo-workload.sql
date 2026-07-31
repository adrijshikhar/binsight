-- Demo workload for samples/ — deliberately SUBSTANTIAL so the viewer's value is
-- obvious: a multi-MB binlog that populates every tab and trips real anomalies.
-- Synthetic data only. Run by `make sample` against MySQL 8 (the run also sets
-- --binlog-row-event-max-size high so a bulk insert stays one big WRITE_ROWS
-- event, exercising the bulk_row_event detector).
--
-- What it demonstrates:
--   • Metrics/Overview: hundreds of thousands of events, real byte throughput,
--     a multi-second time span (SLEEPs spread commit timestamps across buckets).
--   • Tables: several tables with differing insert/update/delete mixes.
--   • Schema/DDL: CREATE / ALTER / CREATE INDEX / TRUNCATE / DROP churn.
--   • Anomalies: bulk_row_event (>50k rows in one event), huge_txn_rows
--     (>100k rows in one txn), long_txn (>60s open).

SET SESSION cte_max_recursion_depth = 2000000;

CREATE DATABASE IF NOT EXISTS shop CHARACTER SET utf8mb4;
USE shop;

CREATE TABLE customers (
  id      INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name    VARCHAR(80) NOT NULL,
  email   VARCHAR(120),
  country CHAR(2),
  active  TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE products (
  id    INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sku   VARCHAR(24) NOT NULL,
  name  VARCHAR(120) NOT NULL,
  price DECIMAL(10,2) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE orders (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NOT NULL,
  status      VARCHAR(16) NOT NULL DEFAULT 'new',
  total       DECIMAL(12,2) NOT NULL DEFAULT 0,
  created     DATETIME NOT NULL
) ENGINE=InnoDB;

CREATE TABLE order_items (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id   INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  qty        SMALLINT UNSIGNED NOT NULL,
  price      DECIMAL(10,2) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE audit_log (
  id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor   VARCHAR(40) NOT NULL,
  action  VARCHAR(40) NOT NULL,
  detail  VARCHAR(200)
) ENGINE=InnoDB;

-- ---- seed reference data (small, varied) --------------------------------
INSERT INTO products (sku, name, price)
WITH RECURSIVE s(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM s WHERE n < 1000)
SELECT CONCAT('SKU-', LPAD(n,6,'0')), CONCAT('Product ', n), ROUND(1 + RAND()*500, 2) FROM s;

SELECT SLEEP(1);

INSERT INTO customers (name, email, country, active)
WITH RECURSIVE s(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM s WHERE n < 40000)
SELECT CONCAT('Customer ', n), CONCAT('user', n, '@example.com'),
       ELT(1+(n % 5), 'US','GB','IN','DE','JP'), IF(n % 11 = 0, 0, 1) FROM s;

SELECT SLEEP(1);

-- ---- normal order activity, several txns spread over time ----------------
INSERT INTO orders (customer_id, status, total, created)
WITH RECURSIVE s(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM s WHERE n < 120000)
SELECT (n % 40000)+1, ELT(1+(n % 3),'new','paid','shipped'),
       ROUND(RAND()*900,2), NOW() - INTERVAL (n % 30) DAY FROM s;

SELECT SLEEP(2);

UPDATE orders SET status = 'shipped' WHERE id % 3 = 0;   -- ~5k row updates
SELECT SLEEP(1);
DELETE FROM orders WHERE id % 50 = 0;                    -- ~300 row deletes
SELECT SLEEP(2);

-- ---- ANOMALY 1: bulk_row_event — one WRITE_ROWS event with >50k rows ------
START TRANSACTION;
INSERT INTO order_items (order_id, product_id, qty, price)
WITH RECURSIVE s(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM s WHERE n < 350000)
SELECT (n % 120000)+1, (n % 1000)+1, (n % 5)+1, ROUND(RAND()*200,2) FROM s;
COMMIT;

SELECT SLEEP(2);

-- ---- ANOMALY 2: huge_txn_rows — one txn changing >100k rows ---------------
START TRANSACTION;
INSERT INTO audit_log (actor, action, detail)
WITH RECURSIVE s(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM s WHERE n < 350000)
SELECT CONCAT('svc-', n % 20), 'import', CONCAT('row ', n) FROM s;
UPDATE audit_log SET action = 'import-verified';          -- ~350k row updates
COMMIT;                                                    -- ~700k rows total

SELECT SLEEP(2);

-- ---- ANOMALY 3: long_txn — a transaction held open > 60s -----------------
START TRANSACTION;
INSERT INTO audit_log (actor, action, detail) VALUES ('cron','nightly-batch','start');
SELECT SLEEP(62);
INSERT INTO audit_log (actor, action, detail) VALUES ('cron','nightly-batch','end');
COMMIT;

-- ---- schema churn (Schema/DDL view + schema_churn detector) --------------
ALTER TABLE customers ADD COLUMN loyalty_tier VARCHAR(16) NOT NULL DEFAULT 'bronze';
ALTER TABLE orders   ADD COLUMN shipped_at DATETIME NULL;
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_items_order      ON order_items(order_id);
TRUNCATE TABLE audit_log;
CREATE TABLE scratch (id INT PRIMARY KEY);
DROP TABLE scratch;

FLUSH BINARY LOGS;
