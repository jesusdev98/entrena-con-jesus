import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

export const cacheRoot = '.catalog-cache';
export const workoutRevision = 'aac599224bb9780305239607ef98540b7e0ce389';
export const workoutRoot = `https://raw.githubusercontent.com/bryllim/workout-guide/${workoutRevision}`;
export const foundationUrl = 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2026-04-30.zip';
export const foundationHash = '186e988ec542e913f51ef62b86a47758e8cdd0d1dc3889e7b055581f3c09c77a';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export async function download(url, name, expectedHash) {
  await mkdir(cacheRoot, { recursive: true });
  const path = `${cacheRoot}/${name}`;
  let bytes;
  try { bytes = await readFile(path); } catch {
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`${response.status}: ${url}`);
    bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(path, bytes);
  }
  if (expectedHash && sha256(bytes) !== expectedHash) throw new Error(`Checksum mismatch: ${name}`);
  return bytes;
}

// Read selected ZIP members directly; never extract archive-controlled filesystem paths.
export function zipMembers(bytes) {
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('Missing ZIP directory');
  let offset = bytes.readUInt32LE(end + 16);
  const members = [];
  for (let i = 0; i < bytes.readUInt16LE(end + 10); i++) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid ZIP member');
    const method = bytes.readUInt16LE(offset + 10), size = bytes.readUInt32LE(offset + 20);
    const nameLength = bytes.readUInt16LE(offset + 28), extraLength = bytes.readUInt16LE(offset + 30), commentLength = bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    const name = bytes.toString('utf8', offset + 46, offset + 46 + nameLength);
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    members.push({ name, read: () => {
      const compressed = bytes.subarray(start, start + size);
      if (method === 0) return compressed;
      if (method === 8) return inflateRawSync(compressed);
      throw new Error(`Unsupported ZIP compression: ${method}`);
    } });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return members;
}

export async function pooled(items, concurrency, action) {
  let index = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (index < items.length) { const current = index++; await action(items[current], current); }
  }));
}
