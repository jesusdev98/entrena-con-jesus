import catalogJson from '../../../../../public/catalogs/activity-mets.json';
import foodsJson from '../../../../../public/catalogs/foods.es.json';
import type { ActivityGroup, EnergyBlock, EstimatedEnergyInput } from '../../activity/energy-input';
import { parseMetCatalog } from '../../activity/met-catalog';
import { CalculationError } from './calculation-error';
import { calculateDailyTargets, type DailyCalculationInput } from './daily-calculation';
import { dailyExpenditure, metBlockEnergy, selectDailyValue, type EstimatedExpenditure } from './daily-expenditure';
import { harrisBenedict, type EnergyProfile } from './harris-benedict';
import { calorieTarget, macroTargets, sumFoodPortions, targetProgress } from './macro-targets';

const catalog = parseMetCatalog(catalogJson);
const male: EnergyProfile = { age: 30, formulaSex: 'male', weightKg: 80, heightCm: 180 };
const female: EnergyProfile = { age: 40, formulaSex: 'female', weightKg: 60, heightCm: 165 };
const percentages = { protein: 25, carbohydrate: 50, fat: 25 };
const empty = (): ActivityGroup => ({ blocks: [], includedSteps: 0 });
const block = (id = 'work', minutes = 240, activityId = 'adult:11115'): EnergyBlock => ({ id, minutes, expenditure: { mode: 'met', activityId } });
function day(): EstimatedEnergyInput {
  return { mode: 'estimated', profile: { ...male }, totalSteps: { actual: 7600 },
    work: { actual: { blocks: [block()], includedSteps: 3000 } },
    training: { forecast: { blocks: [{ ...block('training', 60, 'adult:02054'), linkedTrainingSessionId: 'session-1' }], includedSteps: 600 } } };
}
function rest(): EstimatedEnergyInput {
  return { mode: 'estimated', profile: { ...male }, totalSteps: { actual: 0 }, work: { actual: empty() }, training: { actual: empty() } };
}
const estimate = (input = day()) => dailyExpenditure(input, catalog) as EstimatedExpenditure;
const close = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1e-6);
function rejects(action: () => unknown, code: CalculationError['code']) {
  expect(action).toThrow(CalculationError);
  try { action(); } catch (error) { expect((error as CalculationError).code).toBe(code); }
}

describe('independent energy and macro arithmetic (1e-6 numerical tolerance)', () => {
  it('uses both revised 1984 branches, kg/cm/years', () => {
    close(harrisBenedict(male), 1853.632);
    close(harrisBenedict(female), 1340.383);
  });
  it('adds net work/training/residual walking, then the fixed thermic approximation', () => {
    const result = estimate();
    close(result.netActivityKcal, 864.336888888889);
    close(result.expenditureKcal, 3019.965432098765);
    expect(result.residualSteps).toBe(4000);
    expect(result.walking).toEqual({ minutes: 40, stepsPerMinute: 100, activityId: 'adult:17170', method: 'cadence' });
    expect(result.totalMinutes).toBe(340);
    expect(result.timing).toEqual({ assumption: 'distinct-durations', checkedIntervals: 0, coverage: 'none' });
    expect(result.blocks.map(item => item.grossKcal)).toEqual([840, 294, 168]);
    expect(result.blocks[1].linkedTrainingSessionId).toBe('session-1');
    expect(result.provisional).toBe(true);
  });
  it('supports maintenance and freely editable deficit/surplus, preserving precision', () => {
    const tdee = estimate().expenditureKcal;
    close(calorieTarget(tdee, -300), 2719.965432098765);
    close(calorieTarget(tdee, 450), 3469.965432098765);
    expect(calorieTarget(tdee, 0)).toBe(tdee);
    close(calorieTarget(tdee, -317.125), 2702.840432098765);
    const grams = macroTargets(calorieTarget(tdee, -300), percentages);
    close(grams.protein, 169.997839506173);
    close(grams.carbohydrate, 339.995679012346);
    close(grams.fat, 75.554595336077);
  });
  it('replaces a 60-minute training forecast with 30 actual minutes, not 90', () => {
    const input = day();
    input.training.actual = { ...input.training.forecast!, blocks: [{ ...input.training.forecast!.blocks[0], minutes: 30 }] };
    close(estimate(input).expenditureKcal, 2899.540246913580);
    expect(estimate(input).blocks.filter(item => item.kind === 'training')).toHaveLength(1);
  });
  it('handles explicit rest without a catalog or invented activity', () => {
    const result = dailyExpenditure(rest()) as EstimatedExpenditure;
    close(result.expenditureKcal, 2059.591111111111);
    expect(result.netActivityKcal).toBe(0);
    expect(result.provisional).toBe(false);
  });
  it('uses MET60+ 2.7, never the adult 3.5 conversion', () => {
    const activity = catalog.entries.find(entry => entry.id === 'older-adult:1717060')!;
    const result = metBlockEnergy(activity, 70, 30, 1500);
    expect(activity.met).toBe(4.5);
    close(result.grossKcal, 127.575);
    expect(result.grossKcal).not.toBeCloseTo(165.375, 6);
    close(result.netKcal, 96.325);
  });
  it('retains source food kcal independently from 4/4/9', () => {
    const food = (id: string) => foodsJson.entries.find(entry => entry.source.fdcId === id)!.per100g;
    const result = sumFoodPortions([{ grams: 37.5, per100g: food('2512381') }, { grams: 175, per100g: food('2646170') }]);
    close(result.kcal, 334.75); close(result.protein, 42.015); close(result.carbohydrate, 30.1125); close(result.fat, 3.76375);
    expect(result.kcal).not.toBeCloseTo(result.protein * 4 + result.carbohydrate * 4 + result.fat * 9, 6);
  });
});

