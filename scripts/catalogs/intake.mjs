import { writeFile } from 'node:fs/promises';
import { download, workoutRoot, foundationUrl, foundationHash, zipMembers } from './sources.mjs';

const exerciseBytes = await download(`${workoutRoot}/packages/workout-guide/manifest.json`, 'workout-manifest.json');
const manifest = JSON.parse(exerciseBytes);
console.log(`Exercise records: ${manifest.length}`);
console.log('Muscles:', [...new Set(manifest.flatMap(item => [item.primaryMuscle, ...item.secondaryMuscles]))].join(', '));
await writeFile('.catalog-cache/exercise-summary.txt', manifest.map(item => `${item.slug}|${item.name}|${item.exerciseType}|${item.primaryMuscle}|${JSON.stringify(item.equipment)}|${item.isStretch}`).join('\n'));
const zip = await download(foundationUrl, 'foundation.zip', foundationHash);
const file = zipMembers(zip).find(member => member.name.endsWith('.json'));
if (!file) throw new Error('Missing Foundation JSON');
await writeFile('.catalog-cache/foundation.json', file.read());
const foods = JSON.parse(file.read()).FoundationFoods;
console.log(`Foundation records: ${foods.length}`);
const summary = foods.filter(Boolean).map(food => {
  const nutrients = new Map(food.foodNutrients.map(row => [row.nutrient.id, row]));
  const energy = [2048, 2047, 1008].map(id => nutrients.get(id)).find(Boolean);
  const values = [energy, nutrients.get(1003), nutrients.get(1005), nutrients.get(1004)];
  return { id: food.fdcId, description: food.description, group: food.foodCategory?.description, valid: values.every(row => row && Number.isFinite(row.amount) && row.amount >= 0), values: values.map(row => row?.amount), moisture: nutrients.get(1051)?.amount };
});
await writeFile('.catalog-cache/food-summary.json', JSON.stringify(summary, null, 2));
await writeFile('.catalog-cache/food-summary.txt', summary.filter(food => food.valid).map(food => `${food.id}|${food.description}|${food.group}|${food.values.join('/')}|moisture=${food.moisture}`).join('\n'));
console.log(`Complete nonnegative foods: ${summary.filter(food => food.valid).length}`);
