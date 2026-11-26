param([Parameter(Mandatory=$true)][string]$RuntimeArchive)
$ErrorActionPreference = 'Stop'
$archive = (Resolve-Path -LiteralPath $RuntimeArchive).Path
$context = Split-Path -Parent $archive
if ((Split-Path -Leaf $archive) -ne 'runtime.tar') { throw 'The verified artifact must be named runtime.tar.' }
python (Join-Path $PSScriptRoot 'audit-archive.py') $archive (Join-Path $context 'archive-audit.json')
if ($LASTEXITCODE -ne 0) { throw 'The distribution audit failed.' }
docker build --pull=false -t w4-boxesai:mit-001 -f (Join-Path $PSScriptRoot 'Dockerfile.mit') $context
if ($LASTEXITCODE -ne 0) { throw 'MIT image build failed.' }
