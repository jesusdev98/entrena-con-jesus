import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const directory = resolve('dist/entrena-con-jesus/browser');
const worker = ['node_modules/@angular/service-worker/ngsw-config.js', 'dist/entrena-con-jesus/browser', 'ngsw-config.json', './'];
const regenerateWorker = () => {
  const result = spawnSync(process.execPath, worker, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

await copyFile(resolve('dist/entrena-con-jesus/3rdpartylicenses.txt'), resolve(directory, 'licenses/third-party-code.txt'));
regenerateWorker();
const manifest = JSON.parse(await readFile(resolve(directory, 'ngsw.json'), 'utf8'));
const resources = Object.keys(manifest.hashTable).map(path => path.replace(/^\.\//, '').replace(/^\//, ''));
await writeFile(resolve(directory, 'resource-manifest.json'), JSON.stringify({ version: 1, resources }, null, 2));
regenerateWorker();
console.log(`Offline resource manifest: ${resources.length} required files. Service worker manifest regenerated.`);
