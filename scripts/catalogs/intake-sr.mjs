import { writeFile } from 'node:fs/promises';
import { download, zipMembers, sha256 } from './sources.mjs';

export function* csvRows(text) {
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted;
    } else if (!quoted && (char === ',' || char === '\n')) {
      row.push(field.replace(/\r$/, '')); field = '';
      if (char === '\n') { yield row; row = []; }
    } else field += char;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); yield row; }
}

export const srUrl = 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip';
const bytes = await download(srUrl, 'sr-legacy.zip');
const members = zipMembers(bytes);
const foodFile = members.find(member => member.name.endsWith('/food.csv') || member.name === 'food.csv');
if (!foodFile) throw new Error('No SR food.csv');
const rows = [...csvRows(foodFile.read().toString())];
const header = rows.shift();
const descriptionIndex = header.indexOf('description'), idIndex = header.indexOf('fdc_id');
const selected = rows.filter(row => /cooked|oil, olive|bread, whole-wheat/i.test(row[descriptionIndex]) && /rice, white, long-grain|rice, brown, long-grain|lentils|chickpeas|beans, black|pasta, cooked|spaghetti, cooked|quinoa, cooked|potatoes, boiled|broccoli, cooked|spinach, cooked|egg, whole, cooked|chicken, broilers.*breast.*roasted|salmon.*cooked|oil, olive|bread, whole-wheat/i.test(row[descriptionIndex]));
await writeFile('.catalog-cache/sr-candidates.txt', selected.map(row => `${row[idIndex]}|${row[descriptionIndex]}`).join('\n'));
await writeFile('.catalog-cache/sr-source.json', JSON.stringify({ url: srUrl, sha256: sha256(bytes), header, members: members.map(member => member.name) }, null, 2));
console.log(`SR archive SHA256: ${sha256(bytes)}; ${selected.length} targeted candidates.`);
