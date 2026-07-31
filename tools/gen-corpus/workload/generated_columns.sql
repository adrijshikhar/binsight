-- feature: generated_columns (MySQL 5.7+) — a STORED and a VIRTUAL generated
-- column. STORED values appear in row images; VIRTUAL ones do not. INSERT +
-- UPDATE of the base columns drives the generated values.
USE corpus;

CREATE TABLE gen_cols (
  id    INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  price DECIMAL(10,2) NOT NULL,
  qty   INT NOT NULL,
  total DECIMAL(20,2) AS (price * qty) STORED,
  label VARCHAR(64)   AS (CONCAT('q', qty)) VIRTUAL
) ENGINE=InnoDB;

INSERT INTO gen_cols (price, qty) VALUES (9.99, 3), (4.50, 10);

-- Updating qty recomputes both generated columns.
UPDATE gen_cols SET qty = 5 WHERE id = 1;
