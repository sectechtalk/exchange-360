#Requires -Version 7.0
<#
.SYNOPSIS
    Exports every Exchange Online and Purview setting that affects mail flow, in both directions, to one JSON file.

.DESCRIPTION
    Read-only. Every tenant read is a Get- cmdlet. The script refuses to start if any section would run a
    command that is not a Get- cmdlet or a plain pipeline helper (Where-Object, Select-Object, ForEach-Object).

    You sign in yourself, with MFA, as the account you name. The script can only read what that account's
    own roles allow. A section the account cannot read is recorded with the exact error, never left out.

    Every section in the file has a status:
      ok          the command ran and returned one or more items
      empty       the command ran and returned nothing (for example, no journal rules exist)
      error       the command ran and failed; error.message is the exact text PowerShell gave
      unavailable the cmdlet does not exist in this session (licence, role, or module version)
      skipped     the command did not run because its connection failed; error.message says why

    The file never holds tokens, passwords or private keys. Properties whose names suggest a secret are
    replaced with "(removed: may hold a secret)" and listed under secretsRemoved. Binary values are replaced
    with their size.

    The file format is "sectechtalk.mailflow-config", version 1. The contract is docs/mailflow-export.md and
    docs/contracts/mailflow-config.v1.schema.json. Exchange 360 and NextHop 360 both read it.

.PARAMETER UserPrincipalName
    The account you sign in with, for example admin@contoso.com. You get the normal Microsoft sign-in
    and MFA prompt.

.PARAMETER Mailbox
    The mailbox whose forwarding, inbox rules, delegates, holds and junk settings are exported.
    Defaults to the account you sign in with.

.PARAMETER OutputPath
    Where to write the JSON file. Defaults to $HOME\Ex360-exports\mailflow-config-<mailbox>-<date>.json.

.PARAMETER SkipCompliance
    Do not connect to Security & Compliance PowerShell. DLP, sensitivity label, retention and hold
    sections are then recorded as skipped, with that reason.

.PARAMETER UseExistingConnection
    Use connections that are already open in this PowerShell window instead of signing in again.
    The script then does not disconnect them when it finishes.

.PARAMETER ConnectCompliance
    Used by Exchange 360's live read, with -UseExistingConnection. A script block that opens the Security &
    Compliance connection. It runs after the Exchange Online sections, because some cmdlet names exist in both
    sessions and the Exchange Online sections must read from Exchange Online.

.PARAMETER ListSections
    Print every section and the exact command it runs, then stop. Nothing connects and nothing is read.

.EXAMPLE
    pwsh -File .\export\Export-MailFlowConfig.ps1 -UserPrincipalName admin@contoso.com

.EXAMPLE
    pwsh -File .\export\Export-MailFlowConfig.ps1 -ListSections
#>
[CmdletBinding()]
param(
    [Parameter()][string]$UserPrincipalName = '',
    [Parameter()][string]$Mailbox = '',
    [Parameter()][string]$OutputPath = '',
    [Parameter()][switch]$SkipCompliance,
    [Parameter()][switch]$UseExistingConnection,
    [Parameter()][scriptblock]$ConnectCompliance,
    [Parameter()][switch]$ListSections
)

$ErrorActionPreference = 'Stop'

$ExportFormat = 'sectechtalk.mailflow-config'
$ExportVersion = 1
$GeneratorVersion = '1.1.0'

