// Fictional messages. northwind.example and contoso.com are documentation names.
// 203.0.113.0/24 is the documentation range from RFC 5737.
export const SAMPLE_SPOOF = `Received: from DM6PR05MB6000.namprd05.prod.outlook.com (2603:10b6:8:1::10)
 by MN2PR05MB6001.namprd05.prod.outlook.com with HTTPS; Mon, 16 Nov 2026 14:02:14 +0000
Received: from CY4PR05CA0010.outlook.office365.com (2603:10b6:930:1::10)
 by DM6PR05MB6000.namprd05.prod.outlook.com with Microsoft SMTP Server (version=TLS1_2, cipher=TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384) id 15.20.9215.15; Mon, 16 Nov 2026 14:02:13 +0000
Received: from contoso-com.mail.protection.outlook.com (2a01:111:f400:7e::1)
 by CY4PR05CA0010.outlook.office365.com with Microsoft SMTP Server (version=TLS1_3, cipher=TLS_AES_256_GCM_SHA384) id 15.20.9215.10 via Frontend Transport; Mon, 16 Nov 2026 14:02:12 +0000
Received: from mail.northwind.example (mail.northwind.example [203.0.113.45])
 by contoso-com.mail.protection.outlook.com (10.0.0.1) with Microsoft SMTP Server (version=TLS1_2, cipher=TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384) id 15.20.9215.8 via Frontend Transport; Mon, 16 Nov 2026 14:02:11 +0000
Authentication-Results: spf=pass (sender IP is 203.0.113.45) smtp.mailfrom=northwind.example; dkim=pass (signature was verified) header.d=marketing.example; dmarc=fail action=none header.from=contoso.com; compauth=fail reason=000
From: "Contoso Payroll" <payroll@contoso.com>
To: Megan Bowen <megan.bowen@contoso.com>
Subject: Action required: update your deposit
Date: Mon, 16 Nov 2026 14:02:09 +0000
Message-ID: <abc123@northwind.example>
Return-Path: bounce@northwind.example
X-Forefront-Antispam-Report: CIP:203.0.113.45;CTRY:US;LANG:en;SCL:5;SRV:;IPV:NLI;SFV:SPM;H:mail.northwind.example;PTR:mail.northwind.example;CAT:SPOOF;SFS:(10001);DIR:INB;SFTY:9.19
X-Microsoft-Antispam: BCL:6;PCL:7
X-MS-Exchange-Organization-AuthAs: Anonymous
X-MS-Exchange-Organization-AuthSource: contoso-com.mail.protection.outlook.com
X-MS-Exchange-Organization-SCL: 5
X-MS-Exchange-Organization-PCL: 7
X-MS-Exchange-Organization-MessageDirectionality: Incoming
X-MS-Exchange-Organization-Rules-Execution-History: Rule="Flag external spoof";Action="PrependSubject"
ARC-Seal: i=1; cv=fail; a=rsa-sha256; s=arcselector9901; d=microsoft.com
ARC-Authentication-Results: i=1; mx.microsoft.com; spf=pass smtp.mailfrom=northwind.example; dkim=pass header.d=marketing.example; dmarc=fail header.from=contoso.com

This is a fictional body. It is not a real message.
`;

export const SAMPLE_CLEAN = `Received: from MN2PR05MB6001.namprd05.prod.outlook.com (2603:10b6:8:2::11)
 by DM6PR05MB6000.namprd05.prod.outlook.com with HTTPS; Tue, 17 Nov 2026 09:15:04 +0000
Received: from contoso-com.mail.protection.outlook.com (2a01:111:f400:7e::2)
 by MN2PR05MB6001.namprd05.prod.outlook.com with Microsoft SMTP Server (version=TLS1_3, cipher=TLS_AES_256_GCM_SHA384) id 15.20.9215.20 via Frontend Transport; Tue, 17 Nov 2026 09:15:03 +0000
Received: from mail.fabrikam.example (mail.fabrikam.example [203.0.113.20])
 by contoso-com.mail.protection.outlook.com with Microsoft SMTP Server (version=TLS1_2, cipher=TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384) id 15.20.9215.19 via Frontend Transport; Tue, 17 Nov 2026 09:15:02 +0000
Authentication-Results: spf=pass (sender IP is 203.0.113.20) smtp.mailfrom=fabrikam.example; dkim=pass (signature was verified) header.d=fabrikam.example; dmarc=pass action=none header.from=fabrikam.example; compauth=pass reason=100
From: Alex Wilber <alex@fabrikam.example>
To: Adele Vance <adele.vance@contoso.com>
Subject: Q4 shipping calendar
Date: Tue, 17 Nov 2026 09:15:00 +0000
Message-ID: <clean-100@fabrikam.example>
Return-Path: bounce@fabrikam.example
X-Forefront-Antispam-Report: CIP:203.0.113.20;CTRY:US;LANG:en;SCL:1;SRV:;IPV:NLI;SFV:NSPM;H:mail.fabrikam.example;PTR:mail.fabrikam.example;CAT:;DIR:INB
X-Microsoft-Antispam: BCL:0;PCL:0
X-MS-Exchange-Organization-AuthAs: Anonymous
X-MS-Exchange-Organization-AuthSource: contoso-com.mail.protection.outlook.com
X-MS-Exchange-Organization-MessageDirectionality: Incoming

Shipping dates are attached in the real world. This body is fictional.
`;

export const SAMPLE_DLP = `From: vendor@fabrikam.example
To: Megan Bowen <megan.bowen@contoso.com>
Subject: Invoice 100
Date: Tue, 17 Nov 2026 11:00:00 +0000
X-MS-Exchange-Organization-DlpPolicy: Credit card in email
X-MS-Exchange-Organization-DlpRule: Credit card number
X-MS-Exchange-Organization-DlpAction: Notify
`;

export const SAMPLES = {
  spoof: { id: 'spoof', label: 'Spoofed payroll message', headers: SAMPLE_SPOOF },
  clean: { id: 'clean', label: 'Authenticated partner message', headers: SAMPLE_CLEAN },
  dlp: { id: 'dlp', label: 'DLP tip on an invoice', headers: SAMPLE_DLP },
};

export function sampleEml(id = 'spoof') {
  return SAMPLES[id]?.headers || SAMPLE_SPOOF;
}
