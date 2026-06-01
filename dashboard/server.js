// CDC Monitor — Dashboard server
// Single Node.js service: REST API + WebSocket + static dashboard, all on one port.
// Replaces the previous Python FastAPI backend + React/nginx frontend.

const express = require('express')
const http = require('http')
const path = require('path')
const { WebSocketServer } = require('ws')
const Redis = require('ioredis')

const REDIS_HOST = process.env.REDIS_HOST || 'cdc-redis'
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10)
const PORT = parseInt(process.env.PORT || '3001', 10)

// Two connections: one for commands (lrange/get), one dedicated to pub/sub.
const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT })
const sub = new Redis({ host: REDIS_HOST, port: REDIS_PORT })

const app = express()

// Latest captured events (newest first, capped at 500 by the reader).
app.get('/events', async (_req, res) => {
  try {
    const items = await redis.lrange('db_events', 0, 499)
    res.json(items.map(i => JSON.parse(i)))
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// Map of { database: [tables...] } for the filter dropdowns.
app.get('/schema', async (_req, res) => {
  try {
    const data = await redis.get('db_schema')
    res.json(data ? JSON.parse(data) : {})
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// Serve the Alpine.js dashboard (single static HTML file).
app.use(express.static(path.join(__dirname, 'public')))

const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

// Broadcast every Redis pub/sub message to all connected dashboard clients.
const clients = new Set()
wss.on('connection', (ws) => {
  clients.add(ws)
  ws.on('close', () => clients.delete(ws))
  ws.on('error', () => clients.delete(ws))
})

sub.subscribe('db_changes', (err) => {
  if (err) console.error('[Dashboard] Redis subscribe error:', err)
  else console.log('[Dashboard] Subscribed to db_changes')
})
sub.on('message', (_channel, message) => {
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(message)
  }
})

server.listen(PORT, () => {
  console.log(`[Dashboard] Listening on :${PORT} (Redis ${REDIS_HOST}:${REDIS_PORT})`)
})
