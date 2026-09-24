import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { sha256 } from './sources.mjs';

export const tables = {
  adult: { referenceMlO2PerKgMin: 3.5, minimumAge: 19, maximumAge: 59, citation: 'Herrmann SD et al. 2024 Adult Compendium of Physical Activities. Journal of Sport and Health Science 13(1):6–12. https://www.sciencedirect.com/science/article/pii/S2095254623001084' },
  'older-adult': { referenceMlO2PerKgMin: 2.7, minimumAge: 60, maximumAge: null, citation: 'Willis EA et al. Older Adult Compendium of Physical Activities. Journal of Sport and Health Science 13(1):13–17. https://www.sciencedirect.com/science/article/pii/S2095254623001059' },
};
export const noticePath = 'licenses/compendium.txt';
export const notice = `Compendium of Physical Activities, 2024 edition\nhttps://pacompendium.com/\n\n${Object.values(tables).map(table => table.citation).join('\n')}\n\nThe official website permits free commercial use with citation and requests that MET values not be changed or activities with different MET levels combined. This is permission under the source's terms, not a claimed CC license.\n\nEntrena con Jesús selects a small subset and supplies Spanish display labels; source codes, descriptions (whitespace normalized), MET values and table oxygen references are retained. Adult MET: 3.5 ml/kg/min; older-adult MET60+: 2.7 ml/kg/min. Red source marks are retained as sourceEstimated; an unmarked code is not a clinical-accuracy guarantee.\nSource page hashes, retrieval date and URLs accompany the bundled catalog.\n`;

export function extractMetRows(html, table) {
  assert.ok(Object.hasOwn(tables, table), 'Unknown MET table');
  // jsdom does not execute scripts or load remote resources by default.
  const dom = new JSDOM(html);
  try {
    const rows = new Map();
    const pattern = table === 'adult' ? /^\d{5}$/ : /^\d{5}60$/;
    for (const row of dom.window.document.querySelectorAll('table tr')) {
      const cells = [...row.querySelectorAll('td')];
      if (!cells.length) continue;
      const text = cells.map(cell => cell.textContent.replace(/\s+/g, ' ').trim());
      if (!pattern.test(text[0])) continue;
      assert.equal(cells.length, 3, `Malformed row: ${text[0]}`);
      assert.match(text[1], /^\d+(?:\.\d+)?$/, `Malformed MET: ${text[0]}`);
      const met = Number(text[1]);
      assert.ok(Number.isFinite(met) && met > 0 && text[2], `Invalid MET row: ${text[0]}`);
      assert.ok(!rows.has(text[0]), `Duplicate source code: ${text[0]}`);
      const sourceEstimated = !!cells[0].querySelector('[style*="#bb0000"], [style*="#ff0000"], [style*="color:red"], [style*="color: red"]');
      rows.set(text[0], { code: text[0], met, description: text[2], sourceEstimated });
    }
    assert.ok(rows.size, 'No MET rows extracted');
    return rows;
  } finally { dom.window.close(); }
}

export async function readMetSources() {
  const lock = JSON.parse(await readFile('scripts/catalogs/met-source-lock.json', 'utf8'));
  assert.equal(lock.edition, '2024');
  assert.equal(lock.sources.length, 8);
  const pages = new Map();
  for (const source of lock.sources) {
    assert.equal(source.path, `scripts/catalogs/met-sources/${source.page}.html`);
    assert.equal(source.url, `https://pacompendium.com/${source.page === 'home' ? '' : `${source.page}/`}`);
    const bytes = await readFile(source.path);
    assert.equal(sha256(bytes), source.sha256, `MET source hash mismatch: ${source.page}`);
    assert.ok(!pages.has(source.page), 'Duplicate source page');
    pages.set(source.page, bytes.toString());
  }
  assert.match(pages.get('home'), /free to use for commercial purposes/);
  assert.match(pages.get('home'), /do not change MET values/);
  assert.match(pages.get('adult-compendium'), /ages 19-59/);
  assert.match(pages.get('older-adult-compendium'), /2\.7 ml\/kg\/min/);
  return { lock, pages };
}

export async function generateMetCatalog() {
  const { lock, pages } = await readMetSources();
  const selection = (await readFile('scripts/catalogs/mets.es.tsv', 'utf8')).trim().split(/\r?\n/).map(line => line.split('|'));
  const extracted = new Map();
  const entries = selection.map(([table, page, code, category, label]) => {
    assert.ok(Object.hasOwn(tables, table), 'Unknown selected table');
    assert.equal(page === 'older-adult-compendium', table === 'older-adult');
    if (!extracted.has(page)) extracted.set(page, extractMetRows(pages.get(page), table));
    const row = extracted.get(page).get(code);
    assert.ok(row, `Selected code not in primary source: ${table}:${code}`);
    const source = lock.sources.find(source => source.page === page);
    return { id: `${table}:${code}`, table, code, edition: lock.edition, met: row.met,
      referenceMlO2PerKgMin: tables[table].referenceMlO2PerKgMin, category, label,
      source: { url: source.url, sha256: source.sha256, retrievedOn: lock.retrievedOn,
        description: row.description, estimated: row.sourceEstimated, citation: tables[table].citation } };
  });
  const catalog = { version: 1, edition: lock.edition, language: 'es', tables, sources: lock.sources,
    licenseNotice: noticePath, entries };
  validateMetCatalog(catalog);
  return catalog;
}

export function validateMetCatalog(catalog) {
  assert.equal(catalog.version, 1);
  assert.equal(catalog.edition, '2024');
  assert.equal(catalog.language, 'es');
  assert.deepEqual(catalog.tables, tables);
  assert.equal(catalog.licenseNotice, noticePath);
  assert.equal(catalog.entries.length, 31);
  const ids = new Set();
  for (const entry of catalog.entries) {
    assert.ok(Object.hasOwn(tables, entry.table), 'Unknown table');
    assert.equal(entry.id, `${entry.table}:${entry.code}`);
    assert.match(entry.code, entry.table === 'adult' ? /^\d{5}$/ : /^\d{5}60$/);
    assert.ok(!ids.has(entry.id), `Duplicate MET identity ${entry.id}`);
    ids.add(entry.id);
    assert.equal(entry.edition, catalog.edition);
    assert.equal(entry.referenceMlO2PerKgMin, tables[entry.table].referenceMlO2PerKgMin);
    assert.ok(Number.isFinite(entry.met) && entry.met > 0);
    assert.ok(entry.label.trim() && entry.source.description.trim());
    assert.ok(['work', 'walking', 'running', 'cycling', 'resistance', 'stretching'].includes(entry.category));
    assert.equal(typeof entry.source.estimated, 'boolean');
    assert.equal(entry.source.citation, tables[entry.table].citation);
    const source = catalog.sources.find(source => source.url === entry.source.url);
    assert.ok(source, 'Missing primary source');
    assert.equal(entry.source.sha256, source.sha256);
    assert.match(source.sha256, /^[a-f0-9]{64}$/);
    assert.match(entry.source.retrievedOn, /^\d{4}-\d{2}-\d{2}$/);
  }
  for (const category of ['work', 'walking', 'running', 'cycling', 'resistance', 'stretching']) {
    assert.ok(catalog.entries.some(entry => entry.category === category), `Missing ${category}`);
  }
}
