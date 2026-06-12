// DB Monitor — standalone single-service CDC dashboard.
//
// One Node.js process does everything:
//   - reads the MySQL binary log directly (zongji)         → no Debezium / Kafka
//   - keeps recent events in memory (ring buffer)          → no Redis
//   - serves REST API + WebSocket + static UI on one port  → no nginx
//
// Configuration is read from config.json (see config.example.json).

const path = require('path')
const fs = require('fs')
const http = require('http')
const express = require('express')
const { WebSocketServer } = require('ws')
const mysql = require('mysql2/promise')
let ZongJi // loaded via dynamic import() — require(ESM) only works on Node ≥ 20.19; dynamic import() works on all Node 18+

// ---- config ----
const CONFIG_PATH = process.env.CDC_CONFIG || path.join(__dirname, 'config.json')
const config = loadConfig()
const DB = config.mysql

// config.json takes priority; otherwise fall back to env vars (handy in Docker).
function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  if (process.env.MYSQL_HOST) {
    return {
      mysql: {
        host: process.env.MYSQL_HOST,
        port: parseInt(process.env.MYSQL_PORT || '3306', 10),
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        serverId: parseInt(process.env.SERVER_ID || '100', 10),
      },
      server: {
        port: parseInt(process.env.PORT || '3001', 10),
        maxEvents: parseInt(process.env.MAX_EVENTS || '500', 10),
      },
    }
  }
  console.error(`[config] No ${CONFIG_PATH} and no MYSQL_HOST env var. ` +
                `Copy config.example.json → config.json, or set MYSQL_* env vars.`)
  process.exit(1)
}
const PORT = (config.server && config.server.port) || 3001
const MAX_EVENTS = (config.server && config.server.maxEvents) || 500
const SERVER_ID = DB.serverId || 100

const EXCLUDED_SCHEMAS = new Set(['mysql', 'information_schema', 'performance_schema', 'sys'])

// ---- in-memory event buffer (newest first) ----
const events = []
let nextId = 0

function pushEvent(ev) {
  ev._id = ++nextId
  events.unshift(ev)
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS
  broadcast(ev)
}

// ---- web server: REST + static UI ----
const app = express()
app.get('/events', (_req, res) => res.json(events))
app.get('/schema', (_req, res) => res.json(schemaCache))
app.use(express.static(path.join(__dirname, 'public')))

const server = http.createServer(app)

// ---- WebSocket: realtime push ----
const wss = new WebSocketServer({ server, path: '/ws' })
const clients = new Set()
wss.on('connection', (ws) => {
  clients.add(ws)
  ws.on('close', () => clients.delete(ws))
})
function broadcast(ev) {
  const msg = JSON.stringify(ev)
  for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(msg)
}

// ---- schema cache (for database/table filters) ----
let schemaCache = {}
async function refreshSchema() {
  try {
    const conn = await mysql.createConnection({
      host: DB.host, port: DB.port || 3306, user: DB.user, password: DB.password,
    })
    const [rows] = await conn.query(
      `SELECT TABLE_SCHEMA, TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_TYPE = 'BASE TABLE'
         AND TABLE_SCHEMA NOT IN ('mysql','information_schema','performance_schema','sys')
       ORDER BY TABLE_SCHEMA, TABLE_NAME`
    )
    const s = {}
    for (const r of rows) (s[r.TABLE_SCHEMA] = s[r.TABLE_SCHEMA] || []).push(r.TABLE_NAME)
    schemaCache = s
    await conn.end()
  } catch (e) {
    console.error('[schema] refresh failed:', e.message)
  }
}

// ---- binlog reader ----
function fmtTime(ms) {
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
         `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

let zongji = null
let reconnecting = false
function scheduleReconnect() {
  if (reconnecting) return // a reconnect is already pending; ignore error storms
  reconnecting = true
  console.error('[binlog] reconnecting in 5s...')
  setTimeout(() => { reconnecting = false; startBinlog() }, 5000)
}
function startBinlog() {
  zongji = new ZongJi({
    host: DB.host, port: DB.port || 3306, user: DB.user, password: DB.password,
  })

  zongji.on('binlog', (evt) => {
    const name = evt.getEventName()
    if (name !== 'writerows' && name !== 'updaterows' && name !== 'deleterows') return
    const table = evt.tableMap[evt.tableId]
    if (!table || EXCLUDED_SCHEMAS.has(table.parentSchema)) return

    const base = {
      timestamp: fmtTime(evt.timestamp),
      database: table.parentSchema,
      table: table.tableName,
    }
    if (name === 'writerows') {
      for (const row of evt.rows) pushEvent({ ...base, operation: 'c', after: row })
    } else if (name === 'updaterows') {
      for (const row of evt.rows) pushEvent({ ...base, operation: 'u', before: row.before, after: row.after })
    } else if (name === 'deleterows') {
      for (const row of evt.rows) pushEvent({ ...base, operation: 'd', before: row })
    }
  })

  zongji.on('error', (err) => {
    console.error('[binlog] error:', err && err.message ? err.message : err)
    try { zongji.stop() } catch (_) {}
    scheduleReconnect()
  })

  zongji.start({
    serverId: SERVER_ID,
    startAtEnd: true, // only new changes from now on; we don't replay history
    includeEvents: ['tablemap', 'writerows', 'updaterows', 'deleterows', 'rotate'],
  })
  console.log(`[binlog] streaming from ${DB.host}:${DB.port || 3306} (all databases)`)
}

// ---- boot ----
// Dynamic import required because @vlasky/zongji 0.6.x is ESM-only.
// require(ESM) is blocked on Node 18; dynamic import() works on Node 18+.
;(async () => {
  const mod = await import('@vlasky/zongji')
  ZongJi = mod.default
  server.listen(PORT, () => {
    console.log(`[web] dashboard on http://localhost:${PORT}`)
    refreshSchema()
    setInterval(refreshSchema, 60000)
    startBinlog()
  })
})()
