$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
docker compose down
if ($LASTEXITCODE -ne 0) { throw 'docker compose down failed.' }
Write-Host 'Exchange 360 stopped.'
