import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { readFile } from 'node:fs/promises';

const server = spawn(process.execPath, ['scripts/serve-built.mjs'], { env: { ...process.env, PORT: '4175' }, stdio: ['ignore', 'pipe', 'inherit'] });
let checks = 0;
try {
  const inventory = JSON.parse(await readFile('scripts/catalogs/exercise-inventory.json', 'utf8'));
  const unselected = inventory.records.flatMap(record => record.sourceFrames
    .filter(frame => !record.selectedFrames.includes(frame.frame))
    .map(frame => `exercises/${record.slug}-${frame.frame}.svg`));
  assert.equal(unselected.length, 406);
  await Promise.race([once(server.stdout, 'data'), delay(10000).then(() => { throw new Error('Preview startup timeout'); })]);
  for (const prefix of ['/', '/entrena/']) {
    const base = `http://127.0.0.1:4175${prefix}`;
    const index = await fetch(base);
    assert.equal(index.status, 200);
    assert.match(await index.text(), /<base href="\.\/">/);
    const manifest = await (await fetch(`${base}resource-manifest.json`)).json();
    const worker = await (await fetch(`${base}ngsw.json`)).json();
    const webmanifest = await (await fetch(`${base}manifest.webmanifest`)).json();
    assert.equal(webmanifest.scope, './');
    assert.ok(worker.hashTable['./resource-manifest.json']);
    assert.ok(worker.assetGroups.every(group => group.installMode === 'prefetch'));
    for (const resource of manifest.resources) {
      const response = await fetch(new URL(resource, base));
      assert.equal(response.status, 200, `${prefix}${resource}`);
      if (resource.endsWith('.js')) assert.match(response.headers.get('content-type'), /javascript/);
      if (resource.endsWith('.svg')) assert.match(response.headers.get('content-type'), /image\/svg\+xml/);
      assert.ok((await response.arrayBuffer()).byteLength > 0);
      checks++;
    }
    for (const icon of webmanifest.icons) {
      const response = await fetch(new URL(icon.src, base));
      assert.equal(response.status, 200);
      checks++;
    }
    for (const path of unselected) {
      assert.equal((await fetch(new URL(path, base))).status, 404, `Unselected artwork served: ${prefix}${path}`);
      checks++;
    }
  }
  assert.equal((await fetch('http://127.0.0.1:4175/missing.js')).status, 404);
  console.log(`PASS: root/subpath static delivery; ${checks} resource/icon/exclusion checks, relative manifests, prefetch configuration, JS/SVG MIME types and all 406 unselected-frame URLs return 404 at both paths.`);
  console.log('This is static-server evidence, not browser/service-worker runtime proof.');
} finally {
  const exited = once(server, 'exit');
  server.kill('SIGTERM');
  await exited;
}
