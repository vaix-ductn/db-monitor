# Standalone Monitor — Docker test environment

A self-contained way to verify the standalone monitor **without andescloud**.
It runs a MySQL (binlog enabled, sample schema + `cdc_user` pre-created) and the
monitor itself, both in Docker.

## Run

```bash
cd standalone/test
docker compose -f docker-compose.test.yml up --build
```

Wait until MySQL is healthy and the monitor logs `streaming from test-mysql:3306`.
Then open: **http://localhost:3001**

## Generate change events

In another terminal:

```bash
docker exec cdc-test-mysql mysql -uroot -proot shop -e "
INSERT INTO company (name,email) VALUES ('Vaix Co','contact@vaix.co.jp');
INSERT INTO location (company_id,location_name) VALUES (1,'Tokyo HQ');
UPDATE company SET status='inactive', email='new@vaix.co.jp' WHERE id=1;
DELETE FROM location WHERE id=1;
"
```

The four events appear instantly on the dashboard (INSERT green, UPDATE diff,
DELETE strikethrough). You can also check the API directly:

```bash
curl -s http://localhost:3001/events
```

## Tear down

```bash
docker compose -f docker-compose.test.yml down -v   # -v also wipes the MySQL data
```

## Notes

- Credentials are baked in for testing only: root/`root`, `cdc_user`/`cdc_pass`.
- The monitor here is configured via **environment variables** (see the compose
  file). On a real Ubuntu server you'd use `config.json` + `install.sh` instead.
- This proves the exact same `app.js` works; only the way config is supplied differs.
