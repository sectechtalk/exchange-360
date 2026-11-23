// Worked examples for the Learn page. Every name here is fictional: contoso.com is a
// Microsoft documentation name, *.example domains are reserved (RFC 2606), and
// 203.0.113.0/24 and 198.51.100.0/24 are documentation address ranges (RFC 5737).
// No value comes from a real tenant. tests/learn-examples.test.mjs runs each header
// through the analyzer and checks that the explanation matches what the analyzer reads.

const EXO_HOPS = (day, time) => `Received: from MN2PR05MB6001.namprd05.prod.outlook.com (2603:10b6:8:2::11)
 by DM6PR05MB6000.namprd05.prod.outlook.com with HTTPS; ${day} ${time}`;

export const HEADER_EXAMPLES = [
  {
    id: 'clean',
    title: '1. A clean message from a partner',
    shows: 'Everything passed. SPF passed for fabrikam.example, the DKIM signature is from fabrikam.example, and DMARC passed because both line up with the From address. compauth=pass reason=100 is Microsoft agreeing. SFV:NSPM and CAT:NONE mean spam filtering found nothing.',
    lookFor: ['Authentication-Results: spf=pass, dkim=pass, dmarc=pass, compauth=pass reason=100', 'X-Forefront-Antispam-Report: SFV:NSPM, CAT:NONE, SCL:1'],
    expect: { spf: 'pass', dmarc: 'pass', compauth: 'pass', sfv: 'NSPM', cat: 'NONE' },
    headers: `${EXO_HOPS('Mon, 16 Nov 2026', '09:15:04 +0000')}
Received: from contoso-com.mail.protection.outlook.com (2a01:111:f400:7e::2)
 by MN2PR05MB6001.namprd05.prod.outlook.com with Microsoft SMTP Server (version=TLS1_3, cipher=TLS_AES_256_GCM_SHA384) via Frontend Transport; Mon, 16 Nov 2026 09:15:03 +0000
Received: from mail.fabrikam.example (mail.fabrikam.example [203.0.113.20])
 by contoso-com.mail.protection.outlook.com with Microsoft SMTP Server (version=TLS1_2, cipher=TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384) via Frontend Transport; Mon, 16 Nov 2026 09:15:02 +0000
Authentication-Results: spf=pass (sender IP is 203.0.113.20) smtp.mailfrom=fabrikam.example; dkim=pass (signature was verified) header.d=fabrikam.example; dmarc=pass action=none header.from=fabrikam.example; compauth=pass reason=100
From: Alex Wilber <alex@fabrikam.example>
To: Megan Bowen <megan.bowen@contoso.com>
Subject: Signed statement of work
Date: Mon, 16 Nov 2026 09:15:00 +0000
Message-ID: <sow-1001@fabrikam.example>
X-Forefront-Antispam-Report: CIP:203.0.113.20;CTRY:US;LANG:en;SCL:1;SRV:;IPV:NLI;SFV:NSPM;H:mail.fabrikam.example;PTR:mail.fabrikam.example;CAT:NONE;SFS:;DIR:INB
X-Microsoft-Antispam: BCL:0
X-MS-Exchange-Organization-AuthAs: Anonymous
X-MS-Exchange-Organization-AuthSource: contoso-com.mail.protection.outlook.com
`,
  },
  {
    id: 'spf-fail-dkim-saves',
    title: '2. SPF failed, but the message is fine',
    shows: 'Fabrikam started sending from a new server (203.0.113.77) and forgot to add it to their SPF record, so SPF failed. DMARC still passed because the DKIM signature is from fabrikam.example and lines up with the From address. DMARC needs only one of SPF or DKIM to pass and align. Tell the sender to fix SPF before their DKIM key ever breaks.',
    lookFor: ['spf=fail (sender IP is 203.0.113.77)', 'dkim=pass header.d=fabrikam.example', 'dmarc=pass, compauth=pass reason=100'],
    expect: { spf: 'fail', dmarc: 'pass', compauth: 'pass', sfv: 'NSPM' },
    headers: `${EXO_HOPS('Mon, 16 Nov 2026', '10:02:06 +0000')}
Received: from contoso-com.mail.protection.outlook.com (2a01:111:f400:7e::2)
 by MN2PR05MB6001.namprd05.prod.outlook.com with Microsoft SMTP Server (version=TLS1_3, cipher=TLS_AES_256_GCM_SHA384) via Frontend Transport; Mon, 16 Nov 2026 10:02:05 +0000
Received: from relay2.fabrikam.example (relay2.fabrikam.example [203.0.113.77])
 by contoso-com.mail.protection.outlook.com with Microsoft SMTP Server (version=TLS1_2, cipher=TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384) via Frontend Transport; Mon, 16 Nov 2026 10:02:04 +0000
Authentication-Results: spf=fail (sender IP is 203.0.113.77) smtp.mailfrom=fabrikam.example; dkim=pass (signature was verified) header.d=fabrikam.example; dmarc=pass action=none header.from=fabrikam.example; compauth=pass reason=100
From: Alex Wilber <alex@fabrikam.example>
To: Megan Bowen <megan.bowen@contoso.com>
Subject: Updated invoice
Date: Mon, 16 Nov 2026 10:02:01 +0000
Message-ID: <inv-2002@fabrikam.example>
X-Forefront-Antispam-Report: CIP:203.0.113.77;CTRY:US;LANG:en;SCL:1;SRV:;IPV:NLI;SFV:NSPM;H:relay2.fabrikam.example;PTR:relay2.fabrikam.example;CAT:NONE;SFS:;DIR:INB
X-Microsoft-Antispam: BCL:0
X-MS-Exchange-Organization-AuthAs: Anonymous
`,
  },
  {
    id: 'dkim-fail-pnone',
    title: '3. DKIM failed and DMARC is only p=none',
    shows: 'A newsletter sent through a bulk mail service. SPF passed, but for the service\'s own bounce domain, so it does not line up with tailspin.example in the From address. The DKIM signature broke ("body hash did not verify") because something changed the body after signing. DMARC failed, but tailspin.example publishes p=none, so action=none and nothing was blocked. Microsoft fell back to its own checks and gave a soft pass (compauth=softpass reason=202).',
    lookFor: ['smtp.mailfrom=bounce.mailer.example (not the From domain)', 'dkim=fail (body hash did not verify)', 'dmarc=fail action=none'],
    expect: { spf: 'pass', dmarc: 'fail', compauth: 'softpass', sfv: 'NSPM' },
    headers: `${EXO_HOPS('Tue, 17 Nov 2026', '07:30:12 +0000')}
Received: from contoso-com.mail.protection.outlook.com (2a01:111:f400:7e::2)
 by MN2PR05MB6001.namprd05.prod.outlook.com with Microsoft SMTP Server (version=TLS1_3, cipher=TLS_AES_256_GCM_SHA384) via Frontend Transport; Tue, 17 Nov 2026 07:30:11 +0000
Received: from out12.mailer.example (out12.mailer.example [198.51.100.12])
 by contoso-com.mail.protection.outlook.com with Microsoft SMTP Server (version=TLS1_2, cipher=TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384) via Frontend Transport; Tue, 17 Nov 2026 07:30:10 +0000
Authentication-Results: spf=pass (sender IP is 198.51.100.12) smtp.mailfrom=bounce.mailer.example; dkim=fail (body hash did not verify) header.d=tailspin.example; dmarc=fail action=none header.from=tailspin.example; compauth=softpass reason=202
From: Tailspin Toys News <news@tailspin.example>
To: Megan Bowen <megan.bowen@contoso.com>
Subject: November product news
Date: Tue, 17 Nov 2026 07:30:00 +0000
Message-ID: <nl-3003@mailer.example>
X-Forefront-Antispam-Report: CIP:198.51.100.12;CTRY:US;LANG:en;SCL:1;SRV:;IPV:NLI;SFV:NSPM;H:out12.mailer.example;PTR:out12.mailer.example;CAT:NONE;SFS:;DIR:INB
X-Microsoft-Antispam: BCL:3
X-MS-Exchange-Organization-AuthAs: Anonymous
`,
  },
  {
    id: 'dmarc-reject-spoof',
    title: '4. A spoof of a bank that publishes p=reject',
    shows: 'Someone on 198.51.100.66 put woodgrovebank.example in the From address. SPF passed only for the attacker\'s own domain, there is no DKIM signature, so DMARC failed. The bank publishes p=reject, and Microsoft stamps that as action=oreject (it honours reject by treating the message as spam, not by refusing it). compauth=fail reason=000 is the explicit DMARC failure. CAT:SPOOF and SFV:SPM sent it to Junk or quarantine.',
    lookFor: ['smtp.mailfrom=cheap-hosting.example vs header.from=woodgrovebank.example', 'dkim=none, dmarc=fail action=oreject', 'compauth=fail reason=000, CAT:SPOOF'],
    expect: { spf: 'pass', dmarc: 'fail', compauth: 'fail', sfv: 'SPM', cat: 'SPOOF' },
    headers: `${EXO_HOPS('Tue, 17 Nov 2026', '13:44:09 +0000')}
Received: from contoso-com.mail.protection.outlook.com (2a01:111:f400:7e::2)
 by MN2PR05MB6001.namprd05.prod.outlook.com with Microsoft SMTP Server (version=TLS1_3, cipher=TLS_AES_256_GCM_SHA384) via Frontend Transport; Tue, 17 Nov 2026 13:44:08 +0000
Received: from vps66.cheap-hosting.example (vps66.cheap-hosting.example [198.51.100.66])
 by contoso-com.mail.protection.outlook.com with Microsoft SMTP Server (version=TLS1_2, cipher=TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384) via Frontend Transport; Tue, 17 Nov 2026 13:44:07 +0000
Authentication-Results: spf=pass (sender IP is 198.51.100.66) smtp.mailfrom=cheap-hosting.example; dkim=none (message not signed) header.d=none; dmarc=fail action=oreject header.from=woodgrovebank.example; compauth=fail reason=000
From: "Woodgrove Bank Security" <security@woodgrovebank.example>
To: Megan Bowen <megan.bowen@contoso.com>
Subject: Your account is locked
Date: Tue, 17 Nov 2026 13:44:05 +0000
Message-ID: <lock-4004@cheap-hosting.example>
X-Forefront-Antispam-Report: CIP:198.51.100.66;CTRY:NL;LANG:en;SCL:5;SRV:;IPV:NLI;SFV:SPM;H:vps66.cheap-hosting.example;PTR:vps66.cheap-hosting.example;CAT:SPOOF;SFS:;DIR:INB
X-Microsoft-Antispam: BCL:0;PCL:5
X-MS-Exchange-Organization-AuthAs: Anonymous
`,
  },
  {
    id: 'forwarded-arc',
    title: '5. Forwarded through a mailing list, saved by ARC',
    shows: 'Alex at northwind.example posted to a mailing list at lists.fabrikam.example, which added a footer and resent it. The footer broke Northwind\'s DKIM signature and SPF now checks the list server, so DMARC failed even though the mail is genuine. The list sealed its own ARC result (dkim=pass before it changed anything). Microsoft trusts that sealer, the ARC chain validated (cv=pass), and compauth=pass reason=130 says ARC overrode the DMARC failure.',
    lookFor: ['dkim=fail header.d=northwind.example, dmarc=fail', 'ARC-Seal cv=pass, ARC-Authentication-Results with dkim=pass', 'compauth=pass reason=130'],
    expect: { spf: 'pass', dmarc: 'fail', compauth: 'pass', sfv: 'NSPM', arc: 'pass' },
    headers: `${EXO_HOPS('Wed, 18 Nov 2026', '08:20:33 +0000')}
Received: from contoso-com.mail.protection.outlook.com (2a01:111:f400:7e::2)
 by MN2PR05MB6001.namprd05.prod.outlook.com with Microsoft SMTP Server (version=TLS1_3, cipher=TLS_AES_256_GCM_SHA384) via Frontend Transport; Wed, 18 Nov 2026 08:20:32 +0000
Received: from lists.fabrikam.example (lists.fabrikam.example [203.0.113.90])
 by contoso-com.mail.protection.outlook.com with Microsoft SMTP Server (version=TLS1_2, cipher=TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384) via Frontend Transport; Wed, 18 Nov 2026 08:20:31 +0000
Received: from mail.northwind.example (mail.northwind.example [203.0.113.45])
 by lists.fabrikam.example with ESMTPS (version=TLS1_3, cipher=TLS_AES_256_GCM_SHA384); Wed, 18 Nov 2026 08:20:20 +0000
ARC-Seal: i=2; a=rsa-sha256; s=arcselector10001; d=microsoft.com; cv=pass
ARC-Seal: i=1; a=rsa-sha256; s=arc1; d=lists.fabrikam.example; cv=none
ARC-Authentication-Results: i=1; lists.fabrikam.example; spf=pass smtp.mailfrom=northwind.example; dkim=pass header.d=northwind.example; dmarc=pass header.from=northwind.example
Authentication-Results: spf=pass (sender IP is 203.0.113.90) smtp.mailfrom=lists.fabrikam.example; dkim=fail (body hash did not verify) header.d=northwind.example; dmarc=fail action=oreject header.from=northwind.example; compauth=pass reason=130
From: Alex Johnson <alex@northwind.example>
To: Exchange admins list <admins@lists.fabrikam.example>
Subject: [admins] Connector validation tips
Date: Wed, 18 Nov 2026 08:20:15 +0000
Message-ID: <post-5005@northwind.example>
X-Forefront-Antispam-Report: CIP:203.0.113.90;CTRY:US;LANG:en;SCL:1;SRV:;IPV:NLI;SFV:NSPM;H:lists.fabrikam.example;PTR:lists.fabrikam.example;CAT:NONE;SFS:;DIR:INB
X-Microsoft-Antispam: BCL:0
X-MS-Exchange-Organization-AuthAs: Anonymous
`,
  },
  {
    id: 'phish-passes-auth',
    title: '6. A phish that passed every authentication check',
    shows: 'The attacker registered contoso-payroll.example, a look-alike domain, and set up SPF, DKIM and DMARC for it properly. Everything passes because the mail really did come from contoso-payroll.example. Authentication proves who sent a message, not that it is safe. Content filtering still caught it: CAT:HPHSH is high confidence phishing, PCL:8 is high phish confidence, and the default action for that verdict is quarantine.',
    lookFor: ['spf=pass, dkim=pass, dmarc=pass for contoso-payroll.example', 'CAT:HPHSH, SFV:SPM, SCL:9', 'X-Microsoft-Antispam PCL:8'],
    expect: { spf: 'pass', dmarc: 'pass', compauth: 'pass', sfv: 'SPM', cat: 'HPHSH' },
    headers: `${EXO_HOPS('Wed, 18 Nov 2026', '15:05:41 +0000')}
Received: from contoso-com.mail.protection.outlook.com (2a01:111:f400:7e::2)
 by MN2PR05MB6001.namprd05.prod.outlook.com with Microsoft SMTP Server (version=TLS1_3, cipher=TLS_AES_256_GCM_SHA384) via Frontend Transport; Wed, 18 Nov 2026 15:05:40 +0000
Received: from mx.contoso-payroll.example (mx.contoso-payroll.example [198.51.100.140])
 by contoso-com.mail.protection.outlook.com with Microsoft SMTP Server (version=TLS1_2, cipher=TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384) via Frontend Transport; Wed, 18 Nov 2026 15:05:39 +0000
Authentication-Results: spf=pass (sender IP is 198.51.100.140) smtp.mailfrom=contoso-payroll.example; dkim=pass (signature was verified) header.d=contoso-payroll.example; dmarc=pass action=none header.from=contoso-payroll.example; compauth=pass reason=100
From: "Contoso Payroll" <payroll@contoso-payroll.example>
To: Megan Bowen <megan.bowen@contoso.com>
Subject: Confirm your direct deposit by 5 PM
Date: Wed, 18 Nov 2026 15:05:37 +0000
Message-ID: <pay-6006@contoso-payroll.example>
X-Forefront-Antispam-Report: CIP:198.51.100.140;CTRY:RU;LANG:en;SCL:9;SRV:;IPV:NLI;SFV:SPM;H:mx.contoso-payroll.example;PTR:mx.contoso-payroll.example;CAT:HPHSH;SFS:;DIR:INB
X-Microsoft-Antispam: BCL:0;PCL:8
X-MS-Exchange-Organization-AuthAs: Anonymous
`,
  },
  {
    id: 'bulk',
    title: '7. A marketing email sent to Junk as bulk',
    shows: 'Authentication passed and it is not phishing. It went to Junk because of how many people complain about this sender. BCL:8 is at or above the default bulk threshold of 7, SRV:BULK says spam filtering marked it as bulk, and CAT:BULK names the reason. If the user wants these, they add the sender to Safe Senders or an admin raises the bulk threshold. Do not create an allow rule for every newsletter.',
    lookFor: ['X-Microsoft-Antispam: BCL:8', 'SRV:BULK, CAT:BULK, SFV:SPM'],
    expect: { spf: 'pass', dmarc: 'pass', compauth: 'pass', sfv: 'SPM', cat: 'BULK', bcl: 8 },
    headers: `${EXO_HOPS('Thu, 19 Nov 2026', '06:00:22 +0000')}
Received: from contoso-com.mail.protection.outlook.com (2a01:111:f400:7e::2)
 by MN2PR05MB6001.namprd05.prod.outlook.com with Microsoft SMTP Server (version=TLS1_3, cipher=TLS_AES_256_GCM_SHA384) via Frontend Transport; Thu, 19 Nov 2026 06:00:21 +0000
Received: from send5.wingtiptoys.example (send5.wingtiptoys.example [198.51.100.55])
 by contoso-com.mail.protection.outlook.com with Microsoft SMTP Server (version=TLS1_2, cipher=TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384) via Frontend Transport; Thu, 19 Nov 2026 06:00:20 +0000
Authentication-Results: spf=pass (sender IP is 198.51.100.55) smtp.mailfrom=wingtiptoys.example; dkim=pass (signature was verified) header.d=wingtiptoys.example; dmarc=pass action=none header.from=wingtiptoys.example; compauth=pass reason=100
From: Wingtip Toys Deals <deals@wingtiptoys.example>
To: Megan Bowen <megan.bowen@contoso.com>
Subject: 48 hours only: 60% off
Date: Thu, 19 Nov 2026 06:00:00 +0000
Message-ID: <deal-7007@wingtiptoys.example>
X-Forefront-Antispam-Report: CIP:198.51.100.55;CTRY:US;LANG:en;SCL:6;SRV:BULK;IPV:NLI;SFV:SPM;H:send5.wingtiptoys.example;PTR:send5.wingtiptoys.example;CAT:BULK;SFS:;DIR:INB
X-Microsoft-Antispam: BCL:8
X-MS-Exchange-Organization-AuthAs: Anonymous
`,
  },
  {
    id: 'internal',
    title: '8. Internal mail between two people in the tenant',
    shows: 'Both people have mailboxes in contoso.com. Every Received line is an Exchange Online server, there is no internet hop, and AuthAs is Internal because the sender signed in. There is no SPF or DKIM result because the message never arrived from the internet, and that is normal. DIR:INT says Microsoft treated it as internal. Missing SPF on internal mail is not a problem to fix.',
    lookFor: ['Only *.prod.outlook.com hops', 'X-MS-Exchange-Organization-AuthAs: Internal', 'DIR:INT, no spf= or dkim= result'],
    expect: { spf: '', dmarc: 'none', sfv: 'NSPM', authAs: 'Internal' },
    headers: `Received: from MN2PR05MB6001.namprd05.prod.outlook.com (2603:10b6:8:2::11)
 by DM6PR05MB6000.namprd05.prod.outlook.com with HTTPS; Thu, 19 Nov 2026 11:12:03 +0000
Received: from CH2PR05MB7000.namprd05.prod.outlook.com (2603:10b6:8:3::20)
 by MN2PR05MB6001.namprd05.prod.outlook.com with Microsoft SMTP Server (version=TLS1_2, cipher=TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384); Thu, 19 Nov 2026 11:12:02 +0000
Authentication-Results: dkim=none (message not signed) header.d=none; dmarc=none action=none header.from=contoso.com
From: Adele Vance <adele.vance@contoso.com>
To: Megan Bowen <megan.bowen@contoso.com>
Subject: Lunch on Friday?
Date: Thu, 19 Nov 2026 11:12:00 +0000
Message-ID: <lunch-8008@CH2PR05MB7000.namprd05.prod.outlook.com>
X-Forefront-Antispam-Report: CIP:255.255.255.255;CTRY:;LANG:en;SCL:1;SRV:;IPV:NLI;SFV:NSPM;H:CH2PR05MB7000.namprd05.prod.outlook.com;PTR:;CAT:NONE;SFS:;DIR:INT
X-MS-Exchange-Organization-AuthAs: Internal
X-MS-Exchange-Organization-AuthSource: CH2PR05MB7000.namprd05.prod.outlook.com
X-MS-Exchange-Organization-MessageDirectionality: Originating
X-MS-Exchange-Organization-SCL: 1
`,
  },
  {
    id: 'partner-connector-rule',
    title: '9. A partner connector and a rule that skipped spam filtering',
    shows: 'Fabrikam sends through a partner inbound connector that requires TLS, so AuthAs is Partner instead of Anonymous. A transport rule named "Bypass spam filter for Fabrikam" set the SCL to -1, and SFV:SKN records that a mail flow rule bypassed filtering. The rule name is in Rules-Execution-History. Bypass rules are risky: if Fabrikam is ever compromised, its mail skips spam checks. Prefer fixing authentication or the Tenant Allow/Block List.',
    lookFor: ['X-MS-Exchange-Organization-AuthAs: Partner', 'SFV:SKN, SCL:-1', 'Rules-Execution-History: Rule="Bypass spam filter for Fabrikam"'],
    expect: { spf: 'pass', dmarc: 'pass', sfv: 'SKN', scl: -1, authAs: 'Partner', rule: 'Bypass spam filter for Fabrikam' },
    headers: `${EXO_HOPS('Thu, 19 Nov 2026', '12:40:18 +0000')}
Received: from contoso-com.mail.protection.outlook.com (2a01:111:f400:7e::2)
 by MN2PR05MB6001.namprd05.prod.outlook.com with Microsoft SMTP Server (version=TLS1_3, cipher=TLS_AES_256_GCM_SHA384) via Frontend Transport; Thu, 19 Nov 2026 12:40:17 +0000
Received: from smtp.fabrikam.example (smtp.fabrikam.example [203.0.113.21])
 by contoso-com.mail.protection.outlook.com with Microsoft SMTP Server (version=TLS1_2, cipher=TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384) via Frontend Transport; Thu, 19 Nov 2026 12:40:16 +0000
Authentication-Results: spf=pass (sender IP is 203.0.113.21) smtp.mailfrom=fabrikam.example; dkim=pass (signature was verified) header.d=fabrikam.example; dmarc=pass action=none header.from=fabrikam.example; compauth=pass reason=100
From: Fabrikam Orders <orders@fabrikam.example>
To: Purchasing <purchasing@contoso.com>
Subject: Order 9009 shipped
Date: Thu, 19 Nov 2026 12:40:14 +0000
Message-ID: <order-9009@fabrikam.example>
X-Forefront-Antispam-Report: CIP:203.0.113.21;CTRY:US;LANG:en;SCL:-1;SRV:;IPV:NLI;SFV:SKN;H:smtp.fabrikam.example;PTR:smtp.fabrikam.example;CAT:NONE;SFS:;DIR:INB
X-Microsoft-Antispam: BCL:0
X-MS-Exchange-Organization-AuthAs: Partner
X-MS-Exchange-Organization-AuthSource: contoso-com.mail.protection.outlook.com
X-MS-Exchange-Organization-SCL: -1
X-MS-Exchange-Organization-Rules-Execution-History: Rule="Bypass spam filter for Fabrikam";Action="SetSCL"
`,
  },
  {
    id: 'delayed',
    title: '10. A message that arrived three hours late',
    shows: 'The user says "Microsoft delayed my email." Read the Received lines bottom to top and compare the times. The sender\'s mail server handed the message to its own outbound gateway at 08:01, and the gateway did not pass it on until 11:04. Every Microsoft hop after that took one or two seconds. The delay was on the sender\'s side. That first hop also has no version=TLS, so it travelled inside their network unencrypted.',
    lookFor: ['Bottom Received line 08:01, next one 11:04', 'Microsoft hops a second apart', 'First hop "with ESMTP" and no TLS'],
    expect: { spf: 'pass', dmarc: 'pass', compauth: 'pass', sfv: 'NSPM', slowHop: true, noTls: true },
    headers: `${EXO_HOPS('Thu, 19 Nov 2026', '11:04:09 +0000')}
Received: from contoso-com.mail.protection.outlook.com (2a01:111:f400:7e::2)
 by MN2PR05MB6001.namprd05.prod.outlook.com with Microsoft SMTP Server (version=TLS1_3, cipher=TLS_AES_256_GCM_SHA384) via Frontend Transport; Thu, 19 Nov 2026 11:04:08 +0000
Received: from gw.adatum.example (gw.adatum.example [203.0.113.60])
 by contoso-com.mail.protection.outlook.com with Microsoft SMTP Server (version=TLS1_2, cipher=TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384) via Frontend Transport; Thu, 19 Nov 2026 11:04:07 +0000
Received: from exch01.corp.adatum.example (exch01.corp.adatum.example [10.20.0.5])
 by gw.adatum.example with ESMTP; Thu, 19 Nov 2026 08:01:30 +0000
Authentication-Results: spf=pass (sender IP is 203.0.113.60) smtp.mailfrom=adatum.example; dkim=pass (signature was verified) header.d=adatum.example; dmarc=pass action=none header.from=adatum.example; compauth=pass reason=100
From: Pat Lee <pat.lee@adatum.example>
To: Megan Bowen <megan.bowen@contoso.com>
Subject: Contract for today's 10 AM meeting
Date: Thu, 19 Nov 2026 08:01:28 +0000
Message-ID: <contract-1010@adatum.example>
X-Forefront-Antispam-Report: CIP:203.0.113.60;CTRY:US;LANG:en;SCL:1;SRV:;IPV:NLI;SFV:NSPM;H:gw.adatum.example;PTR:gw.adatum.example;CAT:NONE;SFS:;DIR:INB
X-Microsoft-Antispam: BCL:0
X-MS-Exchange-Organization-AuthAs: Anonymous
`,
  },
];

