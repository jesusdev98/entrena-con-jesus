await import('./validate-foods.mjs');
const { validateExercises } = await import('./validate-exercises.mjs');
await validateExercises({ built: process.argv.includes('--built') });
const { validateMets } = await import('./validate-mets.mjs');
await validateMets({ built: process.argv.includes('--built') });
console.log('PASS: food, exercise and MET catalog validators all passed.');
