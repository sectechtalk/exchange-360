// Pure readers for the DNS records an Exchange Online domain publishes.
// The server fills `records` from live DNS. These functions only interpret text.

export function parseSpf(txts) {
  const record = (txts || []).find(t => /^v=spf1\b/i.test(t)) || '';
  if (!record) return { present: false, record: '', qualifier: '', lookups: 0, mechanisms: [], problems: ['No SPF TXT record (v=spf1) was published.'] };
  const parts = record.trim().split(/\s+/).slice(1);
  const mechanisms = [];
  let qualifier = '';
  let lookups = 0;
  const problems = [];
  for (const part of parts) {
    const q = /^([+\-~?])/.exec(part)?.[1] || '+';
    const body = part.replace(/^[+\-~?]/, '');
    const name = body.split(':')[0].split('/')[0].toLowerCase();
    if (name === 'all') { qualifier = q; mechanisms.push({ qualifier: q, mechanism: 'all' }); continue; }
    mechanisms.push({ qualifier: q, mechanism: name, value: body.includes(':') ? body.split(':').slice(1).join(':') : '' });
    if (['include', 'a', 'mx', 'ptr', 'exists', 'redirect'].includes(name)) lookups += 1;
  }
  if (!qualifier) problems.push('The SPF record has no "all" mechanism, so receivers are not told what to do with other servers.');
  if (qualifier === '~') problems.push('SPF ends in ~all (soft fail). Receivers may accept mail that does not match. Exchange Online domains usually publish -all.');
  if (qualifier === '?') problems.push('SPF ends in ?all, which gives receivers no instruction.');
  if (qualifier === '+') problems.push('SPF ends in +all, which authorizes every server. This is not safe.');
  if (lookups > 10) problems.push(`This record needs about ${lookups} DNS lookups. SPF evaluation stops after 10.`);
  const exo = mechanisms.some(m => m.mechanism === 'include' && /spf\.protection\.outlook\.com/i.test(m.value));
  return { present: true, record, qualifier, lookups, mechanisms, exo, problems };
}

export function parseDmarc(txts) {
  const record = (txts || []).find(t => /^v=DMARC1\b/i.test(t)) || '';
  if (!record) return { present: false, record: '', policy: '', problems: ['No DMARC TXT record at _dmarc.'] };
  const tags = Object.fromEntries(record.split(';').map(p => p.trim()).filter(Boolean).map(p => {
    const [k, ...rest] = p.split('=');
    return [k.trim().toLowerCase(), rest.join('=').trim()];
  }));
  const policy = (tags.p || '').toLowerCase();
  const problems = [];
  if (!['none', 'quarantine', 'reject'].includes(policy)) problems.push('DMARC has no p= tag of none, quarantine or reject.');
  if (policy === 'none') problems.push('DMARC is p=none. Receivers report failures but do not quarantine or reject on DMARC alone. That is a normal starting point, and it is not enforcement.');
  if (!tags.rua) problems.push('No rua= address, so aggregate reports have nowhere to go.');
  return {
    present: true, record, policy, pct: tags.pct || '100', adkim: tags.adkim || 'r', aspf: tags.aspf || 'r', rua: tags.rua || '', problems,
  };
}

export function parseMx(records) {
  const list = (records || []).map(r => ({ preference: r.priority ?? r.preference, exchange: String(r.exchange || '').replace(/\.$/, '') }));
  const exo = list.filter(r => /\.mail\.protection\.outlook\.com$/i.test(r.exchange));
  const problems = [];
  if (!list.length) problems.push('No MX record. Other organizations cannot deliver mail to this domain.');
  if (list.length && !exo.length) problems.push('No MX points at Exchange Online Protection (*.mail.protection.outlook.com). Mail for this domain is not coming to this tenant, or a gateway is in front.');
  return { records: list, exo, problems };
}

export function parseDkimCname(selector, records) {
  const target = (records || []).map(r => String(r).replace(/\.$/, ''));
  const expected = /_domainkey\./i;
  const problems = [];
  if (!target.length) problems.push(`No CNAME for selector ${selector}._domainkey. DKIM signing for this selector is not published.`);
  else if (!target.some(t => expected.test(t))) problems.push(`Selector ${selector} does not point at a _domainkey name.`);
  return { selector, target, problems };
}

export function parseMtaSts(txts) {
  const record = (txts || []).find(t => /^v=STSv1\b/i.test(t)) || '';
  return { present: Boolean(record), record, problems: record ? [] : ['No MTA-STS TXT record at _mta-sts. Senders that enforce MTA-STS will not find a policy id.'] };
}

export function parseTlsRpt(txts) {
  const record = (txts || []).find(t => /^v=TLSRPTv1\b/i.test(t)) || '';
  return { present: Boolean(record), record, problems: record ? [] : ['No TLS-RPT TXT record at _smtp._tls. You will not receive SMTP TLS failure reports.'] };
}

export function parseAutodiscover(records) {
  const target = (records || []).map(r => String(r).replace(/\.$/, ''));
  const exo = target.some(t => /autodiscover\.outlook\.com$/i.test(t));
  return {
    target,
    exo,
    problems: target.length ? (exo ? [] : ['Autodiscover does not point at autodiscover.outlook.com.']) : ['No autodiscover CNAME. Outlook clients may not find this mailbox automatically.'],
  };
}

export function summarizeDns(domain, parts) {
  const problems = [
    ...(parts.mx?.problems || []),
    ...(parts.spf?.problems || []),
    ...(parts.dmarc?.problems || []),
    ...(parts.dkim || []).flatMap(d => d.problems),
    ...(parts.mtaSts?.problems || []),
    ...(parts.tlsRpt?.problems || []),
    ...(parts.autodiscover?.problems || []),
  ];
  return { domain, ...parts, problems };
}
