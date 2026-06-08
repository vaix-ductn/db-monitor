#!/usr/bin/env bash
#
# DB Monitor — standalone installer for Ubuntu (no Docker).
#
# Installs Node.js (if missing), dependencies, a config file, verifies the
# MySQL connection, then registers and starts a systemd service.
#
# Usage:
#   chmod +x install.sh
#   ./install.sh          # interactive — prompts for DB connection on first run
#
# Re-running is safe: it keeps an existing config.json and just updates deps/service.

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="db-monitor"
NODE_MAJOR=20

say()  { printf "\033[0;36m%s\033[0m\n" "$*"; }
ok()   { printf "\033[0;32m%s\033[0m\n" "$*"; }
warn() { printf "\033[0;33m%s\033[0m\n" "$*"; }
err()  { printf "\033[0;31m%s\033[0m\n" "$*"; }

# ---------------------------------------------------------------------------
# 1. Node.js
# ---------------------------------------------------------------------------
if command -v node >/dev/null 2>&1; then
  ok "[1/6] Node.js already installed: $(node -v)"
else
  say "[1/6] Installing Node.js ${NODE_MAJOR}.x ..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
  ok "      Node.js installed: $(node -v)"
fi

# ---------------------------------------------------------------------------
# 2. config.json
# ---------------------------------------------------------------------------
if [ -f "$APP_DIR/config.json" ]; then
  ok "[2/6] config.json already exists — keeping it."
else
  say "[2/6] Creating config.json (enter your DB server details) ..."
  read -rp "  MySQL host [127.0.0.1]: " DB_HOST; DB_HOST=${DB_HOST:-127.0.0.1}
  read -rp "  MySQL port [3306]: " DB_PORT; DB_PORT=${DB_PORT:-3306}
  read -rp "  MySQL user [cdc_user]: " DB_USER; DB_USER=${DB_USER:-cdc_user}
  read -rsp "  MySQL password: " DB_PASS; echo
  read -rp "  Dashboard port [3001]: " APP_PORT; APP_PORT=${APP_PORT:-3001}
  node -e '
    const fs = require("fs");
    const [host, port, user, password, appPort] = process.argv.slice(1);
    const c = { mysql: { host, port: +port, user, password, serverId: 100 },
                server: { port: +appPort, maxEvents: 500 } };
    fs.writeFileSync(process.env.APP_DIR + "/config.json", JSON.stringify(c, null, 2));
  ' "$DB_HOST" "$DB_PORT" "$DB_USER" "$DB_PASS" "$APP_PORT"
  ok "      config.json written."
fi
export APP_DIR

# ---------------------------------------------------------------------------
# 3. Dependencies
# ---------------------------------------------------------------------------
say "[3/6] Installing npm dependencies ..."
( cd "$APP_DIR" && npm install --omit=dev )
ok "      Dependencies installed."

# ---------------------------------------------------------------------------
# 4. Verify MySQL connection / binlog / grants
# ---------------------------------------------------------------------------
say "[4/6] Verifying MySQL connection & CDC prerequisites ..."
if ! ( cd "$APP_DIR" && node verify.js ); then
  err "      Verification failed — fix the issues above, then re-run ./install.sh"
  exit 1
fi

# ---------------------------------------------------------------------------
# 5. systemd service
# ---------------------------------------------------------------------------
say "[5/6] Installing systemd service '${SERVICE_NAME}' ..."
NODE_BIN="$(command -v node)"
SERVICE_USER="${SUDO_USER:-$USER}"
sudo tee "/etc/systemd/system/${SERVICE_NAME}.service" >/dev/null <<EOF
[Unit]
Description=DB Monitor — CDC Dashboard
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${APP_DIR}
ExecStart=${NODE_BIN} ${APP_DIR}/app.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable "${SERVICE_NAME}" >/dev/null 2>&1 || true
sudo systemctl restart "${SERVICE_NAME}"
ok "      Service enabled and started."

# ---------------------------------------------------------------------------
# 6. Health check
# ---------------------------------------------------------------------------
say "[6/6] Health check ..."
APP_PORT="$(node -e "console.log((require('$APP_DIR/config.json').server||{}).port||3001)")"
sleep 3
if curl -fsS "http://localhost:${APP_PORT}/events" >/dev/null 2>&1; then
  ok ""
  ok "================================================"
  ok " DB Monitor is running"
  ok "================================================"
  ok " Dashboard: http://localhost:${APP_PORT}"
  ok " Logs:      sudo journalctl -u ${SERVICE_NAME} -f"
  ok " Stop:      sudo systemctl stop ${SERVICE_NAME}"
  ok "================================================"
else
  warn "Service started but health check failed."
  warn "Check logs: sudo journalctl -u ${SERVICE_NAME} -n 50"
  exit 1
fi
