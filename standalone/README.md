# DB Monitor — Standalone (no Docker)

A single Node.js service that monitors **all** INSERT / UPDATE / DELETE events on a
MySQL server in real-time and shows them on a web dashboard.

This is the **standalone** variant — designed to run on a plain Ubuntu server **without
Docker and without Redis**. The binlog reader, REST API, WebSocket, and the UI all run
inside one Node.js process.

```
┌──────────────┐                         ┌──────────────────────────────────────┐
│  MySQL server│  ── binlog (network) ──▶│            db-monitor (Node.js)        │
│  (anywhere)  │                         │  zongji  → reads binary log            │
└──────────────┘                         │  express → REST API + static UI        │
                                         │  ws      → realtime push to browser    │
                                         │  events[]→ in-memory buffer (no Redis) │
                                         └──────────────────────────────────────┘
                                                          │
                                                http://<server>:3001
```

---

## How it finds the database

There is **no auto-discovery** — the binlog protocol requires explicit host, port, user,
and password (and a privileged replication user). You provide them in **`config.json`**:

```json
{
  "mysql": { "host": "10.0.0.5", "port": 3306, "user": "cdc_user", "password": "secret", "serverId": 100 },
  "server": { "port": 3001, "maxEvents": 500 }
}
```

The MySQL server can be **on the same machine or anywhere reachable over the network** —
only `mysql.host` changes. The included `verify.js` checks the connection, binlog config,
and grants before the service starts, and prints the exact SQL to fix anything missing.

---

## Requirements

- Ubuntu (or any Linux with `systemd`)
- A reachable MySQL server with binary logging in **ROW** format
- A MySQL user with `REPLICATION SLAVE`, `REPLICATION CLIENT`, and `SELECT`

> Node.js is installed automatically by `install.sh` if it is missing.

---

## Install

```bash
# on the monitoring server
cd standalone
chmod +x install.sh
./install.sh
```

The installer will:
1. Install Node.js 20.x if not present
2. Prompt for the DB connection and write `config.json` (first run only)
3. `npm install` dependencies
4. **Verify** the MySQL connection, binlog settings, and grants
5. Register a `systemd` service (`db-monitor`) and start it
6. Health-check `http://localhost:<port>/events`

Then open: **http://&lt;server-ip&gt;:3001**

---

## Prepare the MySQL server (one time)

On the **database server**, enable binary logging in `/etc/mysql/my.cnf` under `[mysqld]`:

```ini
server-id        = 1
log_bin          = mysql-bin
binlog_format    = ROW
binlog_row_image = FULL
```

Restart MySQL, then create the monitoring user:

```sql
CREATE USER 'cdc_user'@'%' IDENTIFIED BY 'secret';
GRANT REPLICATION SLAVE, REPLICATION CLIENT, SELECT ON *.* TO 'cdc_user'@'%';
FLUSH PRIVILEGES;
```

> `SELECT` is needed so the reader can resolve real column names.
> Unlike the Docker variant, **no `SYSTEM_VARIABLES_ADMIN` is required** — zongji reads
> the table schema itself instead of changing server variables.

---

## Manage the service

```bash
sudo systemctl status db-monitor      # check status
sudo systemctl restart db-monitor     # restart
sudo systemctl stop db-monitor        # stop
sudo journalctl -u db-monitor -f      # live logs
```

To re-check the DB connection at any time:

```bash
node verify.js
```

---

## Dashboard

| Column | Description |
|---|---|
| Timestamp | When the change was captured (`yyyy/MM/dd HH:mm:ss`) |
| Table | Affected table |
| Operation | `INSERT` / `UPDATE` / `DELETE` |
| Fields | Number of fields changed |
| Detail | Inline view of the changed values |

- **Detail mode** — `Full` (default) shows all fields; `Collapse` shows up to 3. Click a row to toggle it individually.
- **Filters** — operation, database, table, and keyword search.
- **Visual cues** — INSERT in green, UPDATE as `before → after`, DELETE in red with strikethrough.
- **Clear** — clears the screen without stopping capture.

Events are kept **in memory** (default 500). They reset when the service restarts — this
variant is for live observation, not long-term storage.

---

## Files

```
standalone/
├── app.js               # the whole service: binlog reader + API + WebSocket + UI
├── verify.js            # connection / binlog / grants checker
├── config.example.json  # copy → config.json
├── install.sh           # Ubuntu installer (Node.js + deps + systemd)
├── package.json
└── public/
    └── index.html       # Alpine.js dashboard
```
