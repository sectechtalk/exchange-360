$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Install Docker Desktop, then run this again.' }
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot '.env'))) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot '.env.example') -Destination (Join-Path $PSScriptRoot '.env')
    Write-Host 'Created .env from .env.example.'
}
Write-Host 'Setup steps (http://localhost:8360/#setup) checks the app registration, admin consent, your role and Exchange Online PowerShell.'
Write-Host 'Always open http://localhost:8360, not 127.0.0.1, or the browser loses the sign-in cookie.'
docker compose up --build -d
if ($LASTEXITCODE -ne 0) { throw 'docker compose up failed.' }
Write-Host 'Exchange 360: http://localhost:8360'
Start-Process 'http://localhost:8360/#setup'
