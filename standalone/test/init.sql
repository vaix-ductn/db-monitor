-- Test fixtures: a CDC user + a sample schema to generate change events against.
-- Runs automatically on first container start (docker-entrypoint-initdb.d).

CREATE USER IF NOT EXISTS 'cdc_user'@'%' IDENTIFIED WITH mysql_native_password BY 'cdc_pass';
GRANT REPLICATION SLAVE, REPLICATION CLIENT, SELECT ON *.* TO 'cdc_user'@'%';
FLUSH PRIVILEGES;

USE shop;

CREATE TABLE IF NOT EXISTS company (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  email      VARCHAR(100),
  status     VARCHAR(20) DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS location (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  company_id    INT,
  location_name VARCHAR(100),
  update_dt     DATETIME DEFAULT CURRENT_TIMESTAMP
);
