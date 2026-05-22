# CDC Monitor — Start Script
# Run from your project root (same folder as docker-compose.yaml)
#
# Usage: .\monitor\start.ps1

$ProjectRoot    = Resolve-Path "."
$MonitorCompose = "$ProjectRoot\monitor\docker-compose.monitor.yml"
$MainCompose    = "$ProjectRoot\docker-compose.yaml"
$DB_CONTAINER   = "andes_cloud_db"
$DB_ROOT_PASS   = "andes_cloud"
$DB_USER        = "andes_cloud"

Write-Host "`n================================================" -ForegroundColor Cyan
Write-Host " CDC Monitor — Starting" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

if (-not (Test-Path $MainCompose)) {
    Write-Host "`nERROR: docker-compose.yaml not found at $MainCompose" -ForegroundColor Red
    Write-Host "Run this script from your project root (where docker-compose.yaml is)." -ForegroundColor Yellow
    exit 1
}

Write-Host @"

NOTE: First run will recreate the 'db' container to enable MySQL binlog.
      Any existing data in the db container's ephemeral storage will be lost.
      Django migrations will need to be re-run after first start.

"@ -ForegroundColor Yellow

$confirm = Read-Host "Continue? (y/N)"
if ($confirm -ne 'y' -and $confirm -ne 'Y') {
    Write-Host "Aborted." -ForegroundColor Red
    exit 0
}

Write-Host "`n[1/3] Starting all services..." -ForegroundColor Cyan
docker compose -f $MainCompose -f $MonitorCompose up -d

Write-Host "`n[2/3] Configuring MySQL for CDC..." -ForegroundColor Cyan

# Wait for MySQL to be ready (up to 60s)
Write-Host "  Waiting for MySQL to be ready..." -ForegroundColor Yellow
$ready = $false
for ($i = 0; $i -lt 20; $i++) {
    $r = docker exec $DB_CONTAINER mysqladmin -u root -p$DB_ROOT_PASS ping --silent 2>&1
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 3
}

if (-not $ready) {
    Write-Host "  WARNING: MySQL not ready after 60s — grants may fail." -ForegroundColor Yellow
} else {
    Write-Host "  MySQL is ready." -ForegroundColor Green
}

# Grant privileges required by cdc-reader to read the binlog
$grantSQL = "GRANT REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO '${DB_USER}'@'%'; GRANT SYSTEM_VARIABLES_ADMIN ON *.* TO '${DB_USER}'@'%'; FLUSH PRIVILEGES;"
docker exec $DB_CONTAINER mysql -u root -p$DB_ROOT_PASS -e $grantSQL 2>&1 | Where-Object { $_ -notmatch "Warning" }

if ($LASTEXITCODE -eq 0) {
    Write-Host "  CDC grants applied successfully." -ForegroundColor Green
} else {
    Write-Host "  WARNING: Grant failed — check DB_ROOT_PASS in start.ps1." -ForegroundColor Red
}

# Restart cdc-reader so it picks up the new grants
Write-Host "  Restarting cdc-reader..." -ForegroundColor Yellow
docker compose -f $MainCompose -f $MonitorCompose restart cdc-reader 2>&1 | Where-Object { $_ -notmatch "Warning" }
Write-Host "  cdc-reader restarted." -ForegroundColor Green

Write-Host "`n[3/3] Container status:" -ForegroundColor Cyan
docker ps --format "table {{.Names}}`t{{.Status}}`t{{.Ports}}"

Write-Host @"

================================================
 CDC Monitor — Running
================================================
 Dashboard:  http://localhost:3001
 API:        http://localhost:8099/events

 After running Django migrations, any INSERT/UPDATE/DELETE
 on the 'andes_cloud' database will appear on the dashboard.
================================================
"@ -ForegroundColor Green