# ---------------------------------------------------------------------------------------------
# Sections. Each one is a single read. $mb is the mailbox address; $script:mailboxDn is filled by
# the "mailbox" section so "mailboxMemberOf" can find the groups the mailbox belongs to.
#   conn      exo | ipps        which session the command needs
#   group     routing | protection | encryption | retention | mailbox | compliance
#   direction inbound | outbound | both
# ---------------------------------------------------------------------------------------------
$Sections = @(
    # Routing: where mail is accepted, sent, rewritten or copied
    @{ name = 'organizationConfig'; conn = 'exo'; group = 'routing'; direction = 'both'; title = 'Organization configuration'; command = 'Get-OrganizationConfig'; read = { Get-OrganizationConfig } }
    @{ name = 'transportConfig'; conn = 'exo'; group = 'routing'; direction = 'both'; title = 'Transport configuration (size limits, SMTP AUTH, journaling mailbox, reply-all storm)'; command = 'Get-TransportConfig'; read = { Get-TransportConfig } }
    @{ name = 'acceptedDomains'; conn = 'exo'; group = 'routing'; direction = 'both'; title = 'Accepted domains'; command = 'Get-AcceptedDomain'; read = { Get-AcceptedDomain } }
    @{ name = 'remoteDomains'; conn = 'exo'; group = 'routing'; direction = 'outbound'; title = 'Remote domains (auto-forward, auto-reply, NDR, TNEF to outside domains)'; command = 'Get-RemoteDomain'; read = { Get-RemoteDomain } }
    @{ name = 'inboundConnectors'; conn = 'exo'; group = 'routing'; direction = 'inbound'; title = 'Inbound connectors'; command = 'Get-InboundConnector'; read = { Get-InboundConnector } }
    @{ name = 'outboundConnectors'; conn = 'exo'; group = 'routing'; direction = 'outbound'; title = 'Outbound connectors'; command = 'Get-OutboundConnector'; read = { Get-OutboundConnector } }
    @{ name = 'transportRules'; conn = 'exo'; group = 'routing'; direction = 'both'; title = 'Mail flow rules (transport rules), every condition, exception and action'; command = 'Get-TransportRule -ResultSize Unlimited'; read = { Get-TransportRule -ResultSize Unlimited } }
    @{ name = 'journalRules'; conn = 'exo'; group = 'routing'; direction = 'both'; title = 'Journal rules'; command = 'Get-JournalRule'; read = { Get-JournalRule } }
    @{ name = 'externalInOutlook'; conn = 'exo'; group = 'routing'; direction = 'inbound'; title = 'External sender tag in Outlook'; command = 'Get-ExternalInOutlook'; read = { Get-ExternalInOutlook } }
    @{ name = 'arcConfig'; conn = 'exo'; group = 'routing'; direction = 'inbound'; title = 'Trusted ARC sealers'; command = 'Get-ArcConfig'; read = { Get-ArcConfig } }
    @{ name = 'dkimSigningConfig'; conn = 'exo'; group = 'routing'; direction = 'outbound'; title = 'DKIM signing per domain'; command = 'Get-DkimSigningConfig'; read = { Get-DkimSigningConfig } }

    # Protection: filters that can reject, quarantine, junk, rewrite or allow a message
    @{ name = 'connectionFilterPolicies'; conn = 'exo'; group = 'protection'; direction = 'inbound'; title = 'Connection filter (IP allow list, IP block list, safe list)'; command = 'Get-HostedConnectionFilterPolicy'; read = { Get-HostedConnectionFilterPolicy } }
    @{ name = 'antiSpamPolicies'; conn = 'exo'; group = 'protection'; direction = 'inbound'; title = 'Anti-spam (inbound) policies'; command = 'Get-HostedContentFilterPolicy'; read = { Get-HostedContentFilterPolicy } }
    @{ name = 'antiSpamRules'; conn = 'exo'; group = 'protection'; direction = 'inbound'; title = 'Anti-spam (inbound) rules: who each policy applies to'; command = 'Get-HostedContentFilterRule'; read = { Get-HostedContentFilterRule } }
    @{ name = 'outboundSpamPolicies'; conn = 'exo'; group = 'protection'; direction = 'outbound'; title = 'Outbound spam policies (sending limits, auto-forwarding)'; command = 'Get-HostedOutboundSpamFilterPolicy'; read = { Get-HostedOutboundSpamFilterPolicy } }
    @{ name = 'outboundSpamRules'; conn = 'exo'; group = 'protection'; direction = 'outbound'; title = 'Outbound spam rules: which senders each policy applies to'; command = 'Get-HostedOutboundSpamFilterRule'; read = { Get-HostedOutboundSpamFilterRule } }
    @{ name = 'antiMalwarePolicies'; conn = 'exo'; group = 'protection'; direction = 'both'; title = 'Anti-malware policies (common attachment filter)'; command = 'Get-MalwareFilterPolicy'; read = { Get-MalwareFilterPolicy } }
    @{ name = 'antiMalwareRules'; conn = 'exo'; group = 'protection'; direction = 'both'; title = 'Anti-malware rules'; command = 'Get-MalwareFilterRule'; read = { Get-MalwareFilterRule } }
    @{ name = 'antiPhishPolicies'; conn = 'exo'; group = 'protection'; direction = 'inbound'; title = 'Anti-phishing policies (spoof, impersonation, DMARC honoring)'; command = 'Get-AntiPhishPolicy'; read = { Get-AntiPhishPolicy } }
    @{ name = 'antiPhishRules'; conn = 'exo'; group = 'protection'; direction = 'inbound'; title = 'Anti-phishing rules'; command = 'Get-AntiPhishRule'; read = { Get-AntiPhishRule } }
    @{ name = 'safeLinksPolicies'; conn = 'exo'; group = 'protection'; direction = 'both'; title = 'Safe Links policies'; command = 'Get-SafeLinksPolicy'; read = { Get-SafeLinksPolicy } }
    @{ name = 'safeLinksRules'; conn = 'exo'; group = 'protection'; direction = 'both'; title = 'Safe Links rules'; command = 'Get-SafeLinksRule'; read = { Get-SafeLinksRule } }
    @{ name = 'safeAttachmentPolicies'; conn = 'exo'; group = 'protection'; direction = 'both'; title = 'Safe Attachments policies'; command = 'Get-SafeAttachmentPolicy'; read = { Get-SafeAttachmentPolicy } }
    @{ name = 'safeAttachmentRules'; conn = 'exo'; group = 'protection'; direction = 'both'; title = 'Safe Attachments rules'; command = 'Get-SafeAttachmentRule'; read = { Get-SafeAttachmentRule } }
    @{ name = 'atpPolicyForO365'; conn = 'exo'; group = 'protection'; direction = 'both'; title = 'Defender for Office 365 global settings'; command = 'Get-AtpPolicyForO365'; read = { Get-AtpPolicyForO365 } }
    @{ name = 'presetEopRules'; conn = 'exo'; group = 'protection'; direction = 'both'; title = 'Preset security policies: Standard and Strict (EOP part)'; command = 'Get-EOPProtectionPolicyRule'; read = { Get-EOPProtectionPolicyRule } }
    @{ name = 'presetAtpRules'; conn = 'exo'; group = 'protection'; direction = 'both'; title = 'Preset security policies: Standard and Strict (Defender part)'; command = 'Get-ATPProtectionPolicyRule'; read = { Get-ATPProtectionPolicyRule } }
    @{ name = 'builtInProtectionRule'; conn = 'exo'; group = 'protection'; direction = 'both'; title = 'Built-in protection preset'; command = 'Get-ATPBuiltInProtectionRule'; read = { Get-ATPBuiltInProtectionRule } }
    @{ name = 'tenantAllowBlockSenders'; conn = 'exo'; group = 'protection'; direction = 'both'; title = 'Tenant Allow/Block List: senders and domains'; command = 'Get-TenantAllowBlockListItems -ListType Sender'; read = { Get-TenantAllowBlockListItems -ListType Sender } }
    @{ name = 'tenantAllowBlockUrls'; conn = 'exo'; group = 'protection'; direction = 'both'; title = 'Tenant Allow/Block List: URLs'; command = 'Get-TenantAllowBlockListItems -ListType Url'; read = { Get-TenantAllowBlockListItems -ListType Url } }
    @{ name = 'tenantAllowBlockFiles'; conn = 'exo'; group = 'protection'; direction = 'both'; title = 'Tenant Allow/Block List: file hashes'; command = 'Get-TenantAllowBlockListItems -ListType FileHash'; read = { Get-TenantAllowBlockListItems -ListType FileHash } }
    @{ name = 'tenantAllowBlockIPs'; conn = 'exo'; group = 'protection'; direction = 'inbound'; title = 'Tenant Allow/Block List: IP addresses'; command = 'Get-TenantAllowBlockListItems -ListType IP'; read = { Get-TenantAllowBlockListItems -ListType IP } }
    @{ name = 'tenantAllowBlockSpoof'; conn = 'exo'; group = 'protection'; direction = 'inbound'; title = 'Tenant Allow/Block List: spoofed senders'; command = 'Get-TenantAllowBlockListSpoofItems'; read = { Get-TenantAllowBlockListSpoofItems } }
    @{ name = 'quarantinePolicies'; conn = 'exo'; group = 'protection'; direction = 'inbound'; title = 'Quarantine policies (what recipients may do with quarantined mail)'; command = 'Get-QuarantinePolicy'; read = { Get-QuarantinePolicy } }
    @{ name = 'secOpsOverridePolicy'; conn = 'exo'; group = 'protection'; direction = 'inbound'; title = 'Advanced delivery: SecOps mailboxes (filtering bypass)'; command = 'Get-SecOpsOverridePolicy'; read = { Get-SecOpsOverridePolicy } }
    @{ name = 'secOpsOverrideRules'; conn = 'exo'; group = 'protection'; direction = 'inbound'; title = 'Advanced delivery: SecOps mailbox rules'; command = 'Get-ExoSecOpsOverrideRule'; read = { Get-ExoSecOpsOverrideRule } }
    @{ name = 'phishSimOverridePolicy'; conn = 'exo'; group = 'protection'; direction = 'inbound'; title = 'Advanced delivery: third-party phishing simulations (sending IPs and domains that bypass filtering)'; command = 'Get-PhishSimOverridePolicy'; read = { Get-PhishSimOverridePolicy } }
    @{ name = 'phishSimOverrideRules'; conn = 'exo'; group = 'protection'; direction = 'inbound'; title = 'Advanced delivery: phishing simulation rules'; command = 'Get-ExoPhishSimOverrideRule'; read = { Get-ExoPhishSimOverrideRule } }

    # Encryption
    @{ name = 'irmConfiguration'; conn = 'exo'; group = 'encryption'; direction = 'both'; title = 'IRM configuration (Microsoft Purview Message Encryption)'; command = 'Get-IRMConfiguration'; read = { Get-IRMConfiguration } }
    @{ name = 'omeConfiguration'; conn = 'exo'; group = 'encryption'; direction = 'outbound'; title = 'OME branding templates'; command = 'Get-OMEConfiguration'; read = { Get-OMEConfiguration } }
    @{ name = 'rmsTemplates'; conn = 'exo'; group = 'encryption'; direction = 'outbound'; title = 'Rights protection templates that mail flow rules can apply'; command = 'Get-RMSTemplate'; read = { Get-RMSTemplate } }

    # Exchange (MRM) retention
    @{ name = 'mrmRetentionPolicies'; conn = 'exo'; group = 'retention'; direction = 'both'; title = 'Exchange retention policies (MRM)'; command = 'Get-RetentionPolicy'; read = { Get-RetentionPolicy } }
    @{ name = 'mrmRetentionTags'; conn = 'exo'; group = 'retention'; direction = 'both'; title = 'Exchange retention tags (MRM)'; command = 'Get-RetentionPolicyTag'; read = { Get-RetentionPolicyTag } }

    # The one mailbox
    @{ name = 'mailbox'; conn = 'exo'; group = 'mailbox'; direction = 'both'; title = 'Mailbox: forwarding, holds, quotas, delivery restrictions, send on behalf'; command = 'Get-Mailbox -Identity <mailbox>'; read = { $box = Get-Mailbox -Identity $mb; $script:mailboxDn = [string]$box.DistinguishedName; $box } }
    @{ name = 'mailboxMemberOf'; conn = 'exo'; group = 'mailbox'; direction = 'both'; title = 'Groups the mailbox is a direct member of (for rules scoped to a group)'; command = "Get-Recipient -Filter `"Members -eq '<mailbox DN>'`" -ResultSize Unlimited"; read = { if (-not $script:mailboxDn) { throw 'The mailbox section did not return a DistinguishedName, so group membership could not be looked up.' }; $dn = $script:mailboxDn -replace "'", "''"; Get-Recipient -Filter "Members -eq '$dn'" -ResultSize Unlimited } }
    @{ name = 'mailboxUser'; conn = 'exo'; group = 'mailbox'; direction = 'both'; title = 'The mailbox owner as a user: department, title, office, country and manager (mail flow rules can match these)'; command = 'Get-User -Identity <mailbox>'; read = { Get-User -Identity $mb } }
    @{ name = 'casMailbox'; conn = 'exo'; group = 'mailbox'; direction = 'outbound'; title = 'Mailbox client access (SMTP AUTH and protocols)'; command = 'Get-CASMailbox -Identity <mailbox>'; read = { Get-CASMailbox -Identity $mb } }
    @{ name = 'mailboxStatistics'; conn = 'exo'; group = 'mailbox'; direction = 'inbound'; title = 'Mailbox size (a full mailbox rejects new mail)'; command = 'Get-MailboxStatistics -Identity <mailbox>'; read = { Get-MailboxStatistics -Identity $mb } }
    @{ name = 'inboxRules'; conn = 'exo'; group = 'mailbox'; direction = 'both'; title = 'Inbox rules, including hidden ones'; command = 'Get-InboxRule -Mailbox <mailbox> -IncludeHidden'; read = { Get-InboxRule -Mailbox $mb -IncludeHidden } }
    @{ name = 'mailboxPermissions'; conn = 'exo'; group = 'mailbox'; direction = 'both'; title = 'Delegates: Full Access (not inherited)'; command = 'Get-MailboxPermission -Identity <mailbox> | Where-Object { -not $_.IsInherited }'; read = { Get-MailboxPermission -Identity $mb | Where-Object { -not $_.IsInherited } } }
    @{ name = 'recipientPermissions'; conn = 'exo'; group = 'mailbox'; direction = 'outbound'; title = 'Delegates: Send As'; command = 'Get-RecipientPermission -Identity <mailbox>'; read = { Get-RecipientPermission -Identity $mb } }
    @{ name = 'calendarPermissions'; conn = 'exo'; group = 'mailbox'; direction = 'inbound'; title = 'Delegates: calendar folder (meeting requests can be sent to delegates)'; command = 'Get-MailboxFolderStatistics -Identity <mailbox> -FolderScope Calendar, then Get-MailboxFolderPermission on the default calendar'; read = { $cal = Get-MailboxFolderStatistics -Identity $mb -FolderScope Calendar | Where-Object { $_.FolderType -eq 'Calendar' } | Select-Object -First 1; if (-not $cal) { throw 'No default Calendar folder was found in this mailbox.' }; Get-MailboxFolderPermission -Identity ("{0}:{1}" -f $mb, ([string]$cal.FolderPath -replace '/', '\')) } }
    @{ name = 'autoReply'; conn = 'exo'; group = 'mailbox'; direction = 'outbound'; title = 'Automatic replies (out of office)'; command = 'Get-MailboxAutoReplyConfiguration -Identity <mailbox>'; read = { Get-MailboxAutoReplyConfiguration -Identity $mb } }
    @{ name = 'junkEmailConfig'; conn = 'exo'; group = 'mailbox'; direction = 'inbound'; title = 'Junk email settings (safe and blocked senders)'; command = 'Get-MailboxJunkEmailConfiguration -Identity <mailbox>'; read = { Get-MailboxJunkEmailConfiguration -Identity $mb } }

    # Purview (Security & Compliance PowerShell)
    @{ name = 'dlpPolicies'; conn = 'ipps'; group = 'compliance'; direction = 'both'; title = 'DLP policies'; command = 'Get-DlpCompliancePolicy'; read = { Get-DlpCompliancePolicy } }
    @{ name = 'dlpRules'; conn = 'ipps'; group = 'compliance'; direction = 'both'; title = 'DLP rules: conditions, sensitive info types, actions'; command = 'Get-DlpComplianceRule'; read = { Get-DlpComplianceRule } }
    @{ name = 'dlpSensitiveInformationTypes'; conn = 'ipps'; group = 'compliance'; direction = 'both'; title = 'Sensitive information types: names and IDs, so DLP and auto-labeling rules can be read by name'; command = 'Get-DlpSensitiveInformationType | Select-Object Name, Id, Publisher, Type'; read = { Get-DlpSensitiveInformationType | Select-Object Name, Id, Publisher, Type } }
    @{ name = 'sensitivityLabels'; conn = 'ipps'; group = 'compliance'; direction = 'both'; title = 'Sensitivity labels'; command = 'Get-Label'; read = { Get-Label } }
    @{ name = 'labelPolicies'; conn = 'ipps'; group = 'compliance'; direction = 'both'; title = 'Sensitivity label policies'; command = 'Get-LabelPolicy'; read = { Get-LabelPolicy } }
    @{ name = 'autoLabelPolicies'; conn = 'ipps'; group = 'compliance'; direction = 'both'; title = 'Auto-labeling policies'; command = 'Get-AutoSensitivityLabelPolicy'; read = { Get-AutoSensitivityLabelPolicy } }
    @{ name = 'autoLabelRules'; conn = 'ipps'; group = 'compliance'; direction = 'both'; title = 'Auto-labeling rules'; command = 'Get-AutoSensitivityLabelRule'; read = { Get-AutoSensitivityLabelRule } }
    @{ name = 'retentionPolicies'; conn = 'ipps'; group = 'compliance'; direction = 'both'; title = 'Purview retention policies'; command = 'Get-RetentionCompliancePolicy'; read = { Get-RetentionCompliancePolicy } }
    @{ name = 'retentionRules'; conn = 'ipps'; group = 'compliance'; direction = 'both'; title = 'Purview retention rules'; command = 'Get-RetentionComplianceRule'; read = { Get-RetentionComplianceRule } }
    @{ name = 'retentionLabels'; conn = 'ipps'; group = 'compliance'; direction = 'both'; title = 'Retention labels'; command = 'Get-ComplianceTag'; read = { Get-ComplianceTag } }
    @{ name = 'complianceCases'; conn = 'ipps'; group = 'compliance'; direction = 'both'; title = 'eDiscovery cases (holds belong to cases)'; command = 'Get-ComplianceCase'; read = { Get-ComplianceCase } }
    # Get-CaseHoldPolicy with no -Case fails with "please specify a policy or a case id", so holds are read case by case.
    @{ name = 'caseHoldPolicies'; conn = 'ipps'; group = 'compliance'; direction = 'both'; title = 'eDiscovery hold policies, read for each case'; command = 'Get-ComplianceCase | ForEach-Object { Get-CaseHoldPolicy -Case $_.Identity }'; read = { Get-ComplianceCase | ForEach-Object { Get-CaseHoldPolicy -Case $_.Identity } } }
    @{ name = 'caseHoldRules'; conn = 'ipps'; group = 'compliance'; direction = 'both'; title = 'eDiscovery hold rules (one per hold policy)'; command = 'Get-ComplianceCase | ForEach-Object { Get-CaseHoldPolicy -Case $_.Identity } | ForEach-Object { Get-CaseHoldRule -Policy $_.Guid }'; read = { Get-ComplianceCase | ForEach-Object { Get-CaseHoldPolicy -Case $_.Identity } | ForEach-Object { Get-CaseHoldRule -Policy $_.Guid } } }
)

# ---------------------------------------------------------------------------------------------
# Read-only guard: every command inside every section must be Get-* or a pipeline helper.
# ---------------------------------------------------------------------------------------------
$AllowedHelpers = 'Where-Object', 'Select-Object', 'ForEach-Object', 'Sort-Object'
function Assert-ReadOnly {
    $bad = @()
    foreach ($s in $Sections) {
        $calls = $s.read.Ast.FindAll({ param($a) $a -is [System.Management.Automation.Language.CommandAst] }, $true)
        foreach ($c in $calls) {
            $n = $c.GetCommandName()
            if (-not $n -or ($n -notmatch '^Get-[A-Za-z0-9]+$' -and $n -notin $AllowedHelpers)) { $bad += "$($s.name): $(if ($n) { $n } else { $c.Extent.Text })" }
        }
    }
    if ($bad.Count) { throw "Refusing to run. These section commands are not read-only Get- cmdlets: $($bad -join '; ')" }
}
Assert-ReadOnly

if ($ListSections) {
    Write-Host ("{0} sections. Every command is a read. <mailbox> is the mailbox you choose (default: the account you sign in with)." -f $Sections.Count)
    foreach ($s in $Sections) { Write-Host ("  {0,-26} {1,-11} {2,-9} {3,-5} {4}" -f $s.name, $s.group, $s.direction, $s.conn, $s.command) }
    return
}

# ---------------------------------------------------------------------------------------------
# Value conversion: every value becomes plain JSON. Secret-looking properties are removed.
# ---------------------------------------------------------------------------------------------
$SkipProperties = 'PSComputerName', 'PSShowComputerName', 'RunspaceId', 'ObjectState', 'IsValid', 'PSStandardMembers', 'OrganizationId', 'OriginatingServer', 'ObjectCategory', 'ObjectClass', 'ExchangeVersion'
$SecretName = '(?i)(password|passwd|secret|token|privatekey|private_key|sharedkey|credential|apikey|api_key|connectionstring|sastoken|bearer)'
$MaxString = 100000
$MaxItems = 5000
$script:secretsRemoved = [System.Collections.Generic.List[string]]::new()
$script:truncated = [System.Collections.Generic.List[string]]::new()

function ConvertTo-ExportValue($value, [string]$path, [int]$depth) {
    if ($null -eq $value) { return $null }
    $deserialized = [string]($value.PSObject.TypeNames | Select-Object -First 1) -like 'Deserialized.*'
    $base = $value.PSObject.BaseObject
    if ($null -ne $base -and $base -isnot [System.Management.Automation.PSCustomObject]) { $value = $base }
    if ($value -is [string]) {
        if ($value.Length -gt $MaxString) { $script:truncated.Add($path); return $value.Substring(0, $MaxString) }
        return $value
    }
    if ($value -is [bool] -or $value -is [int] -or $value -is [long] -or $value -is [double] -or $value -is [decimal] -or $value -is [single] -or $value -is [int16] -or $value -is [byte] -or $value -is [uint32] -or $value -is [uint64]) { return $value }
    if ($value -is [datetime]) { return $value.ToUniversalTime().ToString('o') }
    if ($value -is [datetimeoffset]) { return $value.UtcDateTime.ToString('o') }
    if ($value -is [timespan]) { return $value.ToString() }
    if ($value -is [guid]) { return $value.ToString() }
    if ($value -is [enum]) { return $value.ToString() }
    if ($value -is [byte[]]) { return "(binary, $($value.Length) bytes; not exported)" }
    if ($value -is [System.Security.SecureString]) { $script:secretsRemoved.Add($path); return '(removed: may hold a secret)' }
    if ($depth -ge 6) { return [string]$value }
    if ($value -is [System.Collections.IDictionary]) {
        $h = [ordered]@{}
        foreach ($k in @($value.Keys)) { $h[[string]$k] = ConvertTo-ExportProperty ([string]$k) $value[$k] "$path.$k" ($depth + 1) }
        return $h
    }
    if ($value -is [System.Collections.IEnumerable]) {
        $list = [System.Collections.Generic.List[object]]::new()
        $i = 0
        foreach ($item in $value) {
            if ($i -ge $MaxItems) { $script:truncated.Add($path); break }
            $list.Add((ConvertTo-ExportValue $item "$path[$i]" ($depth + 1)))
            $i++
        }
        return , $list.ToArray()
    }
    # A property bag built in PowerShell (not a deserialized Exchange type) keeps its properties.
    if ($value -is [System.Management.Automation.PSCustomObject] -and -not $deserialized) { return ConvertTo-ExportObject $value $path ($depth + 1) }
    # Exchange types (identities, addresses, sizes) and deserialized objects read best as their text.
    return [string]$value
}

function ConvertTo-ExportProperty([string]$name, $value, [string]$path, [int]$depth) {
    if ($name -match $SecretName -and $null -ne $value -and [string]$value -ne '' -and $value -isnot [bool]) {
        $script:secretsRemoved.Add($path)
        return '(removed: may hold a secret)'
    }
    ConvertTo-ExportValue $value $path $depth
}

function ConvertTo-ExportObject($obj, [string]$path, [int]$depth) {
    $h = [ordered]@{}
    foreach ($p in @($obj.PSObject.Properties)) {
        if ($p.Name -in $SkipProperties) { continue }
        try { $v = $p.Value } catch { $h[$p.Name] = "(could not read this property: $($_.Exception.Message))"; continue }
        $h[$p.Name] = ConvertTo-ExportProperty $p.Name $v "$path.$($p.Name)" $depth
    }
    $h
}

# Last line of defence: scan the finished JSON text for anything shaped like a token or a private key.
function Test-NoSecretText([string]$json) {
    $patterns = @(
        @{ name = 'JSON Web Token'; re = 'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}' }
        @{ name = 'private key block'; re = '-----BEGIN [A-Z ]*PRIVATE KEY-----' }
        @{ name = 'Azure storage SAS signature'; re = '[?&]sig=[A-Za-z0-9%/+]{20,}' }
    )
    @($patterns | Where-Object { $json -match $_.re } | ForEach-Object { $_.name })
}

# ---------------------------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------------------------
function ConvertTo-ErrorRecord($err, [string]$prefix = '') {
    $msg = if ($err -is [System.Management.Automation.ErrorRecord]) { $err.Exception.Message } else { [string]$err }
    $rec = [ordered]@{ message = ($prefix + $msg) }
    if ($err -is [System.Management.Automation.ErrorRecord]) {
        $rec.category = [string]$err.CategoryInfo.Category
        $rec.errorId = [string]$err.FullyQualifiedErrorId
        $rec.exceptionType = $err.Exception.GetType().FullName
    }
    $rec
}

$started = Get-Date
$connections = [ordered]@{
    exchangeOnline = [ordered]@{ status = 'not attempted'; error = $null }
    compliance = [ordered]@{ status = 'not attempted'; error = $null }
}
$connectedHere = @()

if (-not $UseExistingConnection) {
    if ($UserPrincipalName -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { throw 'Give -UserPrincipalName with the account you sign in with, for example -UserPrincipalName admin@contoso.com.' }
    if (-not (Get-Module -ListAvailable ExchangeOnlineManagement)) {
        throw 'The ExchangeOnlineManagement module is not installed. Install it once (free) with: Install-Module ExchangeOnlineManagement -Scope CurrentUser'
    }
    Import-Module ExchangeOnlineManagement
}

$exoModule = Get-Module ExchangeOnlineManagement | Select-Object -First 1
Write-Host 'Exchange 360 mail flow export (read-only)' -ForegroundColor Cyan

if ($UseExistingConnection) {
    $connections.exchangeOnline.status = 'existing'
} else {
    Write-Host "Signing in to Exchange Online as $UserPrincipalName. Complete the sign-in and MFA prompt." -ForegroundColor Cyan
    try {
        Connect-ExchangeOnline -UserPrincipalName $UserPrincipalName -ShowBanner:$false
        $connections.exchangeOnline.status = 'connected'
        $connectedHere += 'exo'
    } catch {
        $connections.exchangeOnline.status = 'failed'
        $connections.exchangeOnline.error = ConvertTo-ErrorRecord $_
    }
}

$tenant = [ordered]@{ organization = $null; tenantId = $null; signedInAs = $null; defaultDomain = $null }
try {
    $ci = Get-ConnectionInformation | Where-Object { $_.State -eq 'Connected' -and -not $_.IsEopSession } | Select-Object -First 1
    if ($ci) { $tenant.tenantId = [string]$ci.TenantID; $tenant.signedInAs = [string]$ci.UserPrincipalName; $tenant.organization = [string]$ci.Organization }
} catch { }
if (-not $tenant.signedInAs -and $UserPrincipalName) { $tenant.signedInAs = $UserPrincipalName }

$mb = if ($Mailbox) { $Mailbox } elseif ($tenant.signedInAs) { $tenant.signedInAs } else { $UserPrincipalName }
$script:mailboxDn = $null

$results = [ordered]@{}
function Invoke-Section($s) {
    $t0 = Get-Date
    $rec = [ordered]@{
        title = $s.title; group = $s.group; direction = $s.direction; session = $s.conn
        command = ($s.command -replace '<mailbox>', $mb)
        status = $null; count = 0; items = @(); error = $null; warnings = @(); durationMs = 0
    }
    $warn = $null
    try {
        # 3>&1 collects warnings with the output so they are recorded instead of lost.
        $all = @(& $s.read 3>&1)
        $warn = @($all | Where-Object { $_ -is [System.Management.Automation.WarningRecord] })
        $raw = @($all | Where-Object { $_ -isnot [System.Management.Automation.WarningRecord] })
        $items = [System.Collections.Generic.List[object]]::new()
        $i = 0
        foreach ($o in $raw) { if ($null -ne $o) { $items.Add((ConvertTo-ExportObject $o "sections.$($s.name).items[$i]" 0)); $i++ } }
        $rec.items = $items.ToArray()
        $rec.count = $items.Count
        $rec.status = if ($items.Count) { 'ok' } else { 'empty' }
    } catch {
        $e = $_
        $isMissing = $e.Exception -is [System.Management.Automation.CommandNotFoundException] -or $e.FullyQualifiedErrorId -match '^CommandNotFoundException'
        $rec.status = if ($isMissing) { 'unavailable' } else { 'error' }
        $rec.error = ConvertTo-ErrorRecord $e
        if ($isMissing) { $rec.error.hint = 'This cmdlet is not in your session. Usually the tenant is not licensed for the feature, the signed-in account has no role that includes it, or the ExchangeOnlineManagement module is out of date.' }
    }
    if ($warn) { $rec.warnings = @($warn | ForEach-Object { [string]$_.Message }) }
    $rec.durationMs = [int]((Get-Date) - $t0).TotalMilliseconds
    $rec
}

function Write-SectionLine($name, $rec) {
    $color = switch ($rec.status) { 'ok' { 'Green' } 'empty' { 'Gray' } 'skipped' { 'Yellow' } default { 'Red' } }
    $detail = switch ($rec.status) { 'ok' { "$($rec.count) item(s)" } 'empty' { 'ran, nothing configured' } default { $rec.error.message } }
    Write-Host ("  {0,-12} {1,-26} {2}" -f $rec.status.ToUpper(), $name, $detail) -ForegroundColor $color
}

function Skip-Section($s, [string]$reason) {
    [ordered]@{
        title = $s.title; group = $s.group; direction = $s.direction; session = $s.conn
        command = ($s.command -replace '<mailbox>', $mb)
        status = 'skipped'; count = 0; items = @(); error = [ordered]@{ message = $reason }; warnings = @(); durationMs = 0
    }
}

# Exchange Online sections first, then Security & Compliance (some cmdlet names exist in both sessions).
$exoReady = $connections.exchangeOnline.status -in 'connected', 'existing'
Write-Host "Reading Exchange Online settings for mailbox $mb ..." -ForegroundColor Cyan
foreach ($s in @($Sections | Where-Object { $_.conn -eq 'exo' })) {
    $results[$s.name] = if ($exoReady) { Invoke-Section $s } else { Skip-Section $s "Not read because Connect-ExchangeOnline failed: $($connections.exchangeOnline.error.message)" }
    Write-SectionLine $s.name $results[$s.name]
}

if ($SkipCompliance) {
    $connections.compliance.status = 'skipped'
    $connections.compliance.error = [ordered]@{ message = 'You ran the export with -SkipCompliance.' }
} elseif ($UseExistingConnection -and $ConnectCompliance) {
    Write-Host 'Connecting to Security & Compliance PowerShell with the existing sign-in ...' -ForegroundColor Cyan
    try {
        & $ConnectCompliance | Out-Null
        $connections.compliance.status = 'existing'
    } catch {
        $connections.compliance.status = 'failed'
        $connections.compliance.error = ConvertTo-ErrorRecord $_
    }
} elseif ($UseExistingConnection) {
    $connections.compliance.status = 'existing'
} else {
    Write-Host "Signing in to Security & Compliance PowerShell as $UserPrincipalName ..." -ForegroundColor Cyan
    try {
        Connect-IPPSSession -UserPrincipalName $UserPrincipalName
        $connections.compliance.status = 'connected'
        $connectedHere += 'ipps'
    } catch {
        $connections.compliance.status = 'failed'
        $connections.compliance.error = ConvertTo-ErrorRecord $_
    }
}
$ippsReady = $connections.compliance.status -in 'connected', 'existing'
Write-Host 'Reading Purview (DLP, labels, retention, holds) ...' -ForegroundColor Cyan
foreach ($s in @($Sections | Where-Object { $_.conn -eq 'ipps' })) {
    $results[$s.name] = if ($ippsReady) { Invoke-Section $s } else { Skip-Section $s "Not read because the Security & Compliance connection was not made: $($connections.compliance.error.message)" }
    Write-SectionLine $s.name $results[$s.name]
}

if ($connectedHere.Count) {
    try { Disconnect-ExchangeOnline -Confirm:$false | Out-Null } catch { }
}

$summary = [ordered]@{ sections = $results.Count; ok = 0; empty = 0; error = 0; unavailable = 0; skipped = 0 }
foreach ($r in $results.Values) { $summary[$r.status]++ }

$domainRows = if ($results.Contains('acceptedDomains')) { @($results['acceptedDomains'].items) } else { @() }
$default = $domainRows | Where-Object { $_.Default -eq $true -or $_.Default -eq 'True' } | Select-Object -First 1
if ($default) { $tenant.defaultDomain = [string]$default.DomainName }
if (-not $tenant.organization -and $results.Contains('organizationConfig') -and $results['organizationConfig'].count) { $tenant.organization = [string]$results['organizationConfig'].items[0].Name }

$export = [ordered]@{
    format = $ExportFormat
    version = $ExportVersion
    generatedAt = $started.ToUniversalTime().ToString('o')
    generator = [ordered]@{
        name = 'Export-MailFlowConfig.ps1'
        version = $GeneratorVersion
        powershell = $PSVersionTable.PSVersion.ToString()
        exchangeOnlineManagement = if ($exoModule) { $exoModule.Version.ToString() } else { $null }
    }
    readOnly = $true
    tenant = $tenant
    mailbox = [ordered]@{ address = $mb }
    connections = $connections
    summary = $summary
    sections = $results
    secretsRemoved = @($script:secretsRemoved)
    truncated = @($script:truncated)
    notes = @(
        'Every section ran a Get- cmdlet only. Nothing in the tenant was changed.'
        'status "empty" means the command ran and returned nothing. It is not an error.'
        'Exchange Online only. On-premises servers, hybrid routing beyond the connectors listed here, and DNS are not part of this file.'
    )
}

$json = $export | ConvertTo-Json -Depth 32
$found = Test-NoSecretText $json
if ($found.Count) { throw "Refusing to write the file: the output contains text shaped like a $($found -join ', '). Nothing was written. Report this so the property can be added to the removal list." }

if (-not $OutputPath) {
    $who = ($mb -replace '[^A-Za-z0-9._-]+', '-')
    $OutputPath = Join-Path (Join-Path $HOME 'Ex360-exports') ("mailflow-config-{0}-{1}.json" -f $who, $started.ToString('yyyyMMdd-HHmm'))
}
$dir = Split-Path -Parent $OutputPath
if ($dir -and -not (Test-Path -LiteralPath $dir)) { $null = [System.IO.Directory]::CreateDirectory($dir) }
[System.IO.File]::WriteAllText($OutputPath, $json, [System.Text.UTF8Encoding]::new($false))

Write-Host ''
Write-Host ("Sections: {0}   ok {1}   empty {2}   error {3}   unavailable {4}   skipped {5}" -f $summary.sections, $summary.ok, $summary.empty, $summary.error, $summary.unavailable, $summary.skipped) -ForegroundColor Cyan
Write-Host "Saved: $OutputPath" -ForegroundColor Green
if ($summary.error + $summary.unavailable + $summary.skipped) {
    Write-Host 'Some sections were not read. Each one has its exact error in the file under sections.<name>.error.' -ForegroundColor Yellow
    exit 1
}
exit 0
