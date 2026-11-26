param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
function New-W4Secret([int]$Size) {
    $bytes = New-Object byte[] $Size
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
    return [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
}
$configPath = Join-Path $PSScriptRoot '.env.mit.local'
if (!(Test-Path -LiteralPath $configPath)) {
    $databasePassword = New-W4Secret 32
    $encryptionKey = New-W4Secret 16
    $jwtSecret = New-W4Secret 32
    @(
        "POSTGRES_PASSWORD=$databasePassword"
        "AP_POSTGRES_PASSWORD=$databasePassword"
        "AP_ENCRYPTION_KEY=$encryptionKey"
        "AP_JWT_SECRET=$jwtSecret"
        'AP_POSTGRES_DATABASE=w4_mit'
        'AP_POSTGRES_USERNAME=w4'
        'AP_POSTGRES_PORT=5432'
        'AP_REDIS_PORT=6379'
        'AP_EDITION=ce'
        'AP_ENVIRONMENT=prod'
        'AP_DB_TYPE=POSTGRES'
        'AP_REDIS_TYPE=STANDALONE'
        'AP_EXECUTION_MODE=SANDBOX_CODE_ONLY'
        'AP_TELEMETRY_ENABLED=false'
        'AP_CLOUD_AUTH_ENABLED=false'
        'AP_WORKER_CONCURRENCY=2'
        'AP_EXECUTION_DATA_RETENTION_DAYS=30'
    ) | Set-Content -LiteralPath $configPath -Encoding ascii
}
docker image inspect w4-boxesai:mit-006 --format '{{.Id}}'
if ($LASTEXITCODE -ne 0) { throw 'Build the verified MIT image as documented in CONSTRUIR.txt.' }
$composePath = Join-Path $PSScriptRoot 'compose.mit.yaml'
docker compose -f $composePath config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Invalid Docker Compose configuration.' }
docker compose -f $composePath up -d --wait --wait-timeout 1500
if ($LASTEXITCODE -ne 0) { throw 'The W4 stack is not healthy. Inspect docker compose logs.' }
Write-Output 'W4-BoxesAI: http://localhost:8081'
