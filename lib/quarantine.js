// Quarantined messages in plain words. Reading the list never releases, previews or deletes a message.
const TYPES = [
  { match: /highconfphish|high ?confidence ?phish/i, words: 'High confidence phishing', who: 'Only an admin can release it (AdminOnlyAccessPolicy by default). Users cannot.', tone: 'high' },
  { match: /phish/i, words: 'Phishing', who: 'Depends on the quarantine policy on the anti-spam or anti-phish policy. By default only admins release phish.', tone: 'high' },
  { match: /malware/i, words: 'Malware', who: 'Only an admin can release malware, and only after checking it.', tone: 'high' },
  { match: /spoof/i, words: 'Spoofed sender', who: 'Admins, and users if the anti-phish quarantine policy allows it.', tone: 'medium' },
  { match: /bulk/i, words: 'Bulk mail', who: 'Users can usually release bulk mail themselves (DefaultFullAccessPolicy).', tone: 'low' },
  { match: /spam/i, words: 'Spam', who: 'Users can usually release spam themselves (DefaultFullAccessPolicy).', tone: 'low' },
  { match: /transportrule|rule/i, words: 'Quarantined by a mail flow rule', who: 'Only admins release messages quarantined by a mail flow rule.', tone: 'medium' },
  { match: /filetype/i, words: 'Blocked file type', who: 'Only admins can release it.', tone: 'medium' },
  { match: /dataloss|dlp/i, words: 'Held by data loss prevention', who: 'Released by an admin after review.', tone: 'medium' },
];

export function explainQuarantine(row) {
  const type = String(row.QuarantineTypes || row.Type || '');
  const hit = TYPES.find(t => t.match.test(type)) || { words: type || 'Quarantined', who: 'Check the quarantine policy that applied.', tone: 'medium' };
  const released = /released/i.test(String(row.ReleaseStatus || ''));
  const requested = /requested/i.test(String(row.ReleaseStatus || ''));
  return {
    reason: hit.words,
    tone: hit.tone,
    policy: [row.PolicyType, row.PolicyName].filter(Boolean).join(': '),
    release: released ? 'Already released.' : requested ? 'The user asked for release. An admin needs to approve or deny it.' : hit.who,
    expires: row.Expires || '',
  };
}

export function quarantineSummary(rows) {
  const counts = {};
  for (const r of rows || []) { const k = explainQuarantine(r).reason; counts[k] = (counts[k] || 0) + 1; }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

export const DEMO_QUARANTINE = [
  { ReceivedTime: '2026-11-18T14:02:15Z', SenderAddress: 'bounce@northwind.example', RecipientAddress: ['megan.bowen@contoso.com'], Subject: 'Action required: update your deposit', Type: 'Phish', QuarantineTypes: 'Phish', PolicyType: 'AntiPhishPolicy', PolicyName: 'Office365 AntiPhish Default', ReleaseStatus: 'NotReleased', Expires: '2026-12-03T14:02:15Z', Direction: 'Inbound', MessageId: '<abc123@northwind.example>' },
  { ReceivedTime: '2026-11-17T11:20:00Z', SenderAddress: 'deals@newsletter.example', RecipientAddress: ['adele.vance@contoso.com'], Subject: 'Weekly deals', Type: 'Bulk', QuarantineTypes: 'Bulk', PolicyType: 'HostedContentFilterPolicy', PolicyName: 'Executives', ReleaseStatus: 'RequestedRelease', Expires: '2026-12-17T11:20:00Z', Direction: 'Inbound', MessageId: '<deal-9@newsletter.example>' },
  { ReceivedTime: '2026-11-16T16:45:00Z', SenderAddress: 'invoice@fabrikam.example', RecipientAddress: ['megan.bowen@contoso.com'], Subject: 'Invoice 2231', Type: 'Malware', QuarantineTypes: 'Malware', PolicyType: 'SafeAttachmentPolicy', PolicyName: 'Safe Attachments dynamic', ReleaseStatus: 'NotReleased', Expires: '2026-12-16T16:45:00Z', Direction: 'Inbound', MessageId: '<inv-2231@fabrikam.example>' },
];

export function demoQuarantine({ recipient = '', sender = '' } = {}) {
  const low = s => String(s || '').toLowerCase();
  const rows = DEMO_QUARANTINE.filter(r => (!recipient || r.RecipientAddress.some(a => low(a).includes(low(recipient)))) && (!sender || low(r.SenderAddress).includes(low(sender))));
  return { ok: true, source: 'demo', mode: 'quarantine', commands: [{ ok: true, name: 'messages', value: rows }] };
}
