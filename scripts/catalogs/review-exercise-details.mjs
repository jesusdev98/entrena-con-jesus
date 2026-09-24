import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { sha256 } from './sources.mjs';

const manifest = JSON.parse(await readFile('.catalog-cache/workout-manifest.json', 'utf8'));
const lock = JSON.parse(await readFile('scripts/catalogs/exercise-source-lock.json', 'utf8'));
const selected = process.argv.slice(2).map(slug => {
  const exercise = manifest.find(item => item.slug === slug);
  assert.ok(exercise, `Unknown exercise: ${slug}`); return exercise;
});
assert.ok(selected.length > 0, 'Pass source slugs to render cached SVG detail sheets');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1560, height: 580 }, deviceScaleFactor: 1 });
  await page.route('**/*', route => route.abort());
  for (const exercise of selected) {
    const images = [];
    for (const frame of exercise.frames) {
      const file = `${exercise.slug}-${frame.index}.svg`;
      const bytes = await readFile(`.catalog-cache/${file}`);
      assert.equal(sha256(bytes), lock.assets[file], `Cache differs: ${file}`);
      images.push(`<figure><img src="data:image/svg+xml;base64,${bytes.toString('base64')}"/><figcaption>${frame.index}</figcaption></figure>`);
    }
    await page.setContent(`<style>body{margin:0;font:18px system-ui}h1{font-size:22px}main{display:flex}figure{margin:0;width:520px;text-align:center}img{width:512px;height:512px;background:#111827;object-fit:contain}</style><h1>${exercise.slug}</h1><main>${images.join('')}</main>`);
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    await page.screenshot({ path: `catalog-review/detail-${exercise.slug}.png`, fullPage: true });
  }
  console.log(`Rendered ${selected.length} three-pose detail sheets from verified cached SVGs; no server or network.`);
} finally { await browser.close(); }
