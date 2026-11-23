import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDkimCname } from '../lib/dnsparse.js';
import { lookup, checkDomain, parseDohAnswer, unquoteTxt } from '../server/dns.mjs';

const NEW_TARGET = 'selector1-contoso-com._domainkey.contoso.n-v1.dkim.mail.microsoft';

test('DKIM accepts the new Microsoft target format (*.dkim.mail.microsoft)', () => {
  const d = parseDkimCname('selector1', [`${NEW_TARGET}.`]);
  assert.deepEqual(d.problems, []);
  assert.deepEqual(d.target, [NEW_TARGET]);
});

test('an empty classic DNS answer is checked again over DNS-over-HTTPS', async () => {
  const got = await lookup('CNAME', 'selector1._domainkey.contoso.com', {
    classicImpl: async () => [],
    dohImpl: async () => [NEW_TARGET],
  });
  assert.deepEqual(got, [NEW_TARGET]);
});

test('a classic answer is used without DNS-over-HTTPS', async () => {
  let called = false;
  const got = await lookup('CNAME', 'x', { classicImpl: async () => ['a.example'], dohImpl: async () => { called = true; return []; } });
  assert.deepEqual(got, ['a.example']);
  assert.equal(called, false);
});

test('a missing record stays missing when both paths agree, and a classic error surfaces when both fail', async () => {
  assert.deepEqual(await lookup('TXT', 'x', { classicImpl: async () => [], dohImpl: async () => [] }), []);
  assert.deepEqual(await lookup('TXT', 'x', { classicImpl: async () => [], dohImpl: async () => { throw new Error('offline'); } }), []);
  await assert.rejects(lookup('TXT', 'x', {
    classicImpl: async () => { throw Object.assign(new Error('timeout'), { code: 'ETIMEOUT' }); },
    dohImpl: async () => { throw new Error('offline'); },
  }), /timeout/);
});

test('checkDomain shows no DKIM problem for contoso.com style records when Docker DNS returns nothing', async () => {
  const doh = { CNAME: { 'selector1._domainkey.contoso.com': [NEW_TARGET], 'selector2._domainkey.contoso.com': [NEW_TARGET.replace('selector1', 'selector2')] } };
  const r = await checkDomain('contoso.com', {
    classicImpl: async () => [],
    dohImpl: async (type, name) => doh[type]?.[name] || [],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.dkim.flatMap(d => d.problems), []);
  assert.equal(r.dkim[1].target[0], 'selector2-contoso-com._domainkey.contoso.n-v1.dkim.mail.microsoft');
});

test('DNS-over-HTTPS JSON answers are read for CNAME, TXT and MX', () => {
  assert.deepEqual(parseDohAnswer('CNAME', { Status: 0, Answer: [{ type: 5, data: `${NEW_TARGET}.` }] }), [`${NEW_TARGET}.`]);
  assert.deepEqual(parseDohAnswer('TXT', { Status: 0, Answer: [{ type: 16, data: '"v=spf1 include:spf.protection.outlook.com" " -all"' }] }), ['v=spf1 include:spf.protection.outlook.com -all']);
  assert.deepEqual(parseDohAnswer('MX', { Status: 0, Answer: [{ type: 15, data: '0 contoso-com.mail.protection.outlook.com.' }] }), [{ preference: 0, exchange: 'contoso-com.mail.protection.outlook.com.' }]);
  assert.deepEqual(parseDohAnswer('TXT', { Status: 3 }), []);
  assert.throws(() => parseDohAnswer('TXT', { Status: 2 }));
  assert.equal(unquoteTxt('"a\\"b"'), 'a"b');
});
