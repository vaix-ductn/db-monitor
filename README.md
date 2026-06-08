# DB Monitor — CDC Dashboard

Lightweight Change Data Capture (CDC) system for MySQL databases.  
Monitors all INSERT / UPDATE / DELETE events in real-time and displays them on a web dashboard.

---

## Architecture

```
MySQL binlog
    │
    ▼
┌─────────────┐    Redis Pub/Sub    ┌─────────────┐    WebSocket / REST    ┌───────────────────────────────┐
│  cdc-reader │ ─────────────────▶ │  cdc-redis  │ ──────────────────────▶│         cdc-dashboard         │
│  (Python)   │                    │  (broker)   │                        │  Express + ws + Alpine.js     │
└─────────────┘                    └─────────────┘                        │  (API + WebSocket + UI :3001) │
                                                                          └───────────────────────────────┘
```

| Service | Role | Technology |
|---|---|---|
| `cdc-reader` | Reads MySQL binary log, publishes events to Redis | Python + pymysqlreplication |
| `cdc-redis` | Event message broker — stores history + real-time push | Redis 7 |
| `cdc-dashboard` | REST API + WebSocket + dashboard UI, all on one port | Node.js (Express + ws + ioredis) + Alpine.js |

**RAM footprint: ~75 MB** (replaces Debezium + Kafka + Zookeeper stack which requires ~1.5 GB).
The dashboard uses a single Node.js service with no build step and no nginx — the UI is a
static Alpine.js page served directly by Express.

---

## Requirements

- Docker Desktop
- Docker Compose v2
- PowerShell 5.1+ (Windows)
- The project's `docker-compose.yaml` must define a MySQL service named `db` with container name `myapp_db`

---

## Quick Start

### 1. Copy the `monitor` folder into the project root

```
your-project/
├── docker-compose.yaml        ← existing project compose file
├── monitor/                   ← copy this folder here
│   ├── docker-compose.monitor.yml
│   ├── start.ps1
│   ├── stop.ps1
│   ├── reader/
│   └── dashboard/
└── ...
```

### 2. Run from the project root

```powershell
.\monitor\start.ps1
```

The script will:
1. Start all services (`docker compose` overlay)
2. Wait for MySQL to be ready
3. Automatically apply required MySQL grants for CDC
4. Restart `cdc-reader` to activate the connection

> **Note:** The first run recreates the `db` container to enable MySQL binary logging.  
> Existing data in the container will be lost — run Django migrations after start.

### 3. Run Django migrations (first run only)

```powershell
docker exec myapp_app python manage.py migrate
```

### 4. Open the dashboard

```
http://localhost:3001
```

---

## Dashboard

| Column | Description |
|---|---|
| Timestamp | Time when the event was captured (`yyyy/MM/dd HH:mm:ss`) |
| Table | Database table affected |
| Operation | `INSERT` / `UPDATE` / `DELETE` / `SNAPSHOT` |
| Fields | Number of fields changed |
| Detail | Inline view of changed field values |

**Filtering:**
- Filter by operation type (INSERT / UPDATE / DELETE / SNAPSHOT)
- Filter by database (populated from live schema)
- Filter by table (populated from live schema, scoped to selected database)
- Keyword search across all fields

**Detail modes:**
- **Full** (default) — shows all field values inline; UPDATE also shows Changes diff + Before/After JSON accordion
- **Collapse** — shows up to 3 fields inline with a "+N more" indicator
- Click any row to toggle that row's mode individually

**Visual cues:**
- `INSERT` fields shown in green
- `UPDATE` changed fields shown as `before → after` with strikethrough on old value
- `DELETE` fields shown in red with strikethrough to indicate removed data

**Clear button:** Clears the screen without stopping the monitor (new events keep streaming in).

---

## Stop Monitor

To stop only the monitor services (DB and main app keep running):

```powershell
.\monitor\stop.ps1
```

---

## Configuration

Key settings are defined at the top of `start.ps1`:

```powershell
$DB_CONTAINER = "myapp_db"         # MySQL container name
$DB_ROOT_PASS = "rootpassword"     # MySQL root password
$DB_USER      = "dbuser"           # MySQL user monitored by cdc-reader
```

