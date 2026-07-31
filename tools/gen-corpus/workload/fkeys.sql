-- feature: fkeys — parent/child with ON DELETE CASCADE; the parent delete's child
-- cascade-deletes are applied by InnoDB and are NOT written to the binlog.
USE corpus;
CREATE TABLE fk_parent (id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, label VARCHAR(32)) ENGINE=InnoDB;
CREATE TABLE fk_child  (id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, pid INT UNSIGNED,
  CONSTRAINT fk_child_pid FOREIGN KEY (pid) REFERENCES fk_parent(id) ON DELETE CASCADE) ENGINE=InnoDB;
INSERT INTO fk_parent (label) VALUES ('a'),('b');
INSERT INTO fk_child (pid) VALUES (1),(1),(2);
DELETE FROM fk_parent WHERE id = 1;
