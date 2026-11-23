# Read-only Exchange Online calls for Ex360. The token is read from a file, never from the command line.
# Every mode is a read. Cmdlets are Get- or Search-. Nothing in this script writes to the tenant.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$TokenPath,
    [Parameter(Mandatory)][string]$Organization,
    [Parameter()][string]$UserPrincipalName = '',
    [Parameter(Mandatory)][ValidateSet('ping', 'org', 'mailbox', 'report', 'trace', 'migrations', 'exoroles', 'adminaudit', 'ipps', 'govern', 'recipients', 'quarantine', 'search', 'rights')][string]$Mode,
    [Parameter(Mandatory)][string]$ArgsPath
)

$ErrorActionPreference = 'Stop'
function Write-Result($obj) {
    # Some Exchange objects carry dictionaries with non-string keys, which ConvertTo-Json cannot write.
    # If the whole result fails, flatten only the reads that fail to plain strings and try again,
    # so one awkward property never hides every other read on the page.
    try {
        $obj | ConvertTo-Json -Depth 6 -Compress -ErrorAction Stop
        return
    } catch {
        if (-not $obj.commands) { throw }
    }
    foreach ($c in @($obj.commands)) {
        if (-not $c.ok -or $null -eq $c.value) { continue }
        try { $null = $c.value | ConvertTo-Json -Depth 6 -Compress -ErrorAction Stop }
        catch {
            try { $c.value = @($c.value | ForEach-Object { ConvertTo-Ex360Flat $_ }); $null = $c.value | ConvertTo-Json -Depth 6 -Compress -ErrorAction Stop }
            catch { $c.ok = $false; $c.value = $null; $c | Add-Member -NotePropertyName error -NotePropertyValue "Ex360 could not convert this read to JSON: $($_.Exception.Message)" -Force }
        }
    }
    $obj | ConvertTo-Json -Depth 6 -Compress -ErrorAction Stop
}

# Get-ApplicationAccessPolicy fails with "object '<org DN>\*' couldn't be found" when the tenant has no
# application access policies. That error means none, so it returns an empty list instead.
function Get-Ex360AppAccessPolicies {
    try { Get-ApplicationAccessPolicy -ErrorAction Stop }
    catch { if ($_.Exception.Message -match "\\\*' couldn't be found") { @() } else { throw } }
}

function Invoke-Read($name, $script) {
    try {
        $value = & $script
        [pscustomobject]@{ ok = $true; name = $name; value = @($value) }
    } catch {
        [pscustomobject]@{ ok = $false; name = $name; error = $_.Exception.Message }
    }
}

# Fallback for Write-Result: every property flattened to plain strings. Byte arrays and long text are shortened.
$flatSkip = 'PSComputerName', 'PSShowComputerName', 'RunspaceId', 'ObjectState', 'IsValid', 'OrganizationId', 'OriginatingServer', 'ExchangeVersion', 'DistinguishedName', 'ObjectCategory', 'ObjectClass', 'Id', 'Guid', 'ExchangeObjectId', 'WhenChangedUTC', 'WhenCreatedUTC', 'OrganizationalUnitRoot', 'PSStandardMembers'
function ConvertTo-Ex360Flat($obj) {
    $h = [ordered]@{}
    foreach ($p in @($obj.PSObject.Properties)) {
        if ($p.Name -in $flatSkip) { continue }
        $v = $p.Value
        if ($null -eq $v) { $h[$p.Name] = $null }
        elseif ($v -is [byte[]]) { $h[$p.Name] = "(binary, $($v.Length) bytes)" }
        elseif ($v -is [bool] -or $v -is [int] -or $v -is [long]) { $h[$p.Name] = $v }
        elseif ($v -is [string]) { $h[$p.Name] = if ($v.Length -gt 2000) { $v.Substring(0, 2000) + '...' } else { $v } }
        elseif ($v -is [System.Collections.IDictionary]) { $h[$p.Name] = @($v.Keys | Select-Object -First 100 | ForEach-Object { "$_=$($v[$_])" }) }
        elseif ($v -is [System.Collections.IEnumerable]) { $h[$p.Name] = @($v | Select-Object -First 100 | ForEach-Object { $t = [string]$_; if ($t.Length -gt 500) { $t.Substring(0, 500) + '...' } else { $t } }) }
        else { $t = [string]$v; $h[$p.Name] = if ($t.Length -gt 2000) { $t.Substring(0, 2000) + '...' } else { $t } }
    }
    [pscustomobject]$h
}