describe('eligibility and finite arithmetic', () => {
  it.each(['age', 'formulaSex', 'weightKg', 'heightCm'] as const)('reports missing %s and the manual path', field => {
    rejects(() => harrisBenedict({ ...male, [field]: null }), 'missing-profile');
  });
  it.each([NaN, Infinity, -Infinity, -1, 0])('rejects invalid profile numbers: %s', value => {
    for (const field of ['age', 'heightCm', 'weightKg']) rejects(() => harrisBenedict({ ...male, [field]: value }), 'invalid-number');
  });
  it('rejects unsupported age, formula sex and explicitly unsupported profiles', () => {
    rejects(() => harrisBenedict({ ...male, age: 18 }), 'unsupported-profile');
    rejects(() => harrisBenedict({ ...male, formulaSex: 'other' } as unknown as EnergyProfile), 'unsupported-profile');
    rejects(() => harrisBenedict({ ...male, estimationScope: 'manual-only' }), 'unsupported-profile');
    expect(harrisBenedict({ ...male, age: 19 })).toBeGreaterThan(0);
  });
  it('rejects nonpositive calculated BMR and overflow', () => {
    rejects(() => harrisBenedict({ ...male, age: 10000 }), 'invalid-number');
    rejects(() => harrisBenedict({ ...male, weightKg: Number.MAX_VALUE }), 'invalid-number');
  });
  it('provides a full manual TDEE without requiring a profile or applying thermogenesis again', () => {
    const result = calculateDailyTargets({ energy: { mode: 'manual-tdee', expenditureKcal: 2100, reason: 'Estimación profesional' }, signedAdjustmentKcal: -125.5, macroPercentages: percentages });
    expect(result.result.expenditure).toMatchObject({ expenditureKcal: 2100, thermicFraction: 0 });
    expect(result.result.targetKcal).toBe(1974.5);
  });
  it('supports manual NET block expenditure with explicit basis and duration', () => {
    const input = rest();
    input.work.actual = { blocks: [{ id: 'manual', minutes: 60, expenditure: { mode: 'manual-net', netKcal: 100, reason: 'Actividad no incluida' } }], includedSteps: 0 };
    const result = dailyExpenditure(input) as EstimatedExpenditure;
    close(result.expenditureKcal, 2170.702222222222);
    expect(result.blocks[0]).toMatchObject({ grossKcal: null, netKcal: 100, activity: null, manualReason: 'Actividad no incluida' });
  });
  it('requires a reason and valid numbers for both manual paths', () => {
    rejects(() => dailyExpenditure({ mode: 'manual-tdee', expenditureKcal: 0, reason: 'x' }), 'invalid-number');
    rejects(() => dailyExpenditure({ mode: 'manual-tdee', expenditureKcal: 2000, reason: ' ' }), 'invalid-input');
    const input = rest();
    input.work.actual!.blocks = [{ id: 'x', minutes: 0, expenditure: { mode: 'manual-net', netKcal: 1, reason: 'x' } }];
    rejects(() => estimate(input), 'invalid-duration');
    input.work.actual!.blocks[0].minutes = 10;
    input.work.actual!.blocks[0].expenditure = { mode: 'manual-net', netKcal: -1, reason: 'x' };
    rejects(() => estimate(input), 'invalid-number');
  });
});

