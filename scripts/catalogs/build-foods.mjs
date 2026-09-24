import { writeFile } from 'node:fs/promises';
import { generateFoodCatalog } from './food-data.mjs';

const catalog = await generateFoodCatalog();
const bytes = JSON.stringify(catalog) + '\n';
await writeFile('public/catalogs/foods.es.json', bytes);
console.log(`Built ${catalog.entries.length} foods; ${Buffer.byteLength(bytes)} bytes; cache-only, both source hashes verified.`);
