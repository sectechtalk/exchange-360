import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, explainField, SFV, CAT, COMPAUTH_REASONS, alignment, explainScl, explainBcl, explainPcl } from '../lib/analyzer.js';
import { shareCopy, redactText, isShareCopy, SHARE_FORMAT } from '../lib/redact.js';
import { SAMPLES } from '../lib/samples.js';
import { parseEml, parseMsg } from '../lib/message.js';
import { parseSpf, parseDmarc, parseMx, parseDkimCname, parseMtaSts, parseTlsRpt, parseAutodiscover } from '../lib/dnsparse.js';
import { policiesForMailbox, transportRulesForMailbox, connectorsForMailbox, ruleMatches } from '../lib/scope.js';
import { featureStatus, licenseGap, normalizeSku, SKUS, FEATURES, SERVICE_PLANS } from '../lib/licenses.js';
import { PORTALS } from '../lib/portals.js';
import { NDR, lookupNdr } from '../lib/ndr.js';
import { GLOSSARY, FEATURE_NEEDS, LEARN, PLAYBOOKS, PATH, SITUATIONS, FIRST_MINUTES, PHASES, ONPREM, lookupSignInError } from '../lib/content.js';
import { PAGES, isPage } from '../lib/pages.js';
import { CALLS, notAuthorized } from '../lib/permissions.js';
import { DEMO_ORG, DEMO_MAILBOXES, demoMailbox } from '../lib/demo.js';
import { buildMailboxView } from '../lib/mailbox.js';
import { pkcePair, authorizeUrl, tokenRequestBody, refreshRequestBody } from '../lib/authflow.js';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const spoof = analyze(SAMPLES.spoof.headers);
const clean = analyze(SAMPLES.clean.headers);
const megan = demoMailbox('megan.bowen@contoso.com');
const adele = demoMailbox('adele.vance@contoso.com');
const sales = demoMailbox('sales@contoso.com');

test('spoof sample: hops run oldest-first and include EOP', () => {
  assert.equal(spoof.hops[0].from, 'mail.northwind.example');
  assert.equal(spoof.hops[0].kind, 'eop');
  assert.ok(spoof.hops.some(hop => hop.kind === 'eop'));
  assert.ok(spoof.hops.some(hop => hop.kind === 'exo'));
  assert.equal(spoof.hops[0].tls, 'TLS1_2');
  assert.ok(spoof.hops[1].delayMs >= 0);
});

test('spoof sample explains DMARC, compauth and the transport rule', () => {
  assert.equal(spoof.summary.dmarc, 'fail');
  assert.equal(spoof.summary.compauth, 'fail');
  assert.equal(spoof.summary.cat, 'SPOOF');
  assert.equal(spoof.summary.sfv, 'SPM');
  assert.ok(spoof.organization.rules.includes('Flag external spoof'));
  assert.equal(spoof.organization.authAs, 'Anonymous');
  assert.equal(spoof.authentication.arc.cv, 'fail');
  assert.equal(spoof.chatReady, true);
  assert.ok(spoof.deferred[0].includes('Azure OpenAI'));
});

test('clean sample passes SPF, DKIM and DMARC with alignment', () => {
  assert.equal(clean.summary.spf, 'pass');
  assert.equal(clean.summary.dmarc, 'pass');
  assert.equal(clean.summary.compauth, 'pass');
  assert.equal(clean.authentication.alignment.spfAligned, true);
  assert.equal(clean.authentication.alignment.dkimAligned, true);
  assert.equal(clean.findings.some(f => f.severity === 'high'), false);
});

test('redacted share copy drops addresses and raw headers', () => {
  const copy = shareCopy(spoof);
  assert.equal(isShareCopy(copy), true);
  assert.equal(copy.format, SHARE_FORMAT);
  const text = JSON.stringify(copy);
  assert.equal(text.includes('megan.bowen@contoso.com'), false);
  assert.equal(text.includes('203.0.113.45'), false);
  assert.equal(text.includes('"raw"'), false);
  assert.match(redactText('a@b.com 1.2.3.4'), /user@redacted\.example 203\.0\.113\.0/);
});