describe('forecast replacement, steps and duration accounting', () => {
  it('distinguishes missing, null, zero and empty actuals', () => {
    expect(selectDailyValue({})).toEqual({ status: 'missing' });
    expect(selectDailyValue({ forecast: 500, actual: null })).toEqual({ status: 'forecast', value: 500 });
    expect(selectDailyValue({ forecast: 500, actual: 0 })).toEqual({ status: 'actual', value: 0 });
    expect(selectDailyValue({ forecast: [block()], actual: [] })).toEqual({ status: 'actual', value: [] });
    const input = rest(); input.training.forecast = { blocks: [block('training')], includedSteps: 0 };
    expect(estimate(input).blocks).toEqual([]);
  });
  it.each(['totalSteps', 'work', 'training'] as const)('does not substitute zero for missing %s', field => {
    rejects(() => estimate({ ...rest(), [field]: {} }), 'missing-activity');
  });
  it('selects each whole actual group, discarding forecast blocks and steps', () => {
    const input = day(); input.work.forecast = { blocks: [block('ignored', -1)], includedSteps: 99999 };
    expect(estimate(input).residualSteps).toBe(4000);
    input.training.actual = empty();
    expect(estimate(input).residualSteps).toBe(4600);
  });
  it('rejects negative residuals instead of clamping', () => {
    const input = day(); input.totalSteps.actual = 100;
    rejects(() => estimate(input), 'invalid-steps');
  });
  it.each(['work', 'training'] as const)('requires a positive-duration %s block for allocated steps', field => {
    const input = rest(); input.totalSteps.actual = 50;
    input[field].actual = { blocks: [], includedSteps: 50 };
    rejects(() => estimate(input), 'invalid-steps');
    input[field].actual!.blocks = [block('zero', 0)];
    rejects(() => estimate(input), 'invalid-steps');
  });
  it.each([NaN, Infinity, -1])('rejects invalid steps, allocations, duration and cadence: %s', value => {
    const steps = rest(); steps.totalSteps.actual = value; rejects(() => estimate(steps), 'invalid-number');
    const allocation = day(); allocation.work.actual!.includedSteps = value; rejects(() => estimate(allocation), 'invalid-number');
    const duration = day(); duration.work.actual!.blocks[0].minutes = value; rejects(() => estimate(duration), 'invalid-number');
    const cadence = day(); cadence.walking = { actual: { mode: 'cadence', stepsPerMinute: value } }; rejects(() => estimate(cadence), 'invalid-number');
  });
  it('uses adjustable cadence without inferring a new MET intensity', () => {
    const input = day(); input.walking = { actual: { mode: 'cadence', stepsPerMinute: 80 } };
    const result = estimate(input);
    expect(result.walking.minutes).toBe(50);
    expect(result.blocks[2].activity!.met).toBe(3);
    rejects(() => estimate({ ...input, walking: { actual: { mode: 'cadence', stepsPerMinute: 0 } } }), 'invalid-number');
  });
  it('lets actual walking duration and a sourced pace replace cadence/forecast', () => {
    const input = day();
    input.training.actual = input.training.forecast;
    input.walking = { forecast: { mode: 'cadence', stepsPerMinute: 100 }, actual: { mode: 'duration', minutes: 50, activityId: 'adult:17190' } };
    const result = estimate(input);
    expect(result.walking).toMatchObject({ minutes: 50, stepsPerMinute: null, activityId: 'adult:17190', method: 'duration' });
    expect(result.blocks[2].grossKcal).toBe(266);
    expect(result.provisional).toBe(false);
  });
  it('rejects nonwalking codes and contradictory duration/step inputs', () => {
    rejects(() => estimate({ ...day(), walking: { actual: { mode: 'duration', minutes: 40, activityId: 'adult:02054' } } }), 'invalid-input');
    rejects(() => estimate({ ...rest(), walking: { actual: { mode: 'duration', minutes: 30, activityId: 'adult:17170' } } }), 'invalid-steps');
    rejects(() => estimate({ ...day(), walking: { actual: { mode: 'duration', minutes: 0, activityId: 'adult:17170' } } }), 'invalid-steps');
  });
  it('rejects duplicate block IDs and linked sessions, including zero-duration duplicates', () => {
    const duplicate = day(); duplicate.training.forecast!.blocks[0].id = 'work';
    rejects(() => estimate(duplicate), 'duplicate-activity');
    const linked = day(); linked.training.forecast!.blocks.push({ ...linked.training.forecast!.blocks[0], id: 'another', minutes: 0 });
    rejects(() => estimate(linked), 'duplicate-activity');
    const work = day(); work.work.actual!.blocks[0].linkedTrainingSessionId = 'session-1';
    rejects(() => estimate(work), 'duplicate-activity');
  });
  it('accepts exactly 1440 minutes and rejects excess including residual walking', () => {
    const input = rest(); input.work.actual!.blocks = [block('work', 1440)];
    expect(estimate(input).totalMinutes).toBe(1440);
    input.totalSteps.actual = 1;
    rejects(() => estimate(input), 'invalid-duration');
    input.totalSteps.actual = 0; input.work.actual!.blocks[0].minutes = 1441;
    rejects(() => estimate(input), 'invalid-duration');
  });
  it('checks supplied clock intervals across kinds, allowing adjacent boundaries', () => {
    const input = day();
    input.work.actual!.blocks[0].interval = { startMinute: 0, endMinute: 240 };
    input.training.forecast!.blocks[0].interval = { startMinute: 240, endMinute: 300 };
    expect(estimate(input).timing.coverage).toBe('partial');
    input.walking = { actual: { mode: 'duration', minutes: 40, activityId: 'adult:17170', interval: { startMinute: 300, endMinute: 340 } } };
    expect(estimate(input).timing).toMatchObject({ checkedIntervals: 3, coverage: 'complete' });
    input.training.forecast!.blocks[0].interval = { startMinute: 230, endMinute: 290 };
    rejects(() => estimate(input), 'clock-overlap');
  });
  it.each([{ startMinute: -1, endMinute: 239 }, { startMinute: 0, endMinute: 241 }, { startMinute: 1300, endMinute: 1540 }, { startMinute: 100, endMinute: 50 }, { startMinute: NaN, endMinute: 240 }])('rejects invalid interval %j', interval => {
    const input = day(); input.work.actual!.blocks[0].interval = interval;
    expect(() => estimate(input)).toThrow(CalculationError);
  });
  it('floors only a negative NET addition, not the input steps or goal', () => {
    const activity = catalog.entries.find(entry => entry.id === 'adult:11582')!;
    expect(metBlockEnergy(activity, 80, 60, 5000).netKcal).toBe(0);
  });
});

