# Read-only Outlook collector for Ex360. Run this on the Windows PC, in Windows PowerShell.
# The Ex360 container cannot see this PC's Outlook profile, OST files or COM objects.
# It only reads the registry, file sizes and a TCP check, then POSTs JSON to the local container.
[CmdletBinding()]
param(
    [string]$Server = 'http://localhost:8360',
    [string]$Domain = ''
)
$ErrorActionPreference = 'Stop'

function Read-Reg($path, $name) {
    try { return (Get-ItemProperty -LiteralPath $path -Name $name -ErrorAction Stop).$name } catch { return $null }
}

$click = 'HKLM:\SOFTWARE\Microsoft\Office\ClickToRun\Configuration'
$version = Read-Reg $click 'VersionToReport'
$channel = Read-Reg $click 'UpdateChannel'
$bitness = Read-Reg 'HKLM:\SOFTWARE\Microsoft\Office\ClickToRun\Configuration' 'Platform'
if (-not $bitness) { $bitness = if ([Environment]::Is64BitProcess) { '64-bit process' } else { '32-bit process' } }

$profiles = @()
$profileRoot = 'HKCU:\Software\Microsoft\Office\16.0\Outlook\Profiles'
if (Test-Path -LiteralPath $profileRoot) {
    foreach ($item in Get-ChildItem -LiteralPath $profileRoot) {
        $profiles += [pscustomobject]@{ name = $item.PSChildName; cached = $null; ost = $null; ostBytes = $null }
    }
}

$outlookDir = Join-Path $env:LOCALAPPDATA 'Microsoft\Outlook'
$files = @()
if (Test-Path -LiteralPath $outlookDir) {
    $files = @(Get-ChildItem -LiteralPath $outlookDir -Include *.ost, *.pst -Recurse -ErrorAction SilentlyContinue | Select-Object -First 20)
}
foreach ($file in $files) {
    $match = $profiles | Where-Object { $_.ost -eq $null } | Select-Object -First 1
    $row = [pscustomobject]@{ name = [IO.Path]::GetFileNameWithoutExtension($file.Name); cached = [bool]($file.Extension -eq '.ost'); ost = $file.FullName; ostBytes = [int64]$file.Length }
    if ($match) {
        $profiles = @($profiles | Where-Object { $_.name -ne $match.name }) + $row
    } else { $profiles += $row }
}

$addins = @()
foreach ($key in @('HKCU:\Software\Microsoft\Office\Outlook\Addins', 'HKCU:\Software\Microsoft\Office\16.0\Outlook\Addins', 'HKLM:\SOFTWARE\Microsoft\Office\Outlook\Addins')) {
    if (-not (Test-Path -LiteralPath $key)) { continue }
    foreach ($item in Get-ChildItem -LiteralPath $key -ErrorAction SilentlyContinue) {
        $addins += [pscustomobject]@{ name = $item.PSChildName; location = $key }
    }
}

$auto = @{ host = $null; result = 'No domain was passed. Re-run with -Domain your domain to check Autodiscover DNS.' }
if ($Domain) {
    try {
        $name = "autodiscover.$Domain"
        $answer = Resolve-DnsName -Name $name -Type CNAME -ErrorAction Stop | Select-Object -First 1
        $auto = @{ host = [string]$answer.NameHost; result = "CNAME $name -> $($answer.NameHost)" }
    } catch {
        $auto = @{ host = $null; result = "Autodiscover DNS for $Domain did not return a CNAME. $($_.Exception.Message)" }
    }
}

$connectivity = @()
foreach ($target in @('outlook.office365.com', 'autodiscover.outlook.com')) {
    $ok = $false
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $iar = $client.BeginConnect($target, 443, $null, $null)
        $ok = $iar.AsyncWaitHandle.WaitOne(5000, $false) -and $client.Connected
        $client.Close()
    } catch { $ok = $false }
    $connectivity += [pscustomobject]@{ target = "${target}:443"; ok = [bool]$ok }
}

$report = [pscustomobject]@{
    computer = $env:COMPUTERNAME
    outlook = [pscustomobject]@{ version = $version; channel = $channel; bitness = $bitness }
    profiles = $profiles
    addins = $addins
    autodiscover = $auto
    connectivity = $connectivity
}
$json = $report | ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Post -Uri ($Server.TrimEnd('/') + '/api/outlook-client') -ContentType 'application/json' -Body $json | Out-Null
Write-Host "Posted a read-only Outlook report to $Server"