test('eml parse keeps headers and rejects an empty file', () => {
  const parsed = parseEml(SAMPLES.clean.headers);
  assert.equal(parsed.kind, 'eml');
  assert.ok(parsed.headerCount > 3);
  assert.throws(() => parseEml('hello'), /RFC 5322/);
  assert.throws(() => parseMsg(new Uint8Array([1, 2, 3, 4])), /OLE/);
});

for (const [code, text] of Object.entries(SFV)) {
  test(`SFV ${code} is explained`, () => {
    assert.equal(explainField('SFV', code), text);
    assert.ok(text.length > 20);
  });
}
for (const [code, text] of Object.entries(CAT)) {
  test(`CAT ${code} is explained`, () => {
    assert.equal(explainField('CAT', code), text);
  });
}
for (const [code, text] of Object.entries(COMPAUTH_REASONS)) {
  test(`compauth reason ${code} is a sentence`, () => {
    assert.ok(text.endsWith('.') || text.includes('.'));
    const result = analyze(`Authentication-Results: compauth=${code.startsWith('1') || code.startsWith('7') ? 'pass' : 'fail'} reason=${code}\n`);
    assert.match(result.plainLanguage.join(' '), new RegExp(code));
  });
}
for (const value of ['-1', '0', '1', '5', '9']) {
  test(`SCL ${value} has a plain explanation`, () => assert.match(explainScl(value), new RegExp(value === '-1' ? 'skipped' : value)));
}
for (const value of ['0', '4', '7', '9']) test(`BCL ${value}`, () => assert.match(explainBcl(value), /BCL/));
for (const value of ['0', '2', '5', '8']) test(`PCL ${value}`, () => assert.match(explainPcl(value), /PCL|phish/i));

test('relaxed alignment allows a subdomain and strict does not', () => {
  const relaxed = alignment('mail.contoso.com', 'contoso.com', [], 'r');
  const strict = alignment('mail.contoso.com', 'contoso.com', ['contoso.com'], 's');
  assert.equal(relaxed.spfAligned, true);
  assert.equal(strict.spfAligned, false);
  assert.equal(strict.dkimAligned, true);
});

test('SPF parser flags ~all, +all and a missing record', () => {
  assert.equal(parseSpf(['v=spf1 include:spf.protection.outlook.com -all']).qualifier, '-');
  assert.equal(parseSpf(['v=spf1 include:spf.protection.outlook.com -all']).exo, true);
  assert.ok(parseSpf(['v=spf1 ~all']).problems.some(p => p.includes('~all')));
  assert.ok(parseSpf(['v=spf1 +all']).problems.some(p => p.includes('+all')));
  assert.equal(parseSpf(['v=spf1']).present, true);
  assert.equal(parseSpf(['google-site-verification=abc']).present, false);
});

test('DMARC, MX, DKIM, MTA-STS, TLS-RPT and Autodiscover parsers', () => {
  const dmarc = parseDmarc(['v=DMARC1; p=none; rua=mailto:d@contoso.com']);
  assert.equal(dmarc.policy, 'none');
  assert.ok(dmarc.problems.some(p => p.includes('p=none')));
  assert.equal(parseDmarc(['v=spf1 -all']).present, false);
  assert.equal(parseMx([{ preference: 0, exchange: 'contoso-com.mail.protection.outlook.com' }]).exo.length, 1);
  assert.equal(parseMx([]).problems.length, 1);
  assert.equal(parseDkimCname('selector1', ['selector1-contoso-com._domainkey.contoso.onmicrosoft.com']).problems.length, 0);
  assert.ok(parseDkimCname('selector1', []).problems.length);
  assert.equal(parseMtaSts(['v=STSv1; id=1']).present, true);
  assert.equal(parseTlsRpt([]).present, false);
  assert.equal(parseAutodiscover(['autodiscover.outlook.com']).exo, true);
});

