// DB Monitor — connectivity & prerequisite checker.
// Run with: node verify.js   (or: npm run verify)
// Validates that the configured MySQL server is reachable and ready for CDC.

const path = require('path')
const fs = require('fs')
const mysql = require('mysql2/promise')

const CONFIG_PATH = process.env.CDC_CONFIG || path.join(__dirname, 'config.json')
let cfg
if (fs.existsSync(CONFIG_PATH)) {
  cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
} else if (process.env.MYSQL_HOST) {
  cfg = { mysql: {
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
  } }
} else {
  console.error(`config.json not found at ${CONFIG_PATH} and no MYSQL_HOST env var`)
  process.exit(1)
}

const RED = '\x1b[31m', GREEN = '\x1b[32m', YEL = '\x1b[33m', RESET = '\x1b[0m'
const ok   = (m) => console.log(`${GREEN}  ✓ ${m}${RESET}`)
const bad  = (m) => console.log(`${RED}  ✗ ${m}${RESET}`)
const info = (m) => console.log(`${YEL}  • ${m}${RESET}`)

async function main() {
  const m = cfg.mysql
  let conn
  try {
    conn = await mysql.createConnection({ host: m.host, port: m.port || 3306, user: m.user, password: m.password })
  } catch (e) {
    bad(`Cannot connect to MySQL ${m.host}:${m.port || 3306} as ${m.user} — ${e.message}`)
    process.exit(1)
  }
  ok(`Connected to MySQL ${m.host}:${m.port || 3306} as ${m.user}`)

  let failed = false

  const [[logbin]] = await conn.query("SHOW VARIABLES LIKE 'log_bin'")
  if (logbin && logbin.Value === 'ON') ok('Binary logging enabled (log_bin = ON)')
  else { bad('Binary logging is OFF'); failed = true }

  const [[fmt]] = await conn.query("SHOW VARIABLES LIKE 'binlog_format'")
  if (fmt && String(fmt.Value).toUpperCase() === 'ROW') ok('binlog_format = ROW')
  else { bad(`binlog_format = ${fmt ? fmt.Value : '?'} (must be ROW)`); failed = true }

  const [grants] = await conn.query('SHOW GRANTS')
  const all = grants.map((r) => Object.values(r)[0]).join('\n').toUpperCase()
  const hasRepl = all.includes('REPLICATION SLAVE') && all.includes('REPLICATION CLIENT')
  const hasAll = all.includes('ALL PRIVILEGES')
  if (hasRepl || hasAll) ok('User has REPLICATION SLAVE + REPLICATION CLIENT')
  else { bad('Missing REPLICATION SLAVE / REPLICATION CLIENT privileges'); failed = true }

  const [dbs] = await conn.query(
    "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA " +
    "WHERE SCHEMA_NAME NOT IN ('mysql','information_schema','performance_schema','sys')"
  )
  info(`Databases that will be monitored: ${dbs.map((d) => d.SCHEMA_NAME).join(', ') || '(none)'}`)

  await conn.end()

  if (failed) {
    console.log(`\n${YEL}To grant privileges, run on the DB server as root:${RESET}`)
    console.log(`  GRANT REPLICATION SLAVE, REPLICATION CLIENT, SELECT ON *.* TO '${m.user}'@'%';`)
    console.log(`  FLUSH PRIVILEGES;`)
    console.log(`\n${YEL}To enable binlog, add to my.cnf [mysqld] and restart MySQL:${RESET}`)
    console.log(`  server-id        = 1`)
    console.log(`  log_bin          = mysql-bin`)
    console.log(`  binlog_format    = ROW`)
    console.log(`  binlog_row_image = FULL`)
    process.exit(1)
  }
  console.log(`\n${GREEN}All checks passed — ready to start.${RESET}`)
}

main().catch((e) => { bad(e.message); process.exit(1) })