describe('catalog eligibility and immutable calculation payloads', () => {
  it('requires manual selection for an unknown code, missing catalog or inappropriate table', () => {
    const input = day(); input.work.actual!.blocks[0].expenditure = { mode: 'met', activityId: 'adult:99999' };
    rejects(() => estimate(input), 'manual-required');
    rejects(() => dailyExpenditure(day()), 'manual-required');
    const older = rest(); older.profile.age = 60; older.totalSteps.actual = 3000;
    rejects(() => estimate(older), 'manual-required');
    older.walking = { actual: { mode: 'duration', minutes: 30, activityId: 'adult:17170' } };
    rejects(() => estimate(older), 'manual-required');
    older.walking.actual = { mode: 'duration', minutes: 30, activityId: 'older-adult:1717060' };
    expect(estimate(older).blocks[0].activity!.referenceMlO2PerKgMin).toBe(2.7);
    older.profile.age = 59;
    rejects(() => estimate(older), 'manual-required');
  });
  it.each(['reference', 'source', 'code', 'met', 'duplicate', 'table', 'edition'] as const)('rejects corrupt catalog %s', mutation => {
    const data = structuredClone(catalog);
    switch (mutation) {
      case 'reference': data.entries[0].referenceMlO2PerKgMin = 2.7; break;
      case 'source': data.entries[0].source.sha256 = ''; break;
      case 'code': data.entries[0].code = '111'; break;
      case 'met': data.entries[0].met = NaN; break;
      case 'duplicate': data.entries.push(data.entries[0]); break;
      case 'table': data.entries[0].table = 'older-adult'; break;
      case 'edition': (data.entries[0] as { edition: string }).edition = '2011'; break;
    }
    rejects(() => parseMetCatalog(data), 'invalid-catalog');
  });
  it('captures detached input/results and complete source/formula versions for later history', () => {
    const input: DailyCalculationInput = { energy: day(), signedAdjustmentKcal: -300, macroPercentages: { ...percentages } };
    const snapshot = calculateDailyTargets(input, catalog);
    expect(Object.isFrozen(input)).toBe(false);
    (input.energy as EstimatedEnergyInput).profile.weightKg = 90;
    (input.energy as EstimatedEnergyInput).training.forecast!.blocks[0].minutes = 90;
    input.macroPercentages.protein = 30;
    close(snapshot.result.targetKcal, 2719.965432098765);
    expect((snapshot.input.energy as EstimatedEnergyInput).profile.weightKg).toBe(80);
    expect(Object.isFrozen(snapshot.input.macroPercentages)).toBe(true);
    expect(Object.isFrozen(snapshot.result.expenditure)).toBe(true);
    const result = snapshot.result.expenditure as EstimatedExpenditure;
    expect(result.version).toBe('revised-hb-1984-net-met-v1');
    expect(result.blocks[0].activity).toMatchObject({ table: 'adult', code: '11115', edition: '2024', referenceMlO2PerKgMin: 3.5 });
    expect(result.blocks[0].activity!.source.sha256).toHaveLength(64);
    expect(result.blocks[0].activity!.source.url).toBe('https://pacompendium.com/occupation/');
    expect(Object.isFrozen(result.blocks[0].activity!.source)).toBe(true);
  });
});