export const RULE_SCENARIOS = [
  {
    id: 'external-banner',
    title: '1. Warn people when mail comes from outside',
    situation: 'Users keep replying to phishing that looks internal. Leadership wants a visible warning on every message from outside the company.',
    conditions: ['The sender is located: Outside the organization', 'The recipient is located: Inside the organization'],
    exceptions: ['The sender domain is: a short list of trusted partners, if leadership agrees'],
    actions: ['Apply a disclaimer to the message: Prepend a short HTML banner such as "This message came from outside Contoso. Check the sender before you click."', 'Fallback action if the disclaimer cannot be inserted: Wrap'],
    note: 'Outlook also has a built-in External tag (Set-ExternalInOutlook -Enabled $true). Many tenants use the tag instead of, or as well as, a banner, because a banner piles up in long reply chains.',
    powershell: 'New-TransportRule -Name "External sender banner" -FromScope NotInOrganization -SentToScope InOrganization -ApplyHtmlDisclaimerLocation Prepend -ApplyHtmlDisclaimerText "<p style=\'background:#fff4ce;padding:6px\'>This message came from outside Contoso. Check the sender before you click.</p>" -ApplyHtmlDisclaimerFallbackAction Wrap -Mode Audit',
  },
  {
    id: 'block-attachments',
    title: '2. Block dangerous attachment types',
    situation: 'Security asks you to stop script and disk image files at the door, because malware arrives as .js, .vbs and .iso files.',
    conditions: ['Any attachment\'s file extension includes these words: js, vbs, wsf, iso, img, exe'],
    exceptions: ['None, or a named service mailbox that genuinely receives these files'],
    actions: ['Reject the message and include an explanation: "Attachments of this type are blocked. Send the file through OneDrive."', 'Enhanced status code: 5.7.1'],
    note: 'Check the anti-malware policy first. Its common attachments filter already blocks a list of file types without a rule. Use a transport rule when you need a custom NDR message, an exception, or a type that list does not cover.',
    powershell: 'New-TransportRule -Name "Block risky attachment types" -AttachmentExtensionMatchesWords js,vbs,wsf,iso,img,exe -RejectMessageReasonText "Attachments of this type are blocked. Send the file through OneDrive." -RejectMessageEnhancedStatusCode "5.7.1" -Mode Audit',
  },
  {
    id: 'encrypt-keyword',
    title: '3. Encrypt mail when the sender types [secure]',
    situation: 'HR sends salary letters to people\'s personal addresses and needs them encrypted, without teaching everyone the Encrypt button.',
    conditions: ['The subject includes: [secure]', 'The recipient is located: Outside the organization'],
    exceptions: ['None'],
    actions: ['Apply Office 365 Message Encryption and rights protection: Encrypt'],
    note: 'Needs a licence that includes Microsoft Purview Message Encryption (for example Microsoft 365 E3 or E5). The recipient opens the message in a browser portal if their mail system cannot decrypt it. Sensitivity labels can do this more cleanly where the tenant uses them.',
    powershell: 'New-TransportRule -Name "Encrypt on [secure]" -SubjectContainsWords "[secure]" -SentToScope NotInOrganization -ApplyRightsProtectionTemplate "Encrypt" -Mode Audit',
  },
  {
    id: 'ethical-wall',
    title: '4. Stop two departments emailing each other',
    situation: 'Compliance requires an ethical wall: the Research group must not exchange email with the Trading group.',
    conditions: ['The sender is a member of: Research', 'The recipient is a member of: Trading'],
    exceptions: ['The sender is: the compliance officer'],
    actions: ['Reject the message and include an explanation: "Policy does not allow mail between Research and Trading."'],
    note: 'Make a second rule for the other direction (Trading to Research). For Teams and SharePoint as well as mail, the full answer is Microsoft Purview Information Barriers.',
    powershell: 'New-TransportRule -Name "Wall Research to Trading" -FromMemberOf "Research" -SentToMemberOf "Trading" -ExceptIfFrom "compliance.officer@contoso.com" -RejectMessageReasonText "Policy does not allow mail between Research and Trading." -Mode Audit',
  },
  {
    id: 'ceo-impersonation',
    title: '5. Flag outside mail that uses the CEO\'s name',
    situation: 'Finance received a fake "urgent wire transfer" from a free webmail address with the CEO\'s name as the display name. They want any outside message using that name flagged.',
    conditions: ['The sender is located: Outside the organization', 'A message header matches these text patterns: header "From", pattern "Megan Bowen"'],
    exceptions: ['The sender address is: the CEO\'s known personal address, if one is approved'],
    actions: ['Prepend the subject of the message with: "[Check sender] "', 'Optional: Generate incident report and send it to the security mailbox'],
    note: 'Defender for Office 365 user impersonation protection does this better if the tenant has it. You will see the rule fire in the message header as X-MS-Exchange-Organization-Rules-Execution-History, which is what the header analyzer reads.',
    powershell: 'New-TransportRule -Name "Flag outside mail using the CEO name" -FromScope NotInOrganization -HeaderMatchesMessageHeader "From" -HeaderMatchesPatterns "Megan Bowen" -PrependSubject "[Check sender] " -Mode Audit',
  },
];

export const RULE_HOW_TO = 'Every rule follows the same shape: conditions (when it applies), exceptions (when it does not) and actions (what it does). Create rules in the Exchange admin center under Mail flow > Rules. Start a new rule in Test mode (the -Mode Audit in the PowerShell below), send a test message, and check message trace before you set it to Enforce. Ex360 v1 is read-only and does not create rules.';

export function headerExample(id) {
  return HEADER_EXAMPLES.find(e => e.id === id) || null;
}
