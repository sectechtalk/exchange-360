import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLOSSARY, GLOSSARY_CATEGORIES, FEATURE_NEEDS, NEED_KINDS, OR } from '../lib/content.js';
import { PAGES } from '../lib/pages.js';

test('License, Roles and Permissions: entries are one per line, grouped by kind, with OR between alternatives', () => {
  const name = item => (typeof item === 'string' ? item : item.name);
  for (const row of FEATURE_NEEDS) {
    for (const side of ['tenant', 'you']) {
      const parts = row[side];
      assert.ok(Array.isArray(parts) && parts.length, `${row.feature} ${side}`);
      assert.notEqual(parts[0], OR, `${row.feature} ${side} starts with OR`);
      assert.notEqual(parts.at(-1), OR, `${row.feature} ${side} ends with OR`);
      parts.forEach((part, i) => { if (part === OR) assert.notEqual(parts[i + 1], OR, `${row.feature}: OR OR`); });
    }
    for (const part of row.tenant.filter(x => x !== OR)) assert.ok(name(part) && !part.items, `${row.feature}: tenant lines are licenses`);
    for (const part of row.you.filter(x => x !== OR)) {
      assert.ok(NEED_KINDS[part.kind], `${row.feature}: unknown kind ${part.kind}`);
      for (const item of part.items) assert.ok(name(item) && name(item).length < 60 && !/[.,]$/.test(name(item)), `${row.feature}: ${name(item)}`);
    }
  }
  const first = FEATURE_NEEDS.find(r => r.feature === 'See users, licenses and domains');
  assert.deepEqual(first.tenant, ['Microsoft 365', 'Exchange Online']);
  assert.deepEqual(first.you, [{ kind: 'Permissions', items: ['Directory.Read.All', 'Organization.Read.All', 'Domain.Read.All'] }, OR, { kind: 'Role', items: ['Global Reader'] }]);
});

test('the needs page is named License, Roles and Permissions in the nav and the heading', () => {
  assert.equal(PAGES.find(p => p.id === 'needs').title, 'License, Roles and Permissions');
  assert.match(readFileSync(new URL('../public/index.html', import.meta.url), 'utf8'), /data-view="needs"[^>]*>.*License, Roles and Permissions<\/a>/);
});

test('every glossary term has a category from the drop-down, and every category is used', () => {
  for (const [term, , cat] of GLOSSARY) assert.ok(GLOSSARY_CATEGORIES.includes(cat), `${term}: ${cat}`);
  for (const cat of GLOSSARY_CATEGORIES) assert.ok(GLOSSARY.some(g => g[2] === cat), cat);
});

test('every recipient list explains an empty search in its own words', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const lists = [...app.matchAll(/^  '(rcp-[a-z0-9-]+)': \{ name:/gm)].map(m => m[1]);
  const words = app.slice(app.indexOf('const LIST_WORDS = {'), app.indexOf('function noMatch('));
  assert.ok(lists.length >= 6);
  for (const id of lists) assert.ok(words.includes(`'${id}':`), id);
  assert.doesNotMatch(app, /Nothing matches "\$\{input\.value/);
});