test('preset Strict wins for Adele and Standard wins for Megan', () => {
  const adelePolicies = policiesForMailbox(DEMO_ORG, adele);
  const meganPolicies = policiesForMailbox(DEMO_ORG, megan);
  assert.equal(adelePolicies.preset.name, 'Strict');
  assert.equal(meganPolicies.preset.name, 'Standard');
  assert.match(adelePolicies.policies.antiSpam.why, /Strict/);
  assert.equal(meganPolicies.policies.safeLinks.applies.includes('Standard') || meganPolicies.policies.safeLinks.applies.includes('preset'), true);
});

test('a disabled transport rule is reported but does not apply', () => {
  const rules = transportRulesForMailbox(DEMO_ORG.transportRules, megan);
  const disabled = rules.find(rule => rule.name === 'Disabled test rule');
  assert.equal(disabled.wouldMatch, true);
  assert.equal(disabled.applies, false);
  const view = buildMailboxView(DEMO_ORG, megan);
  assert.ok(view.findings.some(f => f.title.includes('Disabled test rule')));
  assert.ok(view.findings.some(f => /forward/i.test(f.title)));
});

test('Sales shared mailbox is not in a preset and matches the domain rule', () => {
  const policies = policiesForMailbox(DEMO_ORG, sales);
  assert.equal(policies.preset, null);
  assert.match(policies.policies.antiSpam.why, /contoso\.com/);
  const connectors = connectorsForMailbox(DEMO_ORG.connectors, sales);
  assert.equal(connectors.find(c => c.name === 'From Northwind gateway').applies, true);
});

test('an exception removes a mailbox from a rule', () => {
  const result = ruleMatches({ sentTo: [], recipientDomainIs: ['contoso.com'], exceptIfSentTo: ['megan.bowen@contoso.com'], state: 'Enabled' }, megan);
  assert.equal(result.match, false);
  assert.match(result.why, /Excepted/);
});

test('missing Defender license is named instead of an empty Safe Links table', () => {
  const org = { ...DEMO_ORG, defender: false, skus: [{ skuPartNumber: 'EXCHANGESTANDARD', consumedUnits: 1, prepaidUnits: { enabled: 1 }, servicePlans: [] }] };
  const policies = policiesForMailbox(org, sales);
  assert.equal(policies.policies.safeLinks.unavailable, true);
  assert.match(policies.policies.safeLinks.needs || policies.policies.safeLinks.license, /Defender for Office 365/);
  assert.ok(licenseGap(org.skus, 'safe-links'));
});

for (const [part, sku] of Object.entries(SKUS)) {
  test(`SKU ${part} has a display name`, () => {
    assert.ok(sku.name);
    const row = normalizeSku({ skuPartNumber: part, consumedUnits: 1, prepaidUnits: { enabled: 2 }, servicePlans: [] });
    assert.equal(row.part, part);
    assert.equal(row.remaining, 1);
  });
}
for (const [id, feature] of Object.entries(FEATURES)) {
  test(`feature ${id} names the license that unlocks it`, () => assert.ok(feature.needs.length > 5));
}
for (const plan of Object.keys(SERVICE_PLANS)) {
  test(`service plan ${plan} unlocks at least one feature`, () => assert.ok(SERVICE_PLANS[plan].features.length));
}

test('E5 unlocks Defender Plan 2 and Exchange Plan 1 does not', () => {
  const e5 = featureStatus([{ skuPartNumber: 'SPE_E5', consumedUnits: 1, prepaidUnits: { enabled: 1 }, servicePlans: [] }]);
  const p1 = featureStatus([{ skuPartNumber: 'EXCHANGESTANDARD', consumedUnits: 1, prepaidUnits: { enabled: 1 }, servicePlans: [] }]);
  assert.equal(e5.find(f => f.id === 'mdo-p2').unlocked, true);
  assert.equal(p1.find(f => f.id === 'safe-links').unlocked, false);
  assert.equal(p1.find(f => f.id === 'eop').unlocked, true);
});

