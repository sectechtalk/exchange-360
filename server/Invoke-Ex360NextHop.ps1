# NextHop live read for Exchange 360: runs export/Export-MailFlowConfig.ps1 against the live tenant with the
# signed-in person's own delegated tokens, so no export file has to be made and opened by hand.
# Read-only: it connects, then the export script runs its Get- sections and refuses to run anything else.
# Tokens are read from files (mode 600, deleted by the server afterwards), never from the command line.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ExoTokenPath,
    [Parameter()][string]$IppsTokenPath = '',
    [Parameter(Mandatory)][string]$UserPrincipalName,
    [Parameter()][string]$Mailbox = '',
    [Parameter(Mandatory)][string]$OutputPath
)
$ErrorActionPreference = 'Stop'
$export = Join-Path (Split-Path -Parent $PSScriptRoot) 'export/Export-MailFlowConfig.ps1'
if (-not (Test-Path -LiteralPath $export)) { throw "The export script is not in the image ($export)." }
Import-Module ExchangeOnlineManagement -ErrorAction Stop

Write-Host 'Connecting to Exchange Online with your sign-in ...'
$exoToken = (Get-Content -LiteralPath $ExoTokenPath -Raw).Trim()
Connect-ExchangeOnline -AccessToken $exoToken -UserPrincipalName $UserPrincipalName -ShowBanner:$false -DisableWAM | Out-Null

$params = @{ UseExistingConnection = $true; OutputPath = $OutputPath }
if ($Mailbox) { $params.Mailbox = $Mailbox }
if ($IppsTokenPath -and (Test-Path -LiteralPath $IppsTokenPath)) {
    $ippsToken = (Get-Content -LiteralPath $IppsTokenPath -Raw).Trim()
    $upn = $UserPrincipalName
    $params.ConnectCompliance = { Connect-IPPSSession -AccessToken $ippsToken -UserPrincipalName $upn }.GetNewClosure()
} else {
    $params.SkipCompliance = $true
}
try {
    & $export @params
    $code = $LASTEXITCODE
} finally {
    try { Disconnect-ExchangeOnline -Confirm:$false | Out-Null } catch { }
}
exit $code
