# Test doubles for export/Export-MailFlowConfig.ps1. Dot-source this file, then run the export with
# -UseExistingConnection. Shapes mimic real cmdlets: identity objects, multi-valued lists, a dictionary
# with non-string keys, binary data, a secret-looking property, a warning, a failure and a missing cmdlet.
class StubId {
    [string]$Name
    StubId([string]$n) { $this.Name = $n }
    [string] ToString() { return $this.Name }
}

function global:Get-ConnectionInformation { [pscustomobject]@{ State = 'Connected'; IsEopSession = $false; TenantID = 'aaaaaaaa-0000-4000-8000-000000000001'; UserPrincipalName = 'alex@contoso.com'; Organization = 'contoso.onmicrosoft.com'; TokenStatus = 'Active' } }

# Simple reads that return one object each.
$simple = 'Get-OrganizationConfig', 'Get-RemoteDomain', 'Get-InboundConnector', 'Get-OutboundConnector', 'Get-ExternalInOutlook', 'Get-ArcConfig', 'Get-DkimSigningConfig',
'Get-HostedConnectionFilterPolicy', 'Get-HostedContentFilterPolicy', 'Get-HostedContentFilterRule', 'Get-HostedOutboundSpamFilterPolicy', 'Get-HostedOutboundSpamFilterRule',
'Get-MalwareFilterPolicy', 'Get-MalwareFilterRule', 'Get-AntiPhishPolicy', 'Get-AntiPhishRule', 'Get-SafeLinksPolicy', 'Get-SafeLinksRule', 'Get-SafeAttachmentPolicy',
'Get-SafeAttachmentRule', 'Get-AtpPolicyForO365', 'Get-EOPProtectionPolicyRule', 'Get-ATPProtectionPolicyRule', 'Get-ATPBuiltInProtectionRule', 'Get-TenantAllowBlockListSpoofItems',
'Get-QuarantinePolicy', 'Get-SecOpsOverridePolicy', 'Get-ExoSecOpsOverrideRule', 'Get-PhishSimOverridePolicy', 'Get-RMSTemplate', 'Get-RetentionPolicy', 'Get-RetentionPolicyTag',
'Get-CASMailbox', 'Get-MailboxStatistics', 'Get-MailboxPermission', 'Get-RecipientPermission', 'Get-MailboxFolderPermission', 'Get-MailboxAutoReplyConfiguration',
'Get-MailboxJunkEmailConfiguration', 'Get-DlpCompliancePolicy', 'Get-Label', 'Get-LabelPolicy', 'Get-AutoSensitivityLabelPolicy', 'Get-AutoSensitivityLabelRule',
'Get-RetentionCompliancePolicy', 'Get-RetentionComplianceRule', 'Get-ComplianceTag', 'Get-ComplianceCase', 'Get-CaseHoldRule',
'Get-User', 'Get-DlpSensitiveInformationType'
foreach ($n in $simple) {
    $body = "[pscustomobject]@{ Name = '$n item'; Identity = [StubId]::new('$n'); Enabled = `$true; WhenChanged = [datetime]'2026-11-01T10:00:00Z' }"
    Set-Item -Path "function:global:$n" -Value ([scriptblock]::Create($body))
}