describe('goals, zero macro targets and intake excess', () => {
  it.each([-2000, -2100])('rejects nonpositive targets without a dietary clamp: %s', offset => {
    rejects(() => calorieTarget(2000, offset), 'invalid-target');
  });
  it.each([NaN, Infinity, -Infinity])('rejects invalid offsets and percentages: %s', value => {
    rejects(() => calorieTarget(2000, value), 'invalid-number');
    rejects(() => macroTargets(2000, { ...percentages, protein: value }), 'invalid-number');
  });
  it('rejects percentages below zero or totals other than 100, accepting decimals', () => {
    rejects(() => macroTargets(2000, { protein: -1, carbohydrate: 76, fat: 25 }), 'invalid-number');
    rejects(() => macroTargets(2000, { protein: 25, carbohydrate: 49, fat: 25 }), 'invalid-macros');
    rejects(() => macroTargets(0, percentages), 'invalid-number');
    close(macroTargets(2000, { protein: 33.3, carbohydrate: 33.3, fat: 33.4 }).protein, 166.5);
  });
  it('supports zero-percent targets without NaN/Infinity and retains excess separately', () => {
    expect(macroTargets(2000, { protein: 0, carbohydrate: 100, fat: 0 })).toEqual({ protein: 0, carbohydrate: 500, fat: 0 });
    expect(targetProgress(0, 0)).toEqual({ remaining: 0, excess: 0, signedRemaining: 0, ratio: null, ringFraction: 0 });
    expect(targetProgress(0, 15)).toEqual({ remaining: 0, excess: 15, signedRemaining: -15, ratio: null, ringFraction: 1 });
    expect(targetProgress(100, 125)).toEqual({ remaining: 0, excess: 25, signedRemaining: -25, ratio: 1.25, ringFraction: 1 });
    expect(targetProgress(100, 25)).toMatchObject({ remaining: 75, excess: 0, ringFraction: 0.25 });
    expect(targetProgress(Number.MIN_VALUE, Number.MAX_VALUE).ratio).toBeNull();
  });
  it('handles empty/zero food portions and rejects negative/nonfinite nutrients or overflow', () => {
    const nutrients = { kcal: 100, protein: 10, carbohydrate: 10, fat: 1 };
    expect(sumFoodPortions([])).toEqual({ kcal: 0, protein: 0, carbohydrate: 0, fat: 0 });
    expect(sumFoodPortions([{ per100g: nutrients, grams: 0 }]).kcal).toBe(0);
    rejects(() => sumFoodPortions([{ per100g: nutrients, grams: -1 }]), 'invalid-number');
    rejects(() => sumFoodPortions([{ per100g: { ...nutrients, kcal: NaN }, grams: 10 }]), 'invalid-number');
    rejects(() => sumFoodPortions([{ per100g: { ...nutrients, kcal: Number.MAX_VALUE }, grams: 1000 }]), 'invalid-number');
    rejects(() => targetProgress(-1, 10), 'invalid-number');
  });
});
