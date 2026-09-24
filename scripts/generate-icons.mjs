import { writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

// Rasterize the original brand's five round strokes without a browser or native dependency.
const strokes = [[176, 256, 336, 256], [160, 204, 160, 308], [208, 224, 208, 288], [304, 224, 304, 288], [352, 204, 352, 308]];
function onStroke(x, y) {
  return strokes.some(([x1, y1, x2, y2]) => {
    const dx = x2 - x1, dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - x1 - t * dx, y - y1 - t * dy) <= 15;
  });
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
for (const size of [192, 512]) {
  const pixels = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let white = 0;
    for (const sy of [0.25, 0.75]) for (const sx of [0.25, 0.75]) {
      if (onStroke((x + sx) * 512 / size, (y + sy) * 512 / size)) white += 0.25;
    }
    const offset = y * (size * 3 + 1) + 1 + x * 3;
    [37, 99, 235].forEach((blue, channel) => { pixels[offset + channel] = Math.round(blue + (255 - blue) * white); });
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  await writeFile(`public/icons/icon-${size}.png`, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0)),
  ]));
  console.log(`Generated original brand icon ${size}×${size}.`);
}