function global:Get-TransportConfig { [pscustomobject]@{ MaxSendSize = [StubId]::new('35 MB (36,700,160 bytes)'); SmtpClientAuthenticationDisabled = $true; JournalingReportNdrTo = $null } }
function global:Get-AcceptedDomain {
    [pscustomobject]@{ Name = 'contoso.com'; DomainName = [StubId]::new('contoso.com'); DomainType = 'Authoritative'; Default = $true }
    [pscustomobject]@{ Name = 'contoso.onmicrosoft.com'; DomainName = [StubId]::new('contoso.onmicrosoft.com'); DomainType = 'Authoritative'; Default = $false }
}
function global:Get-TransportRule {
    param($ResultSize)
    Write-Warning 'Rule "Old disclaimer" uses a deprecated condition.'
    [pscustomobject]@{
        Name = 'Block external forward'; Priority = 0; State = 'Enabled'; Mode = 'Enforce'
        SentToScope = 'NotInOrganization'; SubjectOrBodyContainsWords = @('confidential', 'project falcon')
        SenderIpRanges = @([StubId]::new('203.0.113.0/24'))
        RejectMessageReasonText = 'Not allowed'; RejectMessageEnhancedStatusCode = '5.7.1'
        Odd = @{ 1 = 'non-string key' }
        # Built from pieces so secret scanners do not flag this test file. It is not a real token.
        Comments = if ($env:MF_STUB_JWT) { ('ey' + 'J') + ('A' * 16) + '.' + ('ey' + 'J') + ('B' * 16) + '.' + ('C' * 16) } else { 'Blocks outside mail with project words' }
    }
}
function global:Get-JournalRule { throw [System.UnauthorizedAccessException]::new("The operation couldn't be performed because 'alex@contoso.com' doesn't have the Journaling role.") }
function global:Get-TenantAllowBlockListItems {
    param($ListType)
    if ($ListType -eq 'IP') { return [pscustomobject]@{ Value = '198.51.100.7'; Action = 'Block'; ListType = 'IP'; ExpirationDate = $null } }
    if ($ListType -eq 'Sender') { return [pscustomobject]@{ Value = 'partner.example'; Action = 'Allow'; ListType = 'Sender' } }
}
function global:Get-IRMConfiguration { [pscustomobject]@{ AzureRMSLicensingEnabled = $true; SimplifiedClientAccessEnabled = $true; ClientSecret = 'stubval1'; ServicePassword = 'stubval1' } }
function global:Get-OMEConfiguration { [pscustomobject]@{ Identity = 'OME Configuration'; Image = [byte[]](1..64); BackgroundColor = '#ffffff'; OTPEnabled = $true } }
function global:Get-Mailbox {
    param($Identity)
    [pscustomobject]@{
        DisplayName = 'Alex Wilber'; PrimarySmtpAddress = [StubId]::new($Identity); DistinguishedName = 'CN=alex,OU=contoso.onmicrosoft.com'
        ForwardingSmtpAddress = 'smtp:alex.home@fabrikam.example'; DeliverToMailboxAndForward = $true
        LitigationHoldEnabled = $true; InPlaceHolds = @('mbxaaaaaaaa00004000800000000000a1:1'); RetentionPolicy = [StubId]::new('Default MRM Policy')
        GrantSendOnBehalfTo = @([StubId]::new('Adele Vance'))
    }
}
function global:Get-Recipient { param($Filter, $ResultSize) if ($Filter -match "Members -eq 'CN=alex") { [pscustomobject]@{ DisplayName = 'Finance'; PrimarySmtpAddress = 'finance@contoso.com'; RecipientTypeDetails = 'MailUniversalDistributionGroup' } } }
function global:Get-InboxRule { param($Mailbox, [switch]$IncludeHidden) [pscustomobject]@{ Name = 'Forward invoices'; Enabled = $true; ForwardTo = @('"Ext" [SMTP:ap@fabrikam.example]'); SubjectContainsWords = @('invoice') } }
function global:Get-MailboxFolderStatistics { param($Identity, $FolderScope) [pscustomobject]@{ FolderType = 'Calendar'; FolderPath = '/Calendar' } }
function global:Get-DlpComplianceRule {
    [pscustomobject]@{ Name = 'Credit cards out'; ParentPolicyName = 'Financial data'; BlockAccess = $true
        ContentContainsSensitiveInformation = @(@{ name = 'Credit Card Number'; mincount = '1'; confidencelevel = 'High' }) }
}
# Get-ExoPhishSimOverrideRule is left undefined on purpose: the export must record it as unavailable.

# Like the real cmdlet, Get-CaseHoldPolicy refuses to list every hold without a case or policy.
function global:Get-CaseHoldPolicy {
    param($Case, $Identity)
    if (-not $Case -and -not $Identity) { throw '|Microsoft.Exchange.Management.UnifiedPolicy.ErrorMustSpecifyCaseOrPolicyException|To retrieve a case hold policy, please specify a policy or a case id.' }
    [pscustomobject]@{ Name = "Hold in $Case"; Guid = 'aaaaaaaa-0000-4000-8000-000000000001'; CaseId = [string]$Case; Enabled = $true; ExchangeLocation = @('alex@contoso.com') }
}
