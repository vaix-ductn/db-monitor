# CDC Monitor — Stop Script
# Run from your project root (same folder as docker-compose.yaml)

$ProjectRoot = Resolve-Path "."
$MonitorCompose = "$ProjectRoot\monitor\docker-compose.monitor.yml"
$MainCompose = "$ProjectRoot\docker-compose.yaml"

Write-Host "`nStopping monitor services (db and main app keep running)..." -ForegroundColor Cyan

docker compose -f $MainCompose -f $MonitorCompose stop cdc-reader cdc-redis cdc-dashboard
docker compose -f $MainCompose -f $MonitorCompose rm -f cdc-reader cdc-redis cdc-dashboard

Write-Host "Monitor services stopped. Run .\monitor\start.ps1 to restart." -ForegroundColor Green