The `cdc-reader` service reads these environment variables (set in `docker-compose.monitor.yml`):

| Variable | Default | Description |
|---|---|---|
| `MYSQL_HOST` | `db` | MySQL service name in Docker network |
| `MYSQL_PORT` | `3306` | MySQL port |
| `MYSQL_USER` | `dbuser` | MySQL user |
| `MYSQL_PASSWORD` | `dbpassword` | MySQL password |
| `MYSQL_DATABASE` | `myapp` | Used for connection only — all databases are monitored |
| `REDIS_HOST` | `cdc-redis` | Redis service name |

---

## Ports

All served by the single `cdc-dashboard` service on one port:

| What | Port | URL |
|---|---|---|
| Dashboard UI | `3001` | http://localhost:3001 |
| REST API | `3001` | http://localhost:3001/events · http://localhost:3001/schema |
| WebSocket | `3001` | ws://localhost:3001/ws |

---

## MySQL Requirements

The MySQL user needs the following privileges (applied automatically by `start.ps1`):

```sql
GRANT REPLICATION SLAVE, REPLICATION CLIENT, SELECT ON *.* TO 'dbuser'@'%';
FLUSH PRIVILEGES;
```

> `SELECT ON *.*` is required so `cdc-reader` can query `information_schema.COLUMNS` to
> resolve real column names. Without it, all columns appear as `UNKNOWN_COLx`.

MySQL binary logging is enabled via Docker Compose command override:

```yaml
db:
  command:
    - --server-id=1
    - --log-bin=mysql-bin
    - --binlog-format=ROW
    - --binlog-row-image=FULL
```

> Compatible with **MySQL 5.7 and MySQL 8.0**. The `--binlog-row-metadata=FULL` option
> was removed — it is MySQL 8.0+ only and causes MySQL 5.7 containers to fail to start.

---

## Troubleshooting

### Dashboard shows no events

Check `cdc-reader` and `cdc-dashboard` status:

```powershell
docker ps --filter name=cdc
docker logs cdc-reader --tail 30
docker logs cdc-dashboard --tail 30
```

Common causes:

| Error | Cause | Fix |
|---|---|---|
| `No module named 'mysql_replication'` | Old import name (library changed in v1.0) | Rebuild image: `docker compose ... build cdc-reader` |
| `Access denied; REPLICATION CLIENT privilege` | Grants not applied | Re-run `.\monitor\start.ps1` |
| `Access denied; SUPER privilege` | Missing `SYSTEM_VARIABLES_ADMIN` | Re-run `.\monitor\start.ps1` |
| `cdc-reader` keeps restarting | MySQL not ready yet | Wait 30s and check logs again |
| Dashboard loads but no events / WebSocket fails | `cdc-dashboard` can't reach Redis | Check `docker logs cdc-dashboard` for the Redis connection line |
| Column names show as `UNKNOWN_COL0`, `UNKNOWN_COL1` | Missing `SELECT ON *.*` grant for the CDC user | Re-run `.\monitor\start.ps1` to re-apply grants |

### Force rebuild all monitor images

```powershell
docker compose -f docker-compose.yaml -f monitor/docker-compose.monitor.yml build --no-cache
docker compose -f docker-compose.yaml -f monitor/docker-compose.monitor.yml up -d
```

---

## Project Structure

```
monitor/
├── docker-compose.monitor.yml   # Compose overlay (adds binlog to db, adds monitor services)
├── start.ps1                    # Start script with auto MySQL grant
├── stop.ps1                     # Stop monitor services only
├── reader/
│   ├── reader.py                # Binlog reader — publishes CDC events to Redis (all databases)
│   ├── requirements.txt
│   └── Dockerfile
└── dashboard/                   # Single Node.js service (API + WebSocket + UI)
    ├── server.js                # Express + ws + ioredis: /events, /schema, /ws
    ├── package.json
    ├── Dockerfile
    └── public/
        └── index.html           # Alpine.js dashboard (inline diff, filters, collapse/full toggle)
```
