# DB Monitor — CDC Dashboard

Lightweight Change Data Capture (CDC) system for MySQL databases.  
Monitors all INSERT / UPDATE / DELETE events in real-time and displays them on a web dashboard.

---

## Architecture

```
MySQL binlog
    │
    ▼
┌─────────────┐     Redis Pub/Sub     ┌──────────────┐     WebSocket     ┌──────────────┐
│  cdc-reader │ ──────────────────▶  │  cdc-backend │ ────────────────▶ │ cdc-frontend │
│  (Python)   │                      │  (FastAPI)   │                   │  (React)     │
└─────────────┘                      └──────────────┘                   └──────────────┘
```

| Service | Role | Technology |
|---|---|---|
| `cdc-reader` | Reads MySQL binary log, publishes events to Redis | Python + pymysqlreplication |
| `cdc-redis` | Event message broker | Redis 7 |
| `cdc-backend` | WebSocket API server, serves events to frontend | FastAPI |
| `cdc-frontend` | Real-time dashboard UI | React 18 + Vite + Tailwind CSS |

**RAM footprint: ~115 MB** (replaces Debezium + Kafka + Zookeeper stack which requires ~1.5 GB)

---

## Requirements

- Docker Desktop
- Docker Compose v2
- PowerShell 5.1+ (Windows)
- The project's `docker-compose.yaml` must define a MySQL service named `db` with container name `andes_cloud_db`

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
│   ├── backend/
│   └── frontend/
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
docker exec andes_cloud_app python manage.py migrate
```

### 4. Open the dashboard

```
http://localhost:3001
```

---

## Dashboard

![Dashboard](https://raw.githubusercontent.com/vaix-ductn/db-monitor/main/docs/dashboard-preview.png)

| Column | Description |
|---|---|
| Timestamp | UTC time when the event was captured |
| Table | Database table affected |
| Operation | `INSERT` / `UPDATE` / `DELETE` / `SNAPSHOT` |
| Fields | Number of fields in the record |
| Detail | Inline diff — shows changed field values directly in the row |

**Filtering:**
- Filter by operation type (INSERT / UPDATE / DELETE / SNAPSHOT)
- Filter by table name (populated dynamically from live events)
- Keyword search across all fields

**Event detail panel:** Click any row to open a side panel with the full before/after JSON and a structured diff view.

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
$DB_CONTAINER = "andes_cloud_db"   # MySQL container name
$DB_ROOT_PASS = "andes_cloud"      # MySQL root password
$DB_USER      = "andes_cloud"      # MySQL user monitored by cdc-reader
```

The `cdc-reader` service reads these environment variables (set in `docker-compose.monitor.yml`):

| Variable | Default | Description |
|---|---|---|
| `MYSQL_HOST` | `db` | MySQL service name in Docker network |
| `MYSQL_PORT` | `3306` | MySQL port |
| `MYSQL_USER` | `andes_cloud` | MySQL user |
| `MYSQL_PASSWORD` | `andes_cloud` | MySQL password |
| `MYSQL_DATABASE` | `andes_cloud` | Database to monitor (all tables) |
| `REDIS_HOST` | `cdc-redis` | Redis service name |

---

## Ports

| Service | Port | URL |
|---|---|---|
| Dashboard (frontend) | `3001` | http://localhost:3001 |
| API (backend) | `8099` | http://localhost:8099/events |

---

## MySQL Requirements

The MySQL user needs the following privileges (applied automatically by `start.ps1`):

```sql
GRANT REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'andes_cloud'@'%';
GRANT SYSTEM_VARIABLES_ADMIN ON *.* TO 'andes_cloud'@'%';
```

MySQL binary logging is enabled via Docker Compose command override:

```yaml
db:
  command:
    - --server-id=1
    - --log-bin=mysql-bin
    - --binlog-format=ROW
    - --binlog-row-image=FULL
```

---

## Troubleshooting

### Dashboard shows no events

Check `cdc-reader` status:

```powershell
docker ps --filter name=cdc-reader
docker logs cdc-reader --tail 30
```

Common causes:

| Error | Cause | Fix |
|---|---|---|
| `No module named 'mysql_replication'` | Old import name (library changed in v1.0) | Rebuild image: `docker compose ... build cdc-reader` |
| `Access denied; REPLICATION CLIENT privilege` | Grants not applied | Re-run `.\monitor\start.ps1` |
| `Access denied; SUPER privilege` | Missing `SYSTEM_VARIABLES_ADMIN` | Re-run `.\monitor\start.ps1` |
| `cdc-reader` keeps restarting | MySQL not ready yet | Wait 30s and check logs again |

### Force rebuild all monitor images

```powershell
docker compose -f docker-compose.yaml -f monitor/docker-compose.monitor.yml build --no-cache
docker compose -f docker-compose.yaml -f monitor/docker-compose.monitor.yml up -d
```

---

## Project Structure

```
monitor/
├── docker-compose.monitor.yml   # Compose overlay (adds binlog to db, adds 4 monitor services)
├── start.ps1                    # Start script with auto MySQL grant
├── stop.ps1                     # Stop monitor services only
├── reader/
│   ├── reader.py                # Binlog reader — publishes CDC events to Redis
│   ├── requirements.txt
│   └── Dockerfile
├── backend/
│   ├── app.py                   # FastAPI WebSocket server
│   ├── requirements.txt
│   └── Dockerfile
└── frontend/
    ├── src/
    │   ├── App.tsx
    │   ├── components/
    │   │   ├── EventTable.tsx   # Main event list with inline diff column
    │   │   ├── EventDetail.tsx  # Side panel with full before/after JSON
    │   │   ├── DiffViewer.tsx   # Field-level diff renderer
    │   │   └── FilterBar.tsx    # Operation / table / keyword filters
    │   └── hooks/
    │       ├── useEvents.ts     # Event state + filtering logic
    │       └── useWebSocket.ts  # WebSocket connection to backend
    ├── package.json
    ├── vite.config.ts
    └── Dockerfile
```
