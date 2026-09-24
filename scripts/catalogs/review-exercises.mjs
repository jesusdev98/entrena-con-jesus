import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { JSDOM } from 'jsdom';
import { download, pooled, workoutRoot, workoutRevision, sha256 } from './sources.mjs';

const manifest = JSON.parse(await readFile('.catalog-cache/workout-manifest.json', 'utf8'));
await mkdir('catalog-review', { recursive: true });
const hashes = {};
await pooled(manifest.flatMap(exercise => exercise.frames.map(frame => ({ exercise, frame }))), 6, async ({ exercise, frame }) => {
  const name = `${exercise.slug}-${frame.index}.svg`;
  const bytes = await download(`${workoutRoot}/packages/workout-guide/${frame.path}`, name);
  const document = new JSDOM(bytes.toString(), { contentType: 'image/svg+xml' }).window.document;
  if (document.documentElement.localName !== 'svg') throw new Error(`Invalid SVG: ${name}`);
  for (const element of document.querySelectorAll('*')) {
    if (['script', 'foreignObject', 'image', 'use', 'iframe', 'style', 'animate', 'set'].includes(element.localName)) throw new Error(`Unsupported active/external SVG element: ${name}`);
    for (const attribute of element.attributes) {
      if (/^on/i.test(attribute.name) || /href$/i.test(attribute.name) || /url\((?!['"]?#)/i.test(attribute.value)) throw new Error(`Unsafe SVG attribute: ${name}`);
    }
  }
  hashes[name] = sha256(bytes);
});
for (const name of ['LICENSE-ASSETS', 'LICENSES.md', 'ATTRIBUTION.md']) await download(`${workoutRoot}/${name}`, name);
await writeFile('.catalog-cache/artwork-hashes.json', JSON.stringify({ revision: workoutRevision, files: hashes }, null, 2));
console.log(`Downloaded and parsed ${Object.keys(hashes).length} review SVGs. Nothing is published until pose selection.`);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1500 }, deviceScaleFactor: 1 });
  for (let start = 0; start < manifest.length; start += 12) {
    const rows = await Promise.all(manifest.slice(start, start + 12).map(async (exercise, index) => {
      const images = await Promise.all(exercise.frames.map(async frame => `<figure><img src="data:image/svg+xml;base64,${(await readFile(`.catalog-cache/${exercise.slug}-${frame.index}.svg`)).toString('base64')}"/><figcaption>${frame.index}</figcaption></figure>`));
      return `<article><b>${start + index + 1}. ${exercise.slug}</b><div>${images.join('')}</div></article>`;
    }));
    await page.setContent(`<style>body{margin:0;font:13px system-ui;background:white}main{display:grid;grid-template-columns:1fr 1fr;gap:8px}article{border:1px solid #bbb;padding:5px;min-width:0}article>div{display:flex}figure{margin:0;width:33%;text-align:center}img{height:165px;width:100%;object-fit:contain;background:#111827}b{display:block}</style><main>${rows.join('')}</main>`);
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    await page.screenshot({ path: `catalog-review/poses-${String(start + 1).padStart(3, '0')}.png`, fullPage: true });
  }
} finally { await browser.close(); }
