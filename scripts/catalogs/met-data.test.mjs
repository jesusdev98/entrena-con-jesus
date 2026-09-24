import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extractMetRows, generateMetCatalog, validateMetCatalog, readMetSources, notice } from './met-data.mjs';
import { validateMets, verifyMetBuiltFile } from './validate-mets.mjs';
import { inspectMetHtml, sanitizeMetHtml, placeholder } from './sanitize-met-html.mjs';

const catalog = await generateMetCatalog();
const table = rows => `<table><tbody>${rows}</tbody></table>`;
const row = (code = '11115', met = '2.5', description = 'Cook, chef') => `<tr><td>${code}</td><td>${met}</td><td>${description}</td></tr>`;

test('replaces a synthetic JWT-style form candidate without touching MET rows and is idempotent', () => {
  const encode = object => Buffer.from(JSON.stringify(object)).toString('base64url');
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: 'synthetic' })}.${'x'.repeat(32)}`;
  const css = 'a{background:url(abcdefgh12345678.abcdefgh12345678.abcdefghijklmnop12345678)}';
  const html = `${css}<input type="hidden" name="jetpack_contact_form_jwt" value="${token}">${table(row())}`;
  const first = sanitizeMetHtml(html);
  const second = sanitizeMetHtml(first.sanitized);
  assert.equal(first.count, 1);
  assert.equal(second.count, 0);
  assert.equal(inspectMetHtml(css).jwt, 0);
  assert.ok(first.sanitized.includes(css));
  assert.ok(first.sanitized.includes(placeholder));
  assert.ok(!first.sanitized.includes(token));
  assert.equal(second.sanitized, first.sanitized);
  assert.equal(inspectMetHtml(second.sanitized).jwt, 0);
  assert.equal(extractMetRows(first.sanitized, 'adult').get('11115').met, 2.5);
  assert.throws(() => sanitizeMetHtml(css), /exactly one/);
  assert.throws(() => sanitizeMetHtml(`${html}${html}`), /exactly one/);
  assert.throws(() => sanitizeMetHtml(`<input type="hidden" name="other" value="${token}">`), /exactly one/);
  assert.throws(() => sanitizeMetHtml(`${html}<span>${token}</span>`), /exactly one/);
  assert.equal(inspectMetHtml(`${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: 'synthetic' })}.${'x'.repeat(32)}`).jwt, 0);
  assert.equal(inspectMetHtml(`${encode({ alg: 'HS256' })}.${encode({ sub: 'synthetic' })}.${'x'.repeat(32)}`).jwt, 0);
});

test('pins all eight official source pages and preserves commercial-use/oxygen evidence', async () => {
  const { lock, pages } = await readMetSources();
  assert.equal(lock.retrievedOn, '2026-09-19');
  assert.equal(pages.size, 8);
  assert.equal([...pages.values()].reduce((count, html) => count + inspectMetHtml(html).jwt, 0), 0);
  assert.equal(inspectMetHtml(pages.get('home')).targets, 1);
  assert.ok(pages.get('home').includes(placeholder));
  assert.equal(sanitizeMetHtml(pages.get('home')).count, 0);
  assert.match(notice, /free commercial use with citation/);
  assert.match(notice, /MET60\+: 2\.7/);
});
test('exact independent primary-page representative values, including leading-zero codes', () => {
  assert.equal(catalog.entries.filter(entry => entry.table === 'adult').length, 23);
  assert.equal(catalog.entries.filter(entry => entry.table === 'older-adult').length, 8);
  assert.ok(catalog.entries.every(entry => entry.referenceMlO2PerKgMin === (entry.table === 'adult' ? 3.5 : 2.7)));
  for (const [id, value, reference] of [
    ['adult:11115', 2.5, 3.5], ['adult:02054', 3.5, 3.5], ['adult:02101', 2.3, 3.5],
    ['adult:17170', 3, 3.5], ['adult:17190', 3.8, 3.5], ['adult:12030', 8.5, 3.5],
    ['adult:01010', 4, 3.5], ['adult:11582', 1.3, 3.5], ['older-adult:1717060', 4.5, 2.7],
    ['older-adult:0205460', 4.3, 2.7], ['older-adult:1101060', 1.5, 2.7],
  ]) {
    const entry = catalog.entries.find(entry => entry.id === id);
    assert.equal(entry.met, value, id); assert.equal(entry.referenceMlO2PerKgMin, reference, id);
  }
  assert.equal(catalog.entries.find(entry => entry.id === 'adult:17170').source.description, 'Walking, 2.5 mph, firm, level surface');
  assert.equal(catalog.entries.find(entry => entry.id === 'older-adult:1717060').source.description, 'Walking, 2.2 to 2.7 mph, level, firm surface');
});
test('extracts nested red marks, entities, whitespace and exact descriptions', () => {
  const extracted = extractMetRows(table(row('<mark style="color:#bb0000">02054</mark>', '3.5', 'Resistance &amp;\n  weights')), 'adult').get('02054');
  assert.deepEqual(extracted, { code: '02054', met: 3.5, description: 'Resistance & weights', sourceEstimated: true });
});
test('ignores headers and older N/A sections, distinguishing table namespaces', () => {
  const html = table(row('N/A', 'N/A', 'N/A') + row('1717060', '4.5', 'Walking'));
  assert.equal(extractMetRows(html, 'older-adult').get('1717060').met, 4.5);
  assert.throws(() => extractMetRows(html, 'adult'), /No MET rows/);
});
for (const [name, html] of [
  ['duplicates', table(row() + row())], ['missing cells', table('<tr><td>11115</td><td>2.5</td></tr>')],
  ['blank MET', table(row('11115', ''))], ['negative MET', table(row('11115', '-1'))],
  ['nonfinite MET', table(row('11115', 'Infinity'))], ['partial number', table(row('11115', '2.5 kcal'))],
  ['empty description', table(row('11115', '2.5', ''))], ['missing tables', '<p>11115 2.5 Cook</p>'],
]) test(`source extraction fails closed on ${name}`, () => assert.throws(() => extractMetRows(html, 'adult')));

for (const [name, mutate] of [
  ['baseline', data => { data.entries[0].referenceMlO2PerKgMin = 2.7; }],
  ['identity collision', data => { data.entries[1] = data.entries[0]; }],
  ['nonfinite MET', data => { data.entries[0].met = Infinity; }],
  ['source hash', data => { data.entries[0].source.sha256 = '0'.repeat(64); }],
  ['edition', data => { data.entries[0].edition = '2011'; }],
  ['citation', data => { data.entries[0].source.citation = ''; }],
  ['empty label', data => { data.entries[0].label = ''; }],
]) test(`catalog rejects corrupt ${name}`, () => {
  const data = structuredClone(catalog); mutate(data); assert.throws(() => validateMetCatalog(data));
});
test('published catalog is exact reproducible primary-source output and retains protected catalog hashes', async () => {
  await validateMets();
  assert.equal(await readFile('public/catalogs/activity-mets.json', 'utf8'), JSON.stringify(await generateMetCatalog()) + '\n');
  const foods = await readFile('public/catalogs/foods.es.json');
  assert.equal(createHash('sha256').update(foods).digest('hex'), '4f61cafa56ad04033605fdb6051de2d224cf8e5141318f1a5ef37e6dc5da492b');
});
test('built proof rejects mismatched bytes, missing readiness/prefetch and stale hashes', () => {
  const path = 'catalogs/activity-mets.json', bytes = JSON.stringify(catalog);
  const worker = { assetGroups: [{ installMode: 'prefetch', urls: [`./${path}`] }], hashTable: { [`./${path}`]: createHash('sha1').update(bytes).digest('hex') } };
  assert.doesNotThrow(() => verifyMetBuiltFile(path, bytes, bytes, [path], worker));
  assert.throws(() => verifyMetBuiltFile(path, bytes, bytes + ' ', [path], worker), /bytes differ/);
  assert.throws(() => verifyMetBuiltFile(path, bytes, bytes, [], worker), /readiness/);
  assert.throws(() => verifyMetBuiltFile(path, bytes, bytes, [path], { ...worker, assetGroups: [] }), /prefetch/);
  assert.throws(() => verifyMetBuiltFile(path, bytes, bytes, [path], { ...worker, hashTable: {} }), /hash/);
});