for (const portal of PORTALS) {
  test(`portal ${portal.id} lists real links, best first`, () => {
    // At least one real link. The classic Exchange admin center links were removed on 2026-11-23 (it returns 404),
    // which left some panes with one portal; a dead second link is worse than none.
    assert.ok(portal.links.length >= 1, portal.id);
    assert.ok(portal.links[0].url.startsWith('https://'));
    for (const link of portal.links) assert.match(link.url, /^https:\/\//);
    assert.match(portal.powershell, /^Get-|^Resolve-/);
  });
  for (const link of portal.links) {
    test(`portal link ${portal.id}: ${link.name}`, () => {
      assert.ok(link.name.length > 3);
      assert.doesNotMatch(link.url, /javascript:/);
    });
  }
}

for (const row of NDR) {
  test(`NDR ${row.code} has a cause, a fix and a Learn link`, () => {
    assert.ok(row.cause.length > 10);
    assert.ok(row.fix.length > 10);
    assert.match(row.learn, /^https:\/\/learn\.microsoft\.com\//);
    assert.equal(lookupNdr(`550 ${row.code} something`).code, row.code);
  });
}
test('lookupNdr ignores text without a 5.7 code', () => assert.equal(lookupNdr('mailbox full'), null));

for (const [term, text] of GLOSSARY) test(`glossary: ${term}`, () => assert.ok(text.length > 30));
for (const row of FEATURE_NEEDS) test(`needs: ${row.feature}`, () => assert.match(row.learn, /^https:\/\/learn\.microsoft\.com\//));
for (const article of LEARN) test(`learn: ${article.id}`, () => { assert.ok(article.body.length > 40); assert.match(article.learn, /^https:\/\/learn\.microsoft\.com\//); });
for (const book of PLAYBOOKS) {
  test(`playbook ${book.id} has steps and a command`, () => {
    assert.ok(book.steps.length >= 3);
    assert.match(book.powershell, /Get-|Set-/);
    assert.ok(book.symptoms);
  });
  for (const [index, step] of book.steps.entries()) test(`playbook ${book.id} step ${index + 1}`, () => assert.ok(step.length > 15));
}
for (const step of PATH) test(`path ${step.id}`, () => assert.ok(isPage(step.open.view)));
for (const step of FIRST_MINUTES) test(`first minutes ${step.id}`, () => assert.ok(isPage(step.open.view)));
for (const situation of SITUATIONS) test(`asked: ${situation.when}`, () => assert.ok(isPage(situation.open.view)));
for (const phase of PHASES) test(`phase ${phase.id}`, () => assert.ok(phase.sub));
for (const page of PAGES) test(`page ${page.id} is routable`, () => { assert.equal(isPage(page.id), true); assert.ok(page.icon); assert.ok(page.blurb); });

test('on-premises is explicitly later', () => {
  assert.match(ONPREM.status, /Not in this version/);
  assert.ok(ONPREM.later.length >= 3);
});

for (const [id, call] of Object.entries(CALLS)) {
  test(`permission ${id} names a role`, () => {
    const result = notAuthorized(id);
    assert.equal(result.label, 'Not authorized');
    assert.equal(result.authorized, false);
    assert.match(result.message, new RegExp(call.permission.replace(/[.]/g, '\\.')));
    assert.ok(result.role);
  });
}

test('demo mailboxes cover user, shared and room', () => {
  const types = new Set(DEMO_MAILBOXES.map(m => m.type));
  assert.ok(types.has('UserMailbox') && types.has('SharedMailbox') && types.has('RoomMailbox'));
  assert.equal(demoMailbox('nope'), null);
  for (const mailbox of DEMO_MAILBOXES) {
    const view = buildMailboxView(DEMO_ORG, mailbox);
    assert.ok(view.protocols.length >= 6);
    assert.ok(view.findings.length);
  }
});

test('PKCE authorize URL has a challenge and no secret', () => {
  const pair = pkcePair();
  assert.equal(pair.method, 'S256');
  assert.notEqual(pair.verifier, pair.challenge);
  const url = authorizeUrl({ tenant: 'contoso.onmicrosoft.com', clientId: 'app', redirectUri: 'http://localhost:8360/auth/callback', scopes: ['openid', 'User.Read'], challenge: pair.challenge, state: 'state' });
  assert.match(url, /code_challenge_method=S256/);
  assert.doesNotMatch(url, /client_secret/);
  const body = tokenRequestBody({ clientId: 'app', redirectUri: 'http://localhost:8360/auth/callback', code: 'code', verifier: pair.verifier, scope: 'openid' });
  assert.equal(body.has('client_secret'), false);
  assert.equal(body.has('client_assertion'), false);
  assert.equal(body.get('code_verifier'), pair.verifier);
  assert.equal(body.get('grant_type'), 'authorization_code');
  const refresh = refreshRequestBody({ clientId: 'app', refreshToken: 'r', scope: 'offline_access https://outlook.office365.com/.default' });
  assert.equal(refresh.get('grant_type'), 'refresh_token');
  assert.equal(refresh.has('client_secret'), false);
  assert.equal(refresh.has('client_assertion'), false);
});

test('AADSTS7000218 tells you to move the callback off the Web platform', () => {
  const hit = lookupSignInError('AADSTS7000218: The request body must contain the following parameter: client_assertion or client_secret.');
  assert.equal(hit.code, 'AADSTS7000218');
  assert.match(hit.fix, /Mobile and desktop/);
  assert.match(hit.fix, /not a Web|Web platform|delete every redirect URI on the Web/i);
  assert.match(hit.cause, /no secret|never sends a secret/i);
  assert.equal(lookupSignInError('AADSTS50076'), null);
  const scope = lookupSignInError("AADSTS650053: The application asked for scope 'Exchange.Manage' that doesn't exist on the resource '00000003-0000-0000-c000-000000000000'.");
  assert.equal(scope.code, 'AADSTS650053');
  assert.match(scope.cause, /00000003-0000-0000-c000-000000000000/);
  assert.match(scope.fix, /https:\/\/outlook\.office365\.com\/\.default/);
});

test('our own names are Ex360 and exchange-360', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.name, 'exchange-360');
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  // The README must stay honest about what has and has not run against a real tenant.
  assert.match(readme, /Run against a real tenant/);
  assert.match(readme, /17 November 2026/);
  assert.match(readme, /not yet checked on a real tenant/i);
  assert.doesNotMatch(readme, /admin consent for the Exchange Online permission has not been granted/i);
  assert.match(readme, /docs\/setup\.md/);
  // The README is public-safe: tenant and app ids live only in .env.example and docs/auth.md.
  assert.doesNotMatch(readme, /your-client-id|your-tenant-id/);
  assert.doesNotMatch(readme, /\bE360\b|\be360\b/);
});

import { normalizeSku as normSku, unlockedFeatures as unlocked } from '../lib/licenses.js';
import test2 from 'node:test';
import assert2 from 'node:assert/strict';
test2('a suspended or locked-out SKU is shown with its status and unlocks nothing', () => {
  const sku = normSku({ skuPartNumber: 'SPE_E5', capabilityStatus: 'Suspended', consumedUnits: 0, prepaidUnits: { enabled: 0, suspended: 25 }, servicePlans: [{ servicePlanName: 'THREAT_INTELLIGENCE', provisioningStatus: 'Success' }] });
  assert2.equal(sku.status, 'Suspended');
  assert2.equal(sku.active, false);
  assert2.deepEqual(unlocked([sku]), []);
  assert2.equal(normSku({ skuPartNumber: 'MICROSOFT_365_E7', consumedUnits: 1, prepaidUnits: { enabled: 25 } }).status, 'Enabled');
});
