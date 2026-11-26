$ErrorActionPreference = 'Stop'
$composePath = Join-Path $PSScriptRoot 'compose.mit.yaml'
$check = @"
const g = require('./build-gate.json');
if (g.enterpriseInputs || g.unresolvedLicenses) process.exit(1);
console.log(JSON.stringify(g));
fetch('http://127.0.0.1/api/v1/health').then(r => {
  if (!r.ok) process.exit(1);
  console.log('PASS API health');
}).catch(() => process.exit(1));
"@
$check | docker compose -f $composePath exec -T app node -
if ($LASTEXITCODE -ne 0) { throw 'MIT gate or API health failed.' }
docker compose -f $composePath ps
