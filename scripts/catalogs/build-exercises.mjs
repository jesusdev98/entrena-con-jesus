import { generateExerciseCatalog, publishExercises, preserveFoodBytes, exerciseStats } from './exercise-data.mjs';

await preserveFoodBytes('.', async () => {
  const result = await generateExerciseCatalog();
  const publication = await publishExercises(result);
  console.log(JSON.stringify({ ...exerciseStats(result), ...publication }, null, 2));
  console.log('PASS: exercise-only generation from local pinned sources; food bytes unchanged.');
});