try {
    if (-not (Get-Module -ListAvailable ExchangeOnlineManagement)) {
        Write-Result @{ ok = $false; available = $false; message = 'The ExchangeOnlineManagement module is not installed. The Ex360 container image installs it.' }
        exit 2
    }
    $token = (Get-Content -LiteralPath $TokenPath -Raw).Trim()
    Import-Module ExchangeOnlineManagement -ErrorAction Stop
    # Learn (exchange-ps, current module page): -AccessToken is paired with -Organization for certificate
    # and managed-identity (app-only) connections. A delegated user token uses -UserPrincipalName.
    $upn = [string]$UserPrincipalName
    $delegated = $upn -match '^[^@\s]+@[^@\s]+$'
    if ($Mode -in 'ipps', 'govern') {
        if ($delegated) { Connect-IPPSSession -AccessToken $token -UserPrincipalName $upn | Out-Null }
        else { Connect-IPPSSession -AccessToken $token -Organization $Organization | Out-Null }
    } elseif ($delegated) {
        Connect-ExchangeOnline -AccessToken $token -UserPrincipalName $upn -ShowBanner:$false -DisableWAM | Out-Null
    } else {
        Connect-ExchangeOnline -AccessToken $token -Organization $Organization -ShowBanner:$false -DisableWAM | Out-Null
    }
    $request = Get-Content -LiteralPath $ArgsPath -Raw | ConvertFrom-Json
    $out = [ordered]@{ ok = $true; mode = $Mode }

    if ($Mode -eq 'ping') {
        # Setup steps: prove the connection works with the smallest possible read.
        $out.commands = @(
            (Invoke-Read 'connection' { Get-ConnectionInformation | Select-Object -First 1 UserPrincipalName, TenantID, State }),
            (Invoke-Read 'org' { Get-OrganizationConfig | Select-Object Name, DisplayName })
        )
        $failed = @($out.commands | Where-Object { -not $_.ok })
        if ($failed.Count) { throw (($failed | ForEach-Object { "$($_.name): $($_.error)" }) -join ' ') }
    } elseif ($Mode -eq 'org') {
        # Organization configuration for the org pages and Config review. Reads only, with picked properties
        # so the JSON stays small and the shape is the same as the demo data.
        $str = { param($v) @($v | Where-Object { $_ } | ForEach-Object { [string]$_ } | Select-Object -Unique) }
        $recipientScope = 'Name', 'Identity', 'Priority', 'State', 'Comments', 'SentTo', 'SentToMemberOf', 'RecipientDomainIs', 'ExceptIfSentTo', 'ExceptIfSentToMemberOf', 'ExceptIfRecipientDomainIs'
        $senderScope = 'Name', 'Identity', 'Priority', 'State', 'From', 'FromMemberOf', 'SenderDomainIs', 'ExceptIfFrom', 'ExceptIfFromMemberOf', 'ExceptIfSenderDomainIs'
        # Mail flow rules list columns the Exchange admin center shows (Size, Last execution, Configuration supported,
        # Unsupported reason). Property names differ between module versions, so take the first one present and
        # leave it empty when none is; the page then shows a dash instead of a guess.
        $pick = { param($o, [string[]]$names) foreach ($n in $names) { $p = $o.PSObject.Properties[$n]; if ($p -and $null -ne $p.Value -and "$($p.Value)" -ne '') { if ($p.Value -is [bool] -or $p.Value -is [int] -or $p.Value -is [long]) { return $p.Value }; return [string]$p.Value } }; $null }
        $out.commands = @(
            (Invoke-Read 'org' { Get-OrganizationConfig | Select-Object Name, DisplayName, OAuth2ClientProfileEnabled, DefaultAuthenticationPolicy, AuditDisabled, MailTipsExternalRecipientsTipsEnabled, AutoExpandingArchiveEnabled }),
            (Invoke-Read 'transport' { Get-TransportConfig | Select-Object SmtpClientAuthenticationDisabled, MaxSendSize, MaxReceiveSize, MaxRecipientEnvelopeLimit, ReplyAllStormProtectionEnabled, ExternalPostmasterAddress }),
            (Invoke-Read 'externalTag' { Get-ExternalInOutlook | Select-Object Enabled, AllowList }),
            (Invoke-Read 'auditConfig' { Get-AdminAuditLogConfig | Select-Object UnifiedAuditLogIngestionEnabled, AdminAuditLogEnabled }),
            (Invoke-Read 'accepted' { Get-AcceptedDomain | Select-Object Name, DomainName, DomainType, Default, MatchSubDomains }),
            (Invoke-Read 'remote' { Get-RemoteDomain | Select-Object Name, DomainName, AutoForwardEnabled, AutoReplyEnabled, AllowedOOFType, DeliveryReportEnabled, NDREnabled, TNEFEnabled }),
            (Invoke-Read 'dkim' { Get-DkimSigningConfig | Select-Object Domain, Enabled, Status, Selector1CNAME, Selector2CNAME, RotateOnDate }),
            (Invoke-Read 'arc' { Get-ArcConfig | Select-Object @{n = 'ArcTrustedSealers'; e = { & $str $_.ArcTrustedSealers } } }),
            (Invoke-Read 'inbound' { Get-InboundConnector | Select-Object Name, Enabled, ConnectorType, ConnectorSource, @{n = 'SenderDomains'; e = { & $str $_.SenderDomains } }, @{n = 'SenderIPAddresses'; e = { & $str $_.SenderIPAddresses } }, RequireTls, RestrictDomainsToCertificate, RestrictDomainsToIPAddresses, TlsSenderCertificateName, EFSkipLastIP, @{n = 'EFSkipIPs'; e = { & $str $_.EFSkipIPs } }, Comment }),
            (Invoke-Read 'outbound' { Get-OutboundConnector | Select-Object Name, Enabled, ConnectorType, ConnectorSource, @{n = 'RecipientDomains'; e = { & $str $_.RecipientDomains } }, @{n = 'SmartHosts'; e = { & $str $_.SmartHosts } }, TlsSettings, TlsDomain, UseMXRecord, IsTransportRuleScoped, RouteAllMessagesViaOnPremises, AllAcceptedDomains, Comment }),
            (Invoke-Read 'rules' { Get-TransportRule | Select-Object Name, Priority, State, Mode, Description, Comments, StopRuleProcessing, SentTo, SentToMemberOf, SentToScope, RecipientDomainIs, From, FromMemberOf, FromScope, SenderDomainIs, ExceptIfSentTo, ExceptIfSentToMemberOf, ExceptIfRecipientDomainIs, ExceptIfFrom, ExceptIfFromMemberOf, ExceptIfSenderDomainIs, @{n = 'SenderIpRanges'; e = { & $str $_.SenderIpRanges } }, SetSCL, SetHeaderName, SetHeaderValue, PrependSubject, RejectMessageReasonText, RejectMessageEnhancedStatusCode, DeleteMessage, Quarantine, RedirectMessageTo, BlindCopyTo, AddToRecipients, CopyTo, ModerateMessageByUser, ModerateMessageByManager, RouteMessageOutboundConnector, ApplyOME, ApplyRightsProtectionTemplate, GenerateIncidentReport, SetAuditSeverity, ActivationDate, ExpiryDate, WhenChanged, RuleErrorAction, SenderAddressLocation, @{n = 'Size'; e = { & $pick $_ 'Size', 'RuleSize' } }, @{n = 'LastExecution'; e = { & $pick $_ 'LastExecutionTime', 'LastExecutedTime', 'LastExecuted', 'LastExecution' } }, @{n = 'ConfigurationSupported'; e = { & $pick $_ 'IsRuleConfigurationSupported', 'IsConfigurationSupported', 'ConfigurationSupported' } }, @{n = 'UnsupportedReason'; e = { & $pick $_ 'RuleConfigurationUnsupportedReason', 'UnsupportedReason', 'ConfigurationUnsupportedReason' } } }),
            (Invoke-Read 'presetEop' { Get-EOPProtectionPolicyRule | Select-Object ($recipientScope + 'HostedContentFilterPolicy', 'MalwareFilterPolicy', 'AntiPhishPolicy') }),
            (Invoke-Read 'presetAtp' { Get-ATPProtectionPolicyRule | Select-Object ($recipientScope + 'SafeLinksPolicy', 'SafeAttachmentPolicy', 'AntiPhishPolicy') }),
            (Invoke-Read 'builtIn' { Get-ATPBuiltInProtectionRule | Select-Object ($recipientScope + 'SafeLinksPolicy', 'SafeAttachmentPolicy') }),
            (Invoke-Read 'connectionPolicy' { Get-HostedConnectionFilterPolicy | Select-Object Name, IsDefault, EnableSafeList, @{n = 'IPAllowList'; e = { & $str $_.IPAllowList } }, @{n = 'IPBlockList'; e = { & $str $_.IPBlockList } } }),
            (Invoke-Read 'spamRule' { Get-HostedContentFilterRule | Select-Object ($recipientScope + 'HostedContentFilterPolicy') }),
            (Invoke-Read 'spamPolicy' { Get-HostedContentFilterPolicy | Select-Object Name, IsDefault, RecommendedPolicyType, SpamAction, HighConfidenceSpamAction, PhishSpamAction, HighConfidencePhishAction, BulkSpamAction, BulkThreshold, QuarantineRetentionPeriod, SpamQuarantineTag, HighConfidenceSpamQuarantineTag, PhishQuarantineTag, HighConfidencePhishQuarantineTag, BulkQuarantineTag, InlineSafetyTipsEnabled, SpamZapEnabled, PhishZapEnabled, @{n = 'AllowedSenderCount'; e = { @($_.AllowedSenders).Count + @($_.AllowedSenderDomains).Count } }, @{n = 'AllowedSenderDomains'; e = { & $str $_.AllowedSenderDomains } }, @{n = 'BlockedSenderCount'; e = { @($_.BlockedSenders).Count + @($_.BlockedSenderDomains).Count } } }),
            (Invoke-Read 'malwareRule' { Get-MalwareFilterRule | Select-Object ($recipientScope + 'MalwareFilterPolicy') }),
            (Invoke-Read 'malwarePolicy' { Get-MalwareFilterPolicy | Select-Object Name, IsDefault, RecommendedPolicyType, EnableFileFilter, FileTypeAction, ZapEnabled, QuarantineTag, EnableInternalSenderAdminNotifications, @{n = 'FileTypeCount'; e = { @($_.FileTypes).Count } } }),
            (Invoke-Read 'phishRule' { Get-AntiPhishRule | Select-Object ($recipientScope + 'AntiPhishPolicy') }),
            (Invoke-Read 'phishPolicy' { Get-AntiPhishPolicy | Select-Object Name, IsDefault, RecommendedPolicyType, Enabled, PhishThresholdLevel, EnableSpoofIntelligence, AuthenticationFailAction, HonorDmarcPolicy, DmarcQuarantineAction, DmarcRejectAction, EnableFirstContactSafetyTips, EnableUnauthenticatedSender, EnableViaTag, EnableMailboxIntelligence, EnableMailboxIntelligenceProtection, MailboxIntelligenceProtectionAction, EnableTargetedUserProtection, TargetedUserProtectionAction, @{n = 'TargetedUsersCount'; e = { @($_.TargetedUsersToProtect).Count } }, EnableOrganizationDomainsProtection, EnableTargetedDomainsProtection, TargetedDomainProtectionAction, EnableSimilarUsersSafetyTips, EnableSimilarDomainsSafetyTips, EnableUnusualCharactersSafetyTips }),
            (Invoke-Read 'safeLinksRule' { Get-SafeLinksRule | Select-Object ($recipientScope + 'SafeLinksPolicy') }),
            (Invoke-Read 'safeLinksPolicy' { Get-SafeLinksPolicy | Select-Object Name, IsBuiltInProtection, RecommendedPolicyType, EnableSafeLinksForEmail, EnableSafeLinksForTeams, EnableSafeLinksForOffice, ScanUrls, DeliverMessageAfterScan, EnableForInternalSenders, TrackClicks, AllowClickThrough, DisableUrlRewrite }),
            (Invoke-Read 'safeAttachRule' { Get-SafeAttachmentRule | Select-Object ($recipientScope + 'SafeAttachmentPolicy') }),
            (Invoke-Read 'safeAttachPolicy' { Get-SafeAttachmentPolicy | Select-Object Name, IsBuiltInProtection, RecommendedPolicyType, Enable, Action, Redirect, RedirectAddress, QuarantineTag }),
            (Invoke-Read 'atpGlobal' { Get-AtpPolicyForO365 | Select-Object EnableATPForSPOTeamsODB, EnableSafeDocs, AllowSafeDocsOpen }),
            (Invoke-Read 'outboundRule' { Get-HostedOutboundSpamFilterRule | Select-Object ($senderScope + 'HostedOutboundSpamFilterPolicy') }),
            (Invoke-Read 'outboundPolicy' { Get-HostedOutboundSpamFilterPolicy | Select-Object Name, IsDefault, AutoForwardingMode, RecipientLimitExternalPerHour, RecipientLimitInternalPerHour, RecipientLimitPerDay, ActionWhenThresholdReached }),
            (Invoke-Read 'allowSenders' { Get-TenantAllowBlockListItems -ListType Sender -Allow | Select-Object Value, Action, ExpirationDate, Notes, LastModifiedDateTime, ModifiedBy, LastUsedDate }),
            (Invoke-Read 'quarantine' { Get-QuarantinePolicy | Select-Object Name, QuarantinePolicyType, EndUserQuarantinePermissionsValue, ESNEnabled, WhenChanged }),
            (Invoke-Read 'auth' { Get-AuthenticationPolicy | Select-Object Name, AllowBasicAuthSmtp, AllowBasicAuthPop, AllowBasicAuthImap, AllowBasicAuthActiveSync, AllowBasicAuthWebServices, AllowBasicAuthAutodiscover }),
            (Invoke-Read 'retention' { Get-RetentionPolicy | Select-Object Name, IsDefault, @{n = 'RetentionPolicyTagLinks'; e = { & $str $_.RetentionPolicyTagLinks } } }),
            (Invoke-Read 'retentionTags' { Get-RetentionPolicyTag | Select-Object Name, Type, RetentionEnabled, AgeLimitForRetention, RetentionAction }),
            (Invoke-Read 'owa' { Get-OwaMailboxPolicy | Select-Object Name, IsDefault, ExternalImageProxyEnabled, DirectFileAccessOnPublicComputersEnabled, AdditionalStorageProvidersAvailable }),
            (Invoke-Read 'mobile' { Get-MobileDeviceMailboxPolicy | Select-Object Name, IsDefault, PasswordEnabled, AllowNonProvisionableDevices }),
            (Invoke-Read 'sharing' { Get-SharingPolicy | Select-Object Name, Default, Enabled, @{n = 'Domains'; e = { & $str $_.Domains } } })
        )
        foreach ($c in $out.commands) {
            if ($c.ok -and $c.name -in 'rules', 'presetEop', 'presetAtp', 'builtIn', 'spamRule', 'malwareRule', 'phishRule', 'safeLinksRule', 'safeAttachRule', 'outboundRule') {
                foreach ($row in $c.value) {
                    foreach ($p in @($row.PSObject.Properties | Where-Object { $_.Name -match '^(ExceptIf)?(SentTo|SentToMemberOf|From|FromMemberOf|RecipientDomainIs|SenderDomainIs)$|^(RedirectMessageTo|BlindCopyTo|AddToRecipients|CopyTo|ModerateMessageByUser|RouteMessageOutboundConnector)$' })) { $p.Value = & $str $p.Value }
                }
            }
        }
    } elseif ($Mode -eq 'recipients') {
        # Shared, room and equipment mailboxes, groups, and mailboxes that forward. Capped so a large tenant still answers.
        $str = { param($v) @($v | Where-Object { $_ } | ForEach-Object { [string]$_ } | Select-Object -Unique) }
        $out.commands = @(
            (Invoke-Read 'shared' {
                $rows = @(Get-Mailbox -RecipientTypeDetails SharedMailbox -ResultSize 500 | Select-Object DisplayName, PrimarySmtpAddress, ExternalDirectoryObjectId, RecipientTypeDetails, ArchiveStatus, @{n = 'WhenChanged'; e = { if ($_.WhenChangedUTC) { $_.WhenChangedUTC.ToString('o') } else { [string]$_.WhenChanged } } }, ForwardingSmtpAddress, @{n = 'ForwardingAddress'; e = { [string]$_.ForwardingAddress } }, MessageCopyForSentAsEnabled, MessageCopyForSendOnBehalfEnabled, HiddenFromAddressListsEnabled, LitigationHoldEnabled, @{n = 'GrantSendOnBehalfTo'; e = { & $str $_.GrantSendOnBehalfTo } })
                $i = 0
                foreach ($row in $rows) {
                    $i++
                    $count = $null
                    if ($i -le 50) { try { $count = @(Get-MailboxPermission -Identity $row.PrimarySmtpAddress -ErrorAction Stop | Where-Object { -not $_.IsInherited -and $_.User -notmatch 'NT AUTHORITY|S-1-5' }).Count } catch { $count = $null } }
                    $row | Add-Member -NotePropertyName FullAccessCount -NotePropertyValue $count
                }
                $rows
            }),
            (Invoke-Read 'resources' {
                $rows = @(Get-Mailbox -RecipientTypeDetails RoomMailbox, EquipmentMailbox -ResultSize 500 | Select-Object DisplayName, PrimarySmtpAddress, ExternalDirectoryObjectId, RecipientTypeDetails, ResourceCapacity, Office)
                $i = 0
                foreach ($row in $rows) {
                    $i++
                    $cal = $null
                    if ($i -le 100) { try { $cal = Get-CalendarProcessing -Identity $row.PrimarySmtpAddress -ErrorAction Stop | Select-Object AutomateProcessing, AllBookInPolicy, AllRequestInPolicy, @{n = 'BookInPolicy'; e = { & $str $_.BookInPolicy } }, @{n = 'ResourceDelegates'; e = { & $str $_.ResourceDelegates } }, AllowConflicts, BookingWindowInDays, MaximumDurationInMinutes, AllowRecurringMeetings, DeleteSubject, AddOrganizerToSubject, ProcessExternalMeetingMessages, ScheduleOnlyDuringWorkHours } catch { $cal = $null } }
                    $row | Add-Member -NotePropertyName Calendar -NotePropertyValue $cal
                }
                $rows
            }),
            (Invoke-Read 'forwarding' { Get-Mailbox -ResultSize 5000 -Filter "ForwardingSmtpAddress -ne `$null -or ForwardingAddress -ne `$null" | Select-Object DisplayName, PrimarySmtpAddress, ExternalDirectoryObjectId, RecipientTypeDetails, ArchiveStatus, ForwardingSmtpAddress, @{n = 'ForwardingAddress'; e = { [string]$_.ForwardingAddress } }, DeliverToMailboxAndForward }),
            (Invoke-Read 'counts' { Get-Mailbox -ResultSize 5000 | Group-Object RecipientTypeDetails | Select-Object Name, Count }),
            (Invoke-Read 'groups' {
                $rows = @(Get-DistributionGroup -ResultSize 1000 | Select-Object DisplayName, PrimarySmtpAddress, ExternalDirectoryObjectId, RecipientTypeDetails, @{n = 'ManagedBy'; e = { & $str $_.ManagedBy } }, RequireSenderAuthenticationEnabled, @{n = 'AcceptOnlyFromCount'; e = { @($_.AcceptMessagesOnlyFromSendersOrMembers).Count } }, ModerationEnabled, @{n = 'ModeratedBy'; e = { & $str $_.ModeratedBy } }, MemberJoinRestriction, MemberDepartRestriction, HiddenFromAddressListsEnabled, IsDirSynced, @{n = 'WhenCreated'; e = { if ($_.WhenCreatedUTC) { $_.WhenCreatedUTC.ToString('o') } else { [string]$_.WhenCreated } } })
                $i = 0
                foreach ($row in $rows) {
                    $i++
                    $count = $null
                    if ($i -le 100) { try { $count = @(Get-DistributionGroupMember -Identity $row.PrimarySmtpAddress -ResultSize 1001 -ErrorAction Stop).Count } catch { $count = $null } }
                    $row | Add-Member -NotePropertyName MemberCount -NotePropertyValue $count
                }
                $rows
            }),
            (Invoke-Read 'dynamic' { Get-DynamicDistributionGroup -ResultSize 500 | Select-Object DisplayName, PrimarySmtpAddress, IsDirSynced, @{n = 'WhenCreated'; e = { if ($_.WhenCreatedUTC) { $_.WhenCreatedUTC.ToString('o') } else { [string]$_.WhenCreated } } }, RecipientFilter, RequireSenderAuthenticationEnabled, @{n = 'ManagedBy'; e = { & $str $_.ManagedBy } } }),
            (Invoke-Read 'm365' { Get-UnifiedGroup -ResultSize 1000 | Select-Object DisplayName, PrimarySmtpAddress, ExternalDirectoryObjectId, AccessType, IsDirSynced, IsMembershipDynamic, @{n = 'ResourceProvisioningOptions'; e = { & $str $_.ResourceProvisioningOptions } }, @{n = 'WhenCreated'; e = { if ($_.WhenCreatedUTC) { $_.WhenCreatedUTC.ToString('o') } else { [string]$_.WhenCreated } } }, @{n = 'ManagedBy'; e = { & $str $_.ManagedBy } }, GroupMemberCount, GroupExternalMemberCount, RequireSenderAuthenticationEnabled, HiddenFromExchangeClientsEnabled, HiddenFromAddressListsEnabled, AutoSubscribeNewMembers })
        )
    } elseif ($Mode -eq 'search') {
        # Single recipient search: every recipient type that can receive inbound mail, including the ones
        # Microsoft Graph does not list (dynamic distribution lists, mail-enabled public folders, room lists).
        $q = ([string]$request.q).Trim()
        if (-not $q) { throw 'A name or address is required.' }
        $types = 'UserMailbox', 'SharedMailbox', 'RoomMailbox', 'EquipmentMailbox', 'LinkedMailbox', 'GroupMailbox', 'MailUniversalDistributionGroup', 'MailUniversalSecurityGroup', 'MailNonUniversalGroup', 'RoomList', 'DynamicDistributionGroup', 'MailContact', 'MailUser', 'GuestMailUser', 'PublicFolder'
        $out.commands = @(
            (Invoke-Read 'recipients' { Get-Recipient -Anr $q -RecipientTypeDetails $types -ResultSize 25 | Select-Object DisplayName, @{n = 'PrimarySmtpAddress'; e = { [string]$_.PrimarySmtpAddress } }, @{n = 'RecipientTypeDetails'; e = { [string]$_.RecipientTypeDetails } }, @{n = 'ExternalDirectoryObjectId'; e = { [string]$_.ExternalDirectoryObjectId } } })
        )
    } elseif ($Mode -eq 'rights') {
        # Which change cmdlets and parameters the signed-in person's Exchange role includes. Connect-ExchangeOnline
        # loads only the cmdlets and parameters their RBAC roles allow, so Get-Command answers this. Nothing is run.
        $rows = foreach ($c in @($request.checks)) {
            $name = [string]$c.cmdlet
            if ($name -notmatch '^(Set|New|Add|Remove|Enable|Disable)-[A-Za-z]+$') { continue }
            $found = Get-Command -Name $name -CommandType Function, Cmdlet -ErrorAction SilentlyContinue | Select-Object -First 1
            $missing = @(@($c.params) | Where-Object { $_ -and (-not $found -or -not $found.Parameters.ContainsKey([string]$_)) } | ForEach-Object { [string]$_ })
            [pscustomobject]@{ cmdlet = $name; available = [bool]$found; missing = $missing }
        }
        $out.commands = @([pscustomobject]@{ ok = $true; name = 'rights'; value = @($rows) })
    } elseif ($Mode -eq 'quarantine') {
        # Quarantined messages from the last few days. Reading does not release, preview or delete anything.
        $days = [int]$request.days
        if ($days -lt 1 -or $days -gt 30) { $days = 14 }
        $out.commands = @(
            (Invoke-Read 'messages' {
                $p = @{ StartReceivedDate = (Get-Date).AddDays(-$days); EndReceivedDate = (Get-Date); PageSize = 200 }
                if ($request.recipient) { $p.RecipientAddress = [string]$request.recipient }
                if ($request.sender) { $p.SenderAddress = [string]$request.sender }
                Get-QuarantineMessage @p | Select-Object ReceivedTime, SenderAddress, @{n = 'RecipientAddress'; e = { @($_.RecipientAddress | ForEach-Object { [string]$_ }) } }, Subject, Type, @{n = 'QuarantineTypes'; e = { [string]$_.QuarantineTypes } }, PolicyType, PolicyName, ReleaseStatus, Expires, Direction, MessageId, @{n = 'ReleasedUser'; e = { @($_.ReleasedUser | ForEach-Object { [string]$_ }) } }, @{n = 'OverrideReason'; e = { foreach ($n in 'OverrideReason', 'SenderAddressOverrideReason') { $p = $_.PSObject.Properties[$n]; if ($p -and "$($p.Value)" -ne '') { [string]$p.Value; break } } } }
            })
        )
    } elseif ($Mode -eq 'mailbox') {
        $id = [string]$request.identity
        if (-not $id) { throw 'A recipient identity is required.' }
        # Properties are picked and identity values turned into strings, so the JSON is small and always serializable.
        $str = { param($v) @($v | Where-Object { $_ } | ForEach-Object { [string]$_ } | Select-Object -Unique) }
        $member = { $input | Select-Object @{n = 'Name'; e = { [string]$_.DisplayName } }, @{n = 'PrimarySmtpAddress'; e = { [string]$_.PrimarySmtpAddress } }, @{n = 'RecipientTypeDetails'; e = { [string]$_.RecipientTypeDetails } } }
        # Single recipient: any mail-enabled recipient. Get-Recipient says what it is; only the reads that
        # apply to that type run, so a group or a contact never fails on mailbox-only cmdlets.
        $recipient = $null
        $recipientRead = Invoke-Read 'recipient' { $script:recipient = Get-Recipient -Identity $id; $script:recipient | Select-Object DisplayName, @{n = 'PrimarySmtpAddress'; e = { [string]$_.PrimarySmtpAddress } }, @{n = 'RecipientTypeDetails'; e = { [string]$_.RecipientTypeDetails } }, @{n = 'EmailAddresses'; e = { & $str $_.EmailAddresses } }, @{n = 'ExternalEmailAddress'; e = { [string]$_.ExternalEmailAddress } }, HiddenFromAddressListsEnabled }
        $rtype = [string]$script:recipient.RecipientTypeDetails
        $mailboxTypes = 'UserMailbox', 'SharedMailbox', 'RoomMailbox', 'EquipmentMailbox', 'SchedulingMailbox', 'LinkedMailbox'
        $box = $null
        if ($rtype -and $rtype -notin $mailboxTypes) {
            $sendAs = Invoke-Read 'sendas' { Get-RecipientPermission -Identity $id | Where-Object { $_.AccessControlType -ne 'Deny' } | Select-Object @{n = 'Trustee'; e = { [string]$_.Trustee } }, @{n = 'AccessRights'; e = { & $str $_.AccessRights } } }
            $delivery = @{n = 'AcceptMessagesOnlyFromSendersOrMembers'; e = { & $str $_.AcceptMessagesOnlyFromSendersOrMembers } }, 'RequireSenderAuthenticationEnabled', 'HiddenFromAddressListsEnabled', @{n = 'GrantSendOnBehalfTo'; e = { & $str $_.GrantSendOnBehalfTo } }, @{n = 'ManagedBy'; e = { & $str $_.ManagedBy } }
            if ($rtype -eq 'GroupMailbox') {
                $out.commands = @($recipientRead, $sendAs,
                    (Invoke-Read 'group' { Get-UnifiedGroup -Identity $id | Select-Object (@('AccessType', 'AutoSubscribeNewMembers') + $delivery) }),
                    (Invoke-Read 'members' { Get-UnifiedGroupLinks -Identity $id -LinkType Members -ResultSize 1000 | & $member }),
                    (Invoke-Read 'owners' { Get-UnifiedGroupLinks -Identity $id -LinkType Owners -ResultSize 1000 | & $member }),
                    (Invoke-Read 'stats' { Get-MailboxStatistics -Identity $id | Select-Object @{n = 'TotalItemSize'; e = { [string]$_.TotalItemSize } }, ItemCount }))
            } elseif ($rtype -eq 'DynamicDistributionGroup') {
                $out.commands = @($recipientRead, $sendAs,
                    (Invoke-Read 'group' { Get-DynamicDistributionGroup -Identity $id | Select-Object (@('RecipientFilter') + $delivery) }),
                    (Invoke-Read 'members' { Get-DynamicDistributionGroupMember -Identity $id -ResultSize 1000 | & $member }))
            } elseif ($rtype -like '*Group' -or $rtype -eq 'RoomList') {
                $out.commands = @($recipientRead, $sendAs,
                    (Invoke-Read 'group' { Get-DistributionGroup -Identity $id | Select-Object (@('MemberJoinRestriction', 'MemberDepartRestriction') + $delivery) }),
                    (Invoke-Read 'members' { Get-DistributionGroupMember -Identity $id -ResultSize 1000 | & $member }))
            } elseif ($rtype -eq 'MailContact') {
                $out.commands = @($recipientRead)
            } elseif ($rtype -eq 'PublicFolder') {
                # Mail-enabled public folder: mail lands in the folder. Who may send to it, and where it forwards.
                $out.commands = @($recipientRead, $sendAs,
                    (Invoke-Read 'group' { Get-MailPublicFolder -Identity $id | Select-Object (@(@{n = 'ForwardingAddress'; e = { [string]$_.ForwardingAddress } }, 'DeliverToMailboxAndForward', @{n = 'EntryId'; e = { [string]$_.EntryId } }) + $delivery) }))
            } else {
                # MailUser and GuestMailUser: an Entra account whose mailbox is somewhere else.
                $out.commands = @($recipientRead, $sendAs,
                    (Invoke-Read 'mailuser' { Get-MailUser -Identity $id | Select-Object @{n = 'GrantSendOnBehalfTo'; e = { & $str $_.GrantSendOnBehalfTo } } }),
                    (Invoke-Read 'userAuth' { Get-User -Identity $id | Select-Object @{n = 'AuthenticationPolicy'; e = { [string]$_.AuthenticationPolicy } } }))
            }
        } else {
        $out.commands = @($recipientRead,
            (Invoke-Read 'mailbox' { $script:box = Get-Mailbox -Identity $id; $script:box | Select-Object DisplayName, @{n = 'PrimarySmtpAddress'; e = { [string]$_.PrimarySmtpAddress } }, UserPrincipalName, RecipientTypeDetails, @{n = 'ProhibitSendQuota'; e = { [string]$_.ProhibitSendQuota } }, ForwardingSmtpAddress, @{n = 'ForwardingAddress'; e = { [string]$_.ForwardingAddress } }, DeliverToMailboxAndForward, @{n = 'GrantSendOnBehalfTo'; e = { & $str $_.GrantSendOnBehalfTo } }, LitigationHoldEnabled, RetentionHoldEnabled, @{n = 'RetentionPolicy'; e = { [string]$_.RetentionPolicy } } }),
            (Invoke-Read 'userAuth' { Get-User -Identity $id | Select-Object @{n = 'AuthenticationPolicy'; e = { [string]$_.AuthenticationPolicy } } }),
            # A blank per-user policy means the organization default applies (or none, when there is no default).
            (Invoke-Read 'orgAuth' { Get-OrganizationConfig | Select-Object @{n = 'DefaultAuthenticationPolicy'; e = { [string]$_.DefaultAuthenticationPolicy } } }),
            (Invoke-Read 'stats' { Get-MailboxStatistics -Identity $id | Select-Object @{n = 'TotalItemSize'; e = { [string]$_.TotalItemSize } }, ItemCount }),
            (Invoke-Read 'cas' { Get-CASMailbox -Identity $id | Select-Object OWAEnabled, MAPIEnabled, EwsEnabled, ActiveSyncEnabled, PopEnabled, ImapEnabled, SmtpClientAuthenticationDisabled }),
            (Invoke-Read 'inbox' { Get-InboxRule -Mailbox $id | Select-Object Name, Enabled, Priority, Description }),
            (Invoke-Read 'full' { Get-MailboxPermission -Identity $id | Where-Object { -not $_.IsInherited -and -not $_.Deny } | Select-Object @{n = 'User'; e = { [string]$_.User } }, @{n = 'AccessRights'; e = { & $str $_.AccessRights } } }),
            (Invoke-Read 'sendas' { Get-RecipientPermission -Identity $id | Where-Object { $_.AccessControlType -ne 'Deny' } | Select-Object @{n = 'Trustee'; e = { [string]$_.Trustee } }, @{n = 'AccessRights'; e = { & $str $_.AccessRights } } }),
            # The other direction: mailboxes this person can open, send as, or send on behalf of.
            (Invoke-Read 'grantedSendAs' { Get-RecipientPermission -Trustee $id -ResultSize 1000 | Where-Object { $_.AccessControlType -ne 'Deny' } | Select-Object @{n = 'Identity'; e = { [string]$_.Identity } }, @{n = 'AccessRights'; e = { & $str $_.AccessRights } } }),
            (Invoke-Read 'grantedSendOnBehalf' {
                if (-not $script:box) { throw 'The mailbox was not read, so Send on Behalf for other mailboxes could not be checked.' }
                $dn = ([string]$script:box.DistinguishedName).Replace("'", "''")
                Get-Mailbox -ResultSize 1000 -Filter "GrantSendOnBehalfTo -eq '$dn'" | Select-Object DisplayName, @{n = 'PrimarySmtpAddress'; e = { [string]$_.PrimarySmtpAddress } }
            }),
            (Invoke-Read 'grantedFull' {
                # Exchange has no reverse lookup for Full Access, so every mailbox is checked (first 500).
                $all = @(Get-Mailbox -ResultSize 500 | Select-Object DisplayName, @{n = 'PrimarySmtpAddress'; e = { [string]$_.PrimarySmtpAddress } })
                foreach ($m in $all) {
                    if ($m.PrimarySmtpAddress -eq [string]$script:box.PrimarySmtpAddress) { continue }
                    $hit = @(Get-MailboxPermission -Identity $m.PrimarySmtpAddress -User $id -ErrorAction SilentlyContinue | Where-Object { -not $_.IsInherited -and -not $_.Deny })
                    if ($hit.Count) { [pscustomobject]@{ DisplayName = $m.DisplayName; PrimarySmtpAddress = $m.PrimarySmtpAddress; AccessRights = @(& $str $hit[0].AccessRights) } }
                }
            })
        )
        }
    } elseif ($Mode -eq 'report') {
        # Everything for one user: the mailbox itself plus every organization setting that can act on its mail.
        # One connection, reads only. Properties are picked so the JSON stays small and predictable.
        $id = [string]$request.identity
        if (-not $id) { throw 'A mailbox identity is required.' }
        $start = (Get-Date).AddDays(-10)
        $end = Get-Date
        $loc = { param($v) @($v | ForEach-Object { if ($_ -is [string]) { $_ } else { $_.Name; $_.DisplayName; $_.PrimarySmtpAddress; "$_" } } | Where-Object { $_ } | ForEach-Object { [string]$_ } | Select-Object -Unique) }
        $recipientScope = 'Name', 'Identity', 'Priority', 'State', 'Comments', 'SentTo', 'SentToMemberOf', 'RecipientDomainIs', 'ExceptIfSentTo', 'ExceptIfSentToMemberOf', 'ExceptIfRecipientDomainIs'
        $senderScope = 'Name', 'Identity', 'Priority', 'State', 'From', 'FromMemberOf', 'SenderDomainIs', 'ExceptIfFrom', 'ExceptIfFromMemberOf', 'ExceptIfSenderDomainIs'
        $out.commands = @(
            (Invoke-Read 'mailbox' { Get-Mailbox -Identity $id | Select-Object Name, Alias, DisplayName, PrimarySmtpAddress, UserPrincipalName, ExternalDirectoryObjectId, Guid, RecipientTypeDetails, EmailAddresses, HiddenFromAddressListsEnabled, ForwardingAddress, ForwardingSmtpAddress, DeliverToMailboxAndForward, GrantSendOnBehalfTo, LitigationHoldEnabled, LitigationHoldDate, LitigationHoldDuration, LitigationHoldOwner, InPlaceHolds, ComplianceTagHoldApplied, DelayHoldApplied, RetentionHoldEnabled, RetentionPolicy, SingleItemRecoveryEnabled, RetainDeletedItemsFor, ArchiveStatus, ArchiveName, AutoExpandingArchiveEnabled, ProhibitSendQuota, ProhibitSendReceiveQuota, IssueWarningQuota, MaxSendSize, MaxReceiveSize, RecipientLimits, AuditEnabled, MessageCopyForSentAsEnabled, MessageCopyForSendOnBehalfEnabled, AcceptMessagesOnlyFrom, AcceptMessagesOnlyFromDLMembers, RejectMessagesFrom, RejectMessagesFromDLMembers, RequireSenderAuthenticationEnabled, AddressBookPolicy, RoleAssignmentPolicy, SharingPolicy, MailTip, WhenMailboxCreated, UsageLocation, IsDirSynced }),
            (Invoke-Read 'userAuth' { Get-User -Identity $id | Select-Object AuthenticationPolicy }),
            (Invoke-Read 'stats' { Get-MailboxStatistics -Identity $id | Select-Object TotalItemSize, TotalDeletedItemSize, ItemCount, LastLogonTime }),
            (Invoke-Read 'archiveStats' { Get-MailboxStatistics -Identity $id -Archive -ErrorAction Stop | Select-Object TotalItemSize, ItemCount }),
            (Invoke-Read 'cas' { Get-CASMailbox -Identity $id | Select-Object OWAEnabled, MAPIEnabled, EwsEnabled, ActiveSyncEnabled, PopEnabled, ImapEnabled, SmtpClientAuthenticationDisabled, OwaMailboxPolicy, ActiveSyncMailboxPolicy, UniversalOutlookEnabled, OutlookMobileEnabled }),
            (Invoke-Read 'inbox' { Get-InboxRule -Mailbox $id | Select-Object Name, Enabled, Priority, Description, ForwardTo, ForwardAsAttachmentTo, RedirectTo, DeleteMessage, MoveToFolder }),
            (Invoke-Read 'full' { Get-MailboxPermission -Identity $id | Where-Object { -not $_.IsInherited } | Select-Object User, AccessRights, Deny }),
            (Invoke-Read 'sendas' { Get-RecipientPermission -Identity $id | Select-Object Trustee, AccessRights }),
            (Invoke-Read 'autoReply' { Get-MailboxAutoReplyConfiguration -Identity $id | Select-Object AutoReplyState, StartTime, EndTime, ExternalAudience, InternalMessage, ExternalMessage }),
            (Invoke-Read 'junk' { Get-MailboxJunkEmailConfiguration -Identity $id | Select-Object Enabled, ContactsTrusted, TrustedListsOnly, @{n = 'TrustedCount'; e = { @($_.TrustedSendersAndDomains).Count } }, @{n = 'BlockedCount'; e = { @($_.BlockedSendersAndDomains).Count } } }),
            (Invoke-Read 'devices' { Get-MobileDevice -Mailbox $id | Select-Object FriendlyName, DeviceModel, DeviceOS, ClientType, DeviceAccessState, FirstSyncTime, WhenChanged }),
            (Invoke-Read 'org' { Get-OrganizationConfig | Select-Object Name, DisplayName, OAuth2ClientProfileEnabled, DefaultAuthenticationPolicy, AuditDisabled, InPlaceHolds }),
            (Invoke-Read 'transport' { Get-TransportConfig | Select-Object SmtpClientAuthenticationDisabled, MaxSendSize, MaxReceiveSize, MaxRecipientEnvelopeLimit }),
            (Invoke-Read 'externalTag' { Get-ExternalInOutlook | Select-Object Enabled, AllowList }),
            (Invoke-Read 'accepted' { Get-AcceptedDomain | Select-Object DomainName, DomainType, Default }),
            (Invoke-Read 'remote' { Get-RemoteDomain | Select-Object Name, DomainName, AutoForwardEnabled, AutoReplyEnabled, AllowedOOFType }),
            (Invoke-Read 'dkim' { Get-DkimSigningConfig | Select-Object Domain, Enabled, Status }),
            (Invoke-Read 'inbound' { Get-InboundConnector | Select-Object Name, Enabled, ConnectorType, SenderDomains, RequireTls, RestrictDomainsToCertificate, RestrictDomainsToIPAddresses }),
            (Invoke-Read 'outbound' { Get-OutboundConnector | Select-Object Name, Enabled, ConnectorType, RecipientDomains, SmartHosts, TlsSettings, UseMXRecord, IsTransportRuleScoped }),
            (Invoke-Read 'rules' { Get-TransportRule | Select-Object Name, Priority, State, Mode, Description, StopRuleProcessing, SentTo, SentToMemberOf, SentToScope, RecipientDomainIs, AnyOfRecipientAddressContainsWords, From, FromMemberOf, FromScope, SenderDomainIs, ExceptIfSentTo, ExceptIfSentToMemberOf, ExceptIfRecipientDomainIs, ExceptIfFrom, ExceptIfFromMemberOf, ExceptIfSenderDomainIs, ActivationDate, ExpiryDate }),
            (Invoke-Read 'presetEop' { Get-EOPProtectionPolicyRule | Select-Object ($recipientScope + 'HostedContentFilterPolicy', 'MalwareFilterPolicy', 'AntiPhishPolicy') }),
            (Invoke-Read 'presetAtp' { Get-ATPProtectionPolicyRule | Select-Object ($recipientScope + 'SafeLinksPolicy', 'SafeAttachmentPolicy', 'AntiPhishPolicy') }),
            (Invoke-Read 'builtIn' { Get-ATPBuiltInProtectionRule | Select-Object ($recipientScope + 'SafeLinksPolicy', 'SafeAttachmentPolicy') }),
            (Invoke-Read 'spamRule' { Get-HostedContentFilterRule | Select-Object ($recipientScope + 'HostedContentFilterPolicy') }),
            (Invoke-Read 'spamPolicy' { Get-HostedContentFilterPolicy | Select-Object Name, IsDefault, RecommendedPolicyType, SpamAction, HighConfidenceSpamAction, PhishSpamAction, HighConfidencePhishAction, BulkSpamAction, BulkThreshold, QuarantineRetentionPeriod, SpamQuarantineTag, HighConfidenceSpamQuarantineTag, PhishQuarantineTag, HighConfidencePhishQuarantineTag, BulkQuarantineTag, InlineSafetyTipsEnabled, SpamZapEnabled, PhishZapEnabled, @{n = 'AllowedSenderCount'; e = { @($_.AllowedSenders).Count + @($_.AllowedSenderDomains).Count } }, @{n = 'BlockedSenderCount'; e = { @($_.BlockedSenders).Count + @($_.BlockedSenderDomains).Count } } }),
            (Invoke-Read 'malwareRule' { Get-MalwareFilterRule | Select-Object ($recipientScope + 'MalwareFilterPolicy') }),
            (Invoke-Read 'malwarePolicy' { Get-MalwareFilterPolicy | Select-Object Name, IsDefault, RecommendedPolicyType, EnableFileFilter, FileTypeAction, ZapEnabled, QuarantineTag, @{n = 'FileTypeCount'; e = { @($_.FileTypes).Count } } }),
            (Invoke-Read 'phishRule' { Get-AntiPhishRule | Select-Object ($recipientScope + 'AntiPhishPolicy') }),
            (Invoke-Read 'phishPolicy' { Get-AntiPhishPolicy | Select-Object Name, IsDefault, RecommendedPolicyType, Enabled, PhishThresholdLevel, EnableSpoofIntelligence, AuthenticationFailAction, HonorDmarcPolicy, EnableFirstContactSafetyTips, EnableUnauthenticatedSender, EnableViaTag, EnableMailboxIntelligence, EnableMailboxIntelligenceProtection, EnableTargetedUserProtection, EnableOrganizationDomainsProtection, EnableTargetedDomainsProtection, TargetedUserProtectionAction }),
            (Invoke-Read 'safeLinksRule' { Get-SafeLinksRule | Select-Object ($recipientScope + 'SafeLinksPolicy') }),
            (Invoke-Read 'safeLinksPolicy' { Get-SafeLinksPolicy | Select-Object Name, IsBuiltInProtection, RecommendedPolicyType, EnableSafeLinksForEmail, EnableSafeLinksForTeams, EnableSafeLinksForOffice, ScanUrls, DeliverMessageAfterScan, EnableForInternalSenders, TrackClicks, AllowClickThrough, DisableUrlRewrite }),
            (Invoke-Read 'safeAttachRule' { Get-SafeAttachmentRule | Select-Object ($recipientScope + 'SafeAttachmentPolicy') }),
            (Invoke-Read 'safeAttachPolicy' { Get-SafeAttachmentPolicy | Select-Object Name, IsBuiltInProtection, RecommendedPolicyType, Enable, Action, Redirect, RedirectAddress, QuarantineTag }),
            (Invoke-Read 'outboundRule' { Get-HostedOutboundSpamFilterRule | Select-Object ($senderScope + 'HostedOutboundSpamFilterPolicy') }),
            (Invoke-Read 'outboundPolicy' { Get-HostedOutboundSpamFilterPolicy | Select-Object Name, IsDefault, AutoForwardingMode, RecipientLimitExternalPerHour, RecipientLimitInternalPerHour, RecipientLimitPerDay, ActionWhenThresholdReached }),
            (Invoke-Read 'retention' { Get-RetentionPolicy | Select-Object Name, IsDefault, RetentionPolicyTagLinks }),
            (Invoke-Read 'retentionTags' { Get-RetentionPolicyTag | Select-Object Name, Type, RetentionEnabled, AgeLimitForRetention, RetentionAction }),
            (Invoke-Read 'owa' { Get-OwaMailboxPolicy | Select-Object Name, IsDefault, ExternalImageProxyEnabled, DirectFileAccessOnPublicComputersEnabled, AdditionalStorageProvidersAvailable }),
            (Invoke-Read 'mobile' { Get-MobileDeviceMailboxPolicy | Select-Object Name, IsDefault, PasswordEnabled, AllowNonProvisionableDevices }),
            (Invoke-Read 'auth' { Get-AuthenticationPolicy | Select-Object Name, AllowBasicAuthSmtp, AllowBasicAuthPop, AllowBasicAuthImap, AllowBasicAuthActiveSync }),
            (Invoke-Read 'traceIn' { Get-MessageTraceV2 -RecipientAddress $request.address -StartDate $start -EndDate $end -ResultSize 25 | Select-Object Received, SenderAddress, RecipientAddress, Subject, Status }),
            (Invoke-Read 'traceOut' { Get-MessageTraceV2 -SenderAddress $request.address -StartDate $start -EndDate $end -ResultSize 25 | Select-Object Received, SenderAddress, RecipientAddress, Subject, Status })
        )
        foreach ($c in $out.commands) {
            if ($c.ok -and $c.name -in 'rules', 'presetEop', 'presetAtp', 'builtIn', 'spamRule', 'malwareRule', 'phishRule', 'safeLinksRule', 'safeAttachRule', 'outboundRule') {
                foreach ($row in $c.value) {
                    foreach ($p in @($row.PSObject.Properties | Where-Object { $_.Name -match '^(ExceptIf)?(SentTo|SentToMemberOf|From|FromMemberOf)$' })) { $p.Value = & $loc $p.Value }
                }
            }
        }
    } elseif ($Mode -eq 'govern') {
        # Purview reads for one user's governance: which DLP, retention, label and hold policies name Exchange.
        $loc = { param($v) @($v | ForEach-Object { if ($_ -is [string]) { $_ } else { $_.Name; $_.DisplayName; $_.ImmutableIdentity; "$_" } } | Where-Object { $_ } | ForEach-Object { [string]$_ } | Select-Object -Unique) }
        $out.commands = @(
            (Invoke-Read 'dlp' { Get-DlpCompliancePolicy | Select-Object Name, Mode, Enabled, Workload, @{n = 'ExchangeLocation'; e = { & $loc $_.ExchangeLocation } }, @{n = 'ExchangeLocationException'; e = { & $loc $_.ExchangeLocationException } }, @{n = 'ExchangeSenderMemberOf'; e = { & $loc $_.ExchangeSenderMemberOf } }, @{n = 'ExchangeSenderMemberOfException'; e = { & $loc $_.ExchangeSenderMemberOfException } } }),
            (Invoke-Read 'retention' { Get-RetentionCompliancePolicy | Select-Object Name, Guid, Enabled, Mode, @{n = 'ExchangeLocation'; e = { & $loc $_.ExchangeLocation } }, @{n = 'ExchangeLocationException'; e = { & $loc $_.ExchangeLocationException } } }),
            (Invoke-Read 'retentionRules' { Get-RetentionComplianceRule | Select-Object Name, Policy, RetentionDuration, RetentionDurationDisplayHint, RetentionComplianceAction, ExpirationDateOption }),
            (Invoke-Read 'labelPolicies' { Get-LabelPolicy | Select-Object Name, Enabled, Mode, Labels, @{n = 'ExchangeLocation'; e = { & $loc $_.ExchangeLocation } }, @{n = 'ExchangeLocationException'; e = { & $loc $_.ExchangeLocationException } } }),
            (Invoke-Read 'holds' { Get-CaseHoldPolicy | Select-Object Name, Guid, CaseId, Enabled, @{n = 'ExchangeLocation'; e = { & $loc $_.ExchangeLocation } } }),
            (Invoke-Read 'cases' { Get-ComplianceCase | Select-Object Name, Identity, Status, CaseType })
        )
    } elseif ($Mode -eq 'migrations') {
        $out.commands = @(
            (Invoke-Read 'endpoints' { Get-MigrationEndpoint }),
            (Invoke-Read 'batches' { Get-MigrationBatch }),
            (Invoke-Read 'moves' { Get-MoveRequest -ResultSize 50 })
        )
    } elseif ($Mode -eq 'exoroles') {
        # Admin roles, User roles, Role assignments and scopes, and App access. Every read is a Get-.
        $str = { param($v) @($v | Where-Object { $_ } | ForEach-Object { [string]$_ } | Select-Object -Unique) }
        $out.commands = @(
            (Invoke-Read 'groups' { Get-RoleGroup -ResultSize Unlimited | Select-Object Name, DisplayName, Description, @{n = 'Roles'; e = { & $str $_.Roles } }, @{n = 'Members'; e = { & $str $_.Members } }, @{n = 'ManagedBy'; e = { & $str $_.ManagedBy } }, WhenChanged }),
            (Invoke-Read 'userRoles' { Get-RoleAssignmentPolicy | Select-Object Name, Description, IsDefault, @{n = 'AssignedRoles'; e = { & $str $_.AssignedRoles } }, WhenChanged }),
            (Invoke-Read 'assignments' { Get-ManagementRoleAssignment -ResultSize 2000 | Select-Object Name, @{n = 'Role'; e = { [string]$_.Role } }, @{n = 'RoleAssignee'; e = { [string]$_.RoleAssigneeName } }, @{n = 'RoleAssigneeType'; e = { [string]$_.RoleAssigneeType } }, @{n = 'AssignmentMethod'; e = { [string]$_.AssignmentMethod } }, @{n = 'RecipientWriteScope'; e = { [string]$_.RecipientWriteScope } }, @{n = 'CustomRecipientWriteScope'; e = { [string]$_.CustomRecipientWriteScope } }, @{n = 'CustomResourceScope'; e = { [string]$_.CustomResourceScope } }, Enabled }),
            (Invoke-Read 'scopes' { Get-ManagementScope | Select-Object Name, @{n = 'ScopeRestrictionType'; e = { [string]$_.ScopeRestrictionType } }, RecipientFilter, @{n = 'RecipientRoot'; e = { [string]$_.RecipientRoot } }, Exclusive }),
            (Invoke-Read 'servicePrincipals' { Get-ServicePrincipal | Select-Object DisplayName, @{n = 'AppId'; e = { [string]$_.AppId } }, @{n = 'ObjectId'; e = { [string]$_.ObjectId } } }),
            (Invoke-Read 'appAccessPolicies' { Get-Ex360AppAccessPolicies | Select-Object @{n = 'AppId'; e = { [string]$_.AppId } }, @{n = 'ScopeName'; e = { [string]$_.ScopeName } }, @{n = 'AccessRight'; e = { [string]$_.AccessRight } }, Description })
        )
    } elseif ($Mode -eq 'adminaudit') {
        $start = (Get-Date).AddDays(-7)
        $end = Get-Date
        $out.commands = @(
            (Invoke-Read 'config' { Get-AdminAuditLogConfig }),
            (Invoke-Read 'changes' { Search-AdminAuditLog -StartDate $start -EndDate $end -ResultSize 50 })
        )
    } elseif ($Mode -eq 'ipps') {
        $start = if ($request.start) { Get-Date $request.start } else { (Get-Date).AddDays(-2) }
        $end = if ($request.end) { Get-Date $request.end } else { Get-Date }
        $userIds = [string]$request.user
        $operations = [string]$request.operation
        $loc = { param($v) @($v | ForEach-Object { if ($_ -is [string]) { $_ } else { $_.Name; $_.DisplayName; $_.ImmutableIdentity; "$_" } } | Where-Object { $_ } | ForEach-Object { [string]$_ } | Select-Object -Unique) }
        $out.commands = @(
            (Invoke-Read 'dlpPolicies' { Get-DlpCompliancePolicy | Select-Object Name, Mode, Enabled, Workload, Priority, DistributionStatus, WhenChanged, @{n = 'ExchangeLocation'; e = { & $loc $_.ExchangeLocation } }, @{n = 'ExchangeLocationException'; e = { & $loc $_.ExchangeLocationException } }, @{n = 'ExchangeSenderMemberOf'; e = { & $loc $_.ExchangeSenderMemberOf } }, @{n = 'ExchangeSenderMemberOfException'; e = { & $loc $_.ExchangeSenderMemberOfException } } }),
            (Invoke-Read 'dlpRules' { Get-DlpComplianceRule | Select-Object Name, ParentPolicyName, Mode, Disabled, Priority, BlockAccess, BlockAccessScope, @{n = 'NotifyUser'; e = { & $loc $_.NotifyUser } }, GenerateIncidentReport, GenerateAlert, ReportSeverityLevel, AccessScope, @{n = 'SensitiveTypes'; e = { @($_.ContentContainsSensitiveInformation | ForEach-Object { if ($_ -is [System.Collections.IDictionary]) { $_['name'] } else { "$_" } }) } }, @{n = 'AdvancedRule'; e = { $t = [string]$_.AdvancedRule; if ($t.Length -gt 4000) { $t.Substring(0, 4000) } else { $t } } } }),
            (Invoke-Read 'retentionPolicies' { Get-RetentionCompliancePolicy | Select-Object Name, Guid, Enabled, Mode, Workload, DistributionStatus, CreatedBy, WhenChanged, @{n = 'ExchangeLocation'; e = { & $loc $_.ExchangeLocation } }, @{n = 'ExchangeLocationException'; e = { & $loc $_.ExchangeLocationException } } }),
            (Invoke-Read 'retentionRules' { Get-RetentionComplianceRule | Select-Object Name, Policy, RetentionDuration, RetentionDurationDisplayHint, RetentionComplianceAction }),
            (Invoke-Read 'labels' { Get-Label | Select-Object Name, DisplayName, Priority, @{n = 'ContentType'; e = { [string]$_.ContentType } }, Disabled, ParentId, CreatedBy, WhenChanged }),
            (Invoke-Read 'labelPolicies' { Get-LabelPolicy | Select-Object Name, Enabled, Mode, DistributionStatus, Priority, CreatedBy, WhenChanged, @{n = 'Labels'; e = { & $loc $_.Labels } }, @{n = 'ExchangeLocation'; e = { & $loc $_.ExchangeLocation } } }),
            (Invoke-Read 'cases' { Get-ComplianceCase | Select-Object Name, Identity, Status, CaseType, CreatedDateTime }),
            (Invoke-Read 'holds' { Get-CaseHoldPolicy | Select-Object Name, CaseId, Enabled, DistributionStatus, @{n = 'ExchangeLocation'; e = { & $loc $_.ExchangeLocation } } }),
            (Invoke-Read 'purviewRoles' { Get-RoleGroup | Select-Object Name, DisplayName, Description, @{n = 'Roles'; e = { & $loc $_.Roles } }, @{n = 'Members'; e = { & $loc $_.Members } } }),
            (Invoke-Read 'audit' {
                $p = @{ StartDate = $start; EndDate = $end; ResultSize = 50 }
                if ($userIds) { $p.UserIds = $userIds }
                if ($operations) { $p.Operations = $operations }
                Search-UnifiedAuditLog @p | Select-Object CreationDate, UserIds, Operations, RecordType, @{n = 'AuditData'; e = { $t = [string]$_.AuditData; if ($t.Length -gt 1500) { $t.Substring(0, 1500) } else { $t } } }
            })
        )
    } elseif ($Mode -eq 'trace') {
        # Same call as the working command: Get-MessageTraceV2 -SenderAddress x -StartDate (Get-Date).AddDays(-2) -EndDate (Get-Date).
        # Dates are sent as UTC so the window does not depend on the container's time zone, and every
        # time stamp comes back as UTC with a Z so the page can show the time between events.
        $days = [int]$request.days
        if ($days -lt 1 -or $days -gt 10) { $days = 2 }
        $end = [DateTime]::UtcNow
        $start = $end.AddDays(-$days)
        $out.window = [ordered]@{ start = $start.ToString('yyyy-MM-ddTHH:mm:ssZ'); end = $end.ToString('yyyy-MM-ddTHH:mm:ssZ'); days = $days }
        $utc = { param($d) if ($null -eq $d) { '' } else { $t = [datetime]$d; if ($t.Kind -eq [DateTimeKind]::Local) { $t = $t.ToUniversalTime() }; $t.ToString('yyyy-MM-ddTHH:mm:ssZ') } }
        $sender = ([string]$request.sender).Trim()
        $recipient = ([string]$request.recipient).Trim()
        $messageId = ([string]$request.messageId).Trim()
        $subject = ([string]$request.subject).Trim()
        $subjectFilter = [string]$request.subjectFilter
        if ($subjectFilter -notin 'StartsWith', 'Contains', 'EndsWith') { $subjectFilter = 'StartsWith' }
        $related = [bool]$request.related -and $messageId
        $out.commands = @(
            (Invoke-Read 'trace' {
                $p = @{ StartDate = $start; EndDate = $end; ResultSize = 200 }
                if ($related) {
                    # Find related: every record that shares the Message ID (all recipients, expansions, redirects).
                    $p.MessageId = $messageId
                } else {
                    if ($sender) { $p.SenderAddress = $sender }
                    if ($recipient) { $p.RecipientAddress = $recipient }
                    if ($messageId) { $p.MessageId = $messageId }
                    if ($subject) { $p.Subject = $subject; $p.SubjectFilterType = $subjectFilter }
                    if ($request.status) { $p.Status = [string]$request.status }
                }
                Get-MessageTraceV2 @p | Select-Object @{n = 'Received'; e = { & $utc $_.Received } }, SenderAddress, RecipientAddress, Subject, @{n = 'Status'; e = { [string]$_.Status } }, MessageId, @{n = 'MessageTraceId'; e = { [string]$_.MessageTraceId } }, FromIP, ToIP, Size
            })
        )
        if ($request.messageTraceId -and $recipient) {
            $traceId = [string]$request.messageTraceId
            $out.commands += (Invoke-Read 'detail' { Get-MessageTraceDetailV2 -MessageTraceId $traceId -RecipientAddress $recipient | Select-Object @{n = 'Date'; e = { & $utc $_.Date } }, @{n = 'Event'; e = { [string]$_.Event } }, @{n = 'Action'; e = { [string]$_.Action } }, @{n = 'Detail'; e = { [string]$_.Detail } }, @{n = 'Data'; e = { $t = [string]$_.Data; if ($t.Length -gt 2000) { $t.Substring(0, 2000) } else { $t } } } })
        }
    }
    Write-Result $out
} catch {
    $msg = @($_.Exception.Message, $_.Exception.InnerException.Message, $_.FullyQualifiedErrorId) -join ' '
    if ($token) { $msg = $msg.Replace($token, '[redacted]') }
    $msg = [regex]::Replace($msg, 'eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+', '[redacted]')
    $msg = ($msg -replace '\s+', ' ').Trim()
    if ($msg.Length -gt 300) { $msg = $msg.Substring(0, 300) }
    Write-Result @{ ok = $false; message = $msg; detail = $msg; authorized = ($msg -notmatch 'not authorized|Access Denied|Forbidden|UnAuthorized') }
    exit 1
} finally {
    Disconnect-ExchangeOnline -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
}
