// Ready-made test messages for NextHop. Each one is written for the Contoso sample topology and shows one part of
// mail flow or governance; against a real export they still run, with your own settings deciding the outcome.
// The outside addresses are made up (*.example and fabrikam.com are reserved example names) and the IPs are
// documentation ranges, so nothing here can reach a real system.
export const SCENARIOS = [
  {
    id: 'partner-invoice', title: 'Inbound: a partner sends an invoice',
    shows: 'Inbound connector, a rule that skips spam filtering, journaling, and an inbox rule that tries to forward to a personal address.',
    input: { direction: 'inbound', externalAddress: 'billing@fabrikam.com', fromName: 'Fabrikam Billing', ip: '203.0.113.10', auth: 'pass', verdict: 'clean', subject: 'Invoice 4471 for October', body: 'Hello Megan,\nInvoice 4471 is attached. Payment is due in 30 days.\nFabrikam Accounts', attachments: 'Invoice-4471.pdf (300 KB)', kind: 'normal' },
  },
  {
    id: 'partner-wrong-ip', title: 'Inbound: the partner domain from the wrong IP',
    shows: 'An inbound connector that only accepts the partner domain from its own IPs.',
    input: { direction: 'inbound', externalAddress: 'billing@fabrikam.com', fromName: 'Fabrikam Billing', ip: '198.51.100.77', auth: 'pass', verdict: 'clean', subject: 'Updated invoice', body: 'See the updated invoice.', attachments: '', kind: 'normal' },
  },
  {
    id: 'ceo-fraud', title: 'Inbound: payment fraud from a look-alike domain',
    shows: 'A mail flow rule that quarantines payment-fraud phrases before impersonation protection even runs.',
    input: { direction: 'inbound', externalAddress: 'alex.wilber@contos0.com', fromName: 'Alex Wilber', ip: '198.51.100.140', auth: 'composite-fail', verdict: 'phish', subject: 'Urgent payment needed today', body: 'Megan, I need you to send a wire transfer to our new supplier before 3 PM. I am in meetings, reply by email only.\nAlex', attachments: '', kind: 'normal' },
  },
  {
    id: 'impersonation', title: 'Inbound: someone uses Megan\'s name from a personal address',
    shows: 'User impersonation protection in an anti-phishing policy.',
    input: { direction: 'inbound', externalAddress: 'megan.bowen.contoso@personalmail.example', fromName: 'Megan Bowen', ip: '198.51.100.141', auth: 'pass', verdict: 'clean', subject: 'Can you look at this?', body: 'Quick favour, are you at your desk?', attachments: '', kind: 'normal' },
  },
  {
    id: 'exe-attachment', title: 'Inbound: an .exe attachment',
    shows: 'A mail flow rule that rejects executable attachments, ahead of the malware filter.',
    input: { direction: 'inbound', externalAddress: 'it-support@outside.example', fromName: 'IT Support', ip: '198.51.100.9', auth: 'pass', verdict: 'clean', subject: 'Your VPN update', body: 'Run the attached installer to keep your VPN working.', attachments: 'vpn-update.exe (2 MB)', kind: 'normal' },
  },
  {
    id: 'blocked-ip', title: 'Inbound: from a blocked IP range',
    shows: 'The connection filter IP Block List.',
    input: { direction: 'inbound', externalAddress: 'promo@deals.example', fromName: 'Deals', ip: '192.0.2.44', auth: 'pass', verdict: 'spam', subject: 'Limited offer', body: 'Click now.', attachments: '', kind: 'normal' },
  },
  {
    id: 'dmarc-reject', title: 'Inbound: a spoofed bank that fails DMARC p=reject',
    shows: 'Anti-phishing honoring the sender domain\'s DMARC policy.',
    input: { direction: 'inbound', externalAddress: 'security@woodgrovebank.example', fromName: 'Woodgrove Bank', ip: '198.51.100.201', auth: 'dmarc-reject', verdict: 'clean', subject: 'Verify your account', body: 'Sign in at https://login.woodgrove.malicious.example/verify to keep your account open.', attachments: '', kind: 'normal' },
  },
  {
    id: 'spam-sales', title: 'Inbound: spam to someone in Sales',
    shows: 'Which anti-spam policy wins for a group member, and the quarantine policy behind it.',
    input: { direction: 'inbound', externalAddress: 'offers@bulkmailer.example', fromName: 'Big Savings', ip: '198.51.100.88', auth: 'pass', verdict: 'spam', subject: 'Save 80% on office supplies', body: 'Our best prices ever.', attachments: '', kind: 'normal' },
  },
  {
    id: 'credit-card-out', title: 'Outbound: a credit card number to a customer',
    shows: 'DLP blocking sensitive information to outside, with an incident report.',
    input: { direction: 'outbound', externalAddress: 'orders@tailspintoys.example', subject: 'Card for the deposit', body: 'Hi, please charge the deposit to 4111 1111 1111 1111, expiry 08/28.\nThanks, Megan', attachments: '', kind: 'normal' },
  },
  {
    id: 'ssn-out', title: 'Outbound: an SSN, with override allowed',
    shows: 'A DLP rule that blocks but lets the sender override with a justification.',
    input: { direction: 'outbound', externalAddress: 'hr@benefitsprovider.example', subject: 'New hire form', body: 'Employee SSN: 123-45-6789 for the benefits enrollment.', attachments: '', kind: 'normal' },
  },
  {
    id: 'secure-to-fabrikam', title: 'Outbound: "secure" quote to Fabrikam',
    shows: 'A rule that encrypts by subject keyword, the Sales disclaimer, journaling and a forced-TLS outbound connector.',
    input: { direction: 'outbound', externalAddress: 'purchasing@fabrikam.com', subject: 'Secure: revised quote', body: 'Attached is the revised quote for the Seattle project.', attachments: 'Quote-2026-118.pdf (800 KB)', kind: 'normal' },
  },
  {
    id: 'auto-forward', title: 'Outbound: an automatic forward to a personal address',
    shows: 'The outbound spam policy blocking external automatic forwarding (550 5.7.520).',
    input: { direction: 'outbound', externalAddress: 'megan.home@personalmail.example', subject: 'FW: Invoice 4471 for October', body: 'Forwarded by an inbox rule.', attachments: 'Invoice-4471.pdf (300 KB)', kind: 'autoforward' },
  },
  {
    id: 'big-attachment', title: 'Outbound: a 12 MB design file',
    shows: 'A rule that holds large attachments for the sender\'s manager to approve.',
    input: { direction: 'outbound', externalAddress: 'studio@adatum.example', subject: 'Final artwork', body: 'Here is the print-ready file.', attachments: 'artwork-final.pdf (12 MB)', kind: 'normal' },
  },
  {
    id: 'falcon-test', title: 'Outbound: a code name in test mode',
    shows: 'A mail flow rule and a DLP policy in test mode: logged, not enforced.',
    input: { direction: 'outbound', externalAddress: 'consultant@adatum.example', subject: 'Project Falcon timeline and price list', body: 'Notes from today: Project Falcon starts in January.', attachments: '', kind: 'normal' },
  },
];
