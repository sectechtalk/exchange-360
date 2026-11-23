# Test double for the ExchangeOnlineManagement module. It lets tests run server/Invoke-Ex360Command.ps1
# end to end without a tenant. Objects mimic the awkward shapes real cmdlets return: identity types that
# are objects, and a dictionary with non-string keys that ConvertTo-Json refuses to write.
class FakeId {
    [string]$Name
    FakeId([string]$n) { $this.Name = $n }
    [string] ToString() { return $this.Name }
}
$script:boxes = @(
    [pscustomobject]@{ DisplayName = 'Alex Wilber'; PrimarySmtpAddress = [FakeId]::new('alex@contoso.com'); UserPrincipalName = 'alex@contoso.com'; RecipientTypeDetails = 'UserMailbox'; DistinguishedName = 'CN=alex,OU=contoso'; ProhibitSendQuota = [FakeId]::new('99 GB (106,300,440,576 bytes)'); ForwardingSmtpAddress = $null; ForwardingAddress = $null; DeliverToMailboxAndForward = $false; GrantSendOnBehalfTo = @([FakeId]::new('Adele Vance')); LitigationHoldEnabled = $false; RetentionHoldEnabled = $false; RetentionPolicy = [FakeId]::new('Default MRM Policy'); PersistedCapabilities = @{ 1 = 'BPOS_S_Enterprise' } }
    [pscustomobject]@{ DisplayName = 'Sales'; PrimarySmtpAddress = [FakeId]::new('sales@contoso.com'); UserPrincipalName = 'sales@contoso.com'; RecipientTypeDetails = 'SharedMailbox'; DistinguishedName = 'CN=sales,OU=contoso'; GrantSendOnBehalfTo = @([FakeId]::new('CN=alex,OU=contoso')); PersistedCapabilities = @{ 2 = 'x' } }
)
function Connect-ExchangeOnline { [CmdletBinding()] param($AccessToken, $UserPrincipalName, $Organization, [switch]$ShowBanner, [switch]$DisableWAM) }
function Disconnect-ExchangeOnline { [CmdletBinding()] param([switch]$Confirm) }
function Get-Mailbox {
    [CmdletBinding()] param($Identity, $ResultSize, $Filter, $RecipientTypeDetails)
    if ($Identity) { return $script:boxes | Where-Object { [string]$_.PrimarySmtpAddress -eq $Identity } }
    if ($Filter -match "GrantSendOnBehalfTo -eq '(.+)'") { $dn = $Matches[1]; return $script:boxes | Where-Object { @($_.GrantSendOnBehalfTo | ForEach-Object { [string]$_ }) -contains $dn } }
    $script:boxes
}
function Get-User { [CmdletBinding()] param($Identity) [pscustomobject]@{ AuthenticationPolicy = $null } }
function Get-MailboxStatistics { [CmdletBinding()] param($Identity, [switch]$Archive) [pscustomobject]@{ TotalItemSize = [FakeId]::new('1.2 GB'); ItemCount = 42; Extra = @{ 3 = 'z' } } }
function Get-CASMailbox { [CmdletBinding()] param($Identity) [pscustomobject]@{ OWAEnabled = $true; MAPIEnabled = $true; EwsEnabled = $true; ActiveSyncEnabled = $true; PopEnabled = $false; ImapEnabled = $false; SmtpClientAuthenticationDisabled = $null } }
function Get-InboxRule { [CmdletBinding()] param($Mailbox) }
function Get-MailboxPermission {
    [CmdletBinding()] param($Identity, $User)
    $rows = @(
        [pscustomobject]@{ Identity = 'alex'; Mailbox = 'alex@contoso.com'; User = [FakeId]::new('NT AUTHORITY\SELF'); AccessRights = @('FullAccess', 'ReadPermission'); IsInherited = $false; Deny = $false }
        [pscustomobject]@{ Identity = 'alex'; Mailbox = 'alex@contoso.com'; User = [FakeId]::new('megan@contoso.com'); AccessRights = @('FullAccess'); IsInherited = $false; Deny = $false }
        [pscustomobject]@{ Identity = 'sales'; Mailbox = 'sales@contoso.com'; User = [FakeId]::new('alex@contoso.com'); AccessRights = @('FullAccess'); IsInherited = $false; Deny = $false }
    ) | Where-Object { $_.Mailbox -eq $Identity }
    if ($User) { $rows = $rows | Where-Object { [string]$_.User -eq $User } }
    $rows
}
function Get-RecipientPermission {
    [CmdletBinding()] param($Identity, $Trustee, $ResultSize)
    $rows = @(
        [pscustomobject]@{ Identity = [FakeId]::new('alex'); Mailbox = 'alex@contoso.com'; Trustee = [FakeId]::new('NT AUTHORITY\SELF'); AccessRights = @('SendAs'); AccessControlType = 'Allow' }
        [pscustomobject]@{ Identity = [FakeId]::new('Sales'); Mailbox = 'sales@contoso.com'; Trustee = [FakeId]::new('alex@contoso.com'); AccessRights = @('SendAs'); AccessControlType = 'Allow' }
    )
    if ($Identity) { return $rows | Where-Object { $_.Mailbox -eq $Identity } }
    $rows | Where-Object { [string]$_.Trustee -eq $Trustee }
}
function Search-AdminAuditLog { [CmdletBinding()] param($StartDate, $EndDate, $ResultSize) [pscustomobject]@{ CmdletName = 'Set-Mailbox'; Caller = 'admin'; Parameters = @{ 1 = 'odd key' } } }
function Get-OrganizationConfig { [CmdletBinding()] param() [pscustomobject]@{ Name = 'contoso'; DisplayName = 'Contoso' } }
function Get-AdminAuditLogConfig { [CmdletBinding()] param() [pscustomobject]@{ AdminAuditLogEnabled = $true; UnifiedAuditLogIngestionEnabled = $true } }
# Recipient properties: every mail-enabled recipient, not only mailboxes.
$script:recipients = @(
    [pscustomobject]@{ DisplayName = 'Alex Wilber'; PrimarySmtpAddress = [FakeId]::new('alex@contoso.com'); RecipientTypeDetails = 'UserMailbox'; EmailAddresses = @('SMTP:alex@contoso.com'); ExternalEmailAddress = $null; HiddenFromAddressListsEnabled = $false }
    [pscustomobject]@{ DisplayName = 'Sales'; PrimarySmtpAddress = [FakeId]::new('sales@contoso.com'); RecipientTypeDetails = 'SharedMailbox'; EmailAddresses = @('SMTP:sales@contoso.com'); ExternalEmailAddress = $null; HiddenFromAddressListsEnabled = $false }
    [pscustomobject]@{ DisplayName = 'Marketing'; PrimarySmtpAddress = [FakeId]::new('marketing@contoso.com'); RecipientTypeDetails = 'GroupMailbox'; EmailAddresses = @('SMTP:marketing@contoso.com'); ExternalEmailAddress = $null; HiddenFromAddressListsEnabled = $false }
    [pscustomobject]@{ DisplayName = 'All Staff'; PrimarySmtpAddress = [FakeId]::new('allstaff@contoso.com'); RecipientTypeDetails = 'MailUniversalDistributionGroup'; EmailAddresses = @('SMTP:allstaff@contoso.com'); ExternalEmailAddress = $null; HiddenFromAddressListsEnabled = $false }
    [pscustomobject]@{ DisplayName = 'Fabrikam Billing'; PrimarySmtpAddress = [FakeId]::new('billing@fabrikam.example'); RecipientTypeDetails = 'MailContact'; EmailAddresses = @('SMTP:billing@fabrikam.example'); ExternalEmailAddress = [FakeId]::new('SMTP:billing@fabrikam.example'); HiddenFromAddressListsEnabled = $false }
    [pscustomobject]@{ DisplayName = 'Pat Contractor'; PrimarySmtpAddress = [FakeId]::new('pat.contractor@contoso.com'); RecipientTypeDetails = 'MailUser'; EmailAddresses = @('SMTP:pat.contractor@contoso.com'); ExternalEmailAddress = [FakeId]::new('SMTP:pat@northwind.example'); HiddenFromAddressListsEnabled = $false }
)
function Get-Recipient { [CmdletBinding()] param($Identity, $ResultSize) $hit = $script:recipients | Where-Object { [string]$_.PrimarySmtpAddress -eq $Identity }; if (-not $hit) { throw "The operation couldn't be performed because object '$Identity' couldn't be found." }; $hit }
$script:members = @(
    [pscustomobject]@{ DisplayName = 'Alex Wilber'; PrimarySmtpAddress = [FakeId]::new('alex@contoso.com'); RecipientTypeDetails = 'UserMailbox' }
    [pscustomobject]@{ DisplayName = 'Sales'; PrimarySmtpAddress = [FakeId]::new('sales@contoso.com'); RecipientTypeDetails = 'SharedMailbox' }
)
$script:groupProps = @{ AcceptMessagesOnlyFromSendersOrMembers = @([FakeId]::new('Alex Wilber')); RequireSenderAuthenticationEnabled = $true; HiddenFromAddressListsEnabled = $false; GrantSendOnBehalfTo = @([FakeId]::new('Alex Wilber')); ManagedBy = @([FakeId]::new('Alex Wilber')) }
function Get-UnifiedGroup { [CmdletBinding()] param($Identity) [pscustomobject](@{ AccessType = 'Private'; AutoSubscribeNewMembers = $false } + $script:groupProps) }
function Get-UnifiedGroupLinks { [CmdletBinding()] param($Identity, $LinkType, $ResultSize) if ($LinkType -eq 'Owners') { $script:members[0] } else { $script:members } }
function Get-DistributionGroup { [CmdletBinding()] param($Identity) [pscustomobject](@{ MemberJoinRestriction = 'Closed'; MemberDepartRestriction = 'Closed' } + $script:groupProps) }
function Get-DistributionGroupMember { [CmdletBinding()] param($Identity, $ResultSize) $script:members }
function Get-DynamicDistributionGroup { [CmdletBinding()] param($Identity) [pscustomobject](@{ RecipientFilter = "RecipientType -eq 'UserMailbox'" } + $script:groupProps) }
function Get-DynamicDistributionGroupMember { [CmdletBinding()] param($Identity, $ResultSize) $script:members }
function Get-MailUser { [CmdletBinding()] param($Identity) [pscustomobject]@{ GrantSendOnBehalfTo = @() } }
# Admin roles, User roles, Role assignments and scopes, App access.
function Get-RoleGroup { [CmdletBinding()] param($ResultSize) [pscustomobject]@{ Name = 'Organization Management'; DisplayName = 'Organization Management'; Description = 'Org admins'; Roles = @([FakeId]::new('Mail Recipients')); Members = @([FakeId]::new('Adele Vance')); ManagedBy = @([FakeId]::new('Organization Management')); WhenChanged = '2026-10-02' } }
function Get-RoleAssignmentPolicy { [CmdletBinding()] param() [pscustomobject]@{ Name = 'Default Role Assignment Policy'; Description = 'Default'; IsDefault = $true; AssignedRoles = @([FakeId]::new('MyBaseOptions'), [FakeId]::new('MyVoiceMail')); WhenChanged = '2026-09-01' } }
function Get-ManagementRoleAssignment { [CmdletBinding()] param($ResultSize, $RoleAssigneeType) [pscustomobject]@{ Name = 'a1'; Role = [FakeId]::new('Mail Recipients'); RoleAssigneeName = 'Organization Management'; RoleAssigneeType = 'RoleGroup'; AssignmentMethod = 'Direct'; RecipientWriteScope = 'Organization'; CustomRecipientWriteScope = $null; CustomResourceScope = $null; Enabled = $true } }
function Get-ManagementScope { [CmdletBinding()] param() [pscustomobject]@{ Name = 'Sales users'; ScopeRestrictionType = 'RecipientScope'; RecipientFilter = "Department -eq 'Sales'"; RecipientRoot = $null; Exclusive = $false } }
function Get-ServicePrincipal { [CmdletBinding()] param() [pscustomobject]@{ DisplayName = 'Room booking app'; AppId = [guid]::Empty; ObjectId = [guid]::Empty } }
# A tenant with no application access policies answers with this error, not an empty list.
function Get-ApplicationAccessPolicy { [CmdletBinding()] param() throw "The operation couldn't be performed because object 'OU=contoso.onmicrosoft.com,OU=Microsoft Exchange Hosted Organizations,DC=namp220a009,DC=prod,DC=outlook,DC=com\*' couldn't be found on 'MN0P220A09DC003.namp220a009.prod.outlook.com'." }
