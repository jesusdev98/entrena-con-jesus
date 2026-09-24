import { describe, expect, it } from 'vitest';
import { localDate, newId } from '../../core/domain/identity';
import { emptyProfile } from '../people/person.model';
import { sessionFixture } from '../training/training.fixtures';
import { actualActivity, activityContext, activityProfile } from './activity.fixtures';
import { calculateActivity, initialActivity, linkedBlock, updatedProfileDefaults } from './daily-target.model';

describe('daily activity adapter uses the existing calculation engine', () => {
  it('produces independently known targets and macro grams with arbitrary signed goals', () => {
    const value = actualActivity(), context = activityContext();
    const result = calculateActivity(value, context);
    expect(result.result.expenditure.expenditureKcal).toBeCloseTo(3019.965432098765, 6);
    expect(result.result.targetKcal).toBeCloseTo(2719.965432098765, 6);
    expect(result.result.macroGrams.protein).toBeCloseTo(169.997839506173, 6);
    value.goal = 'gain'; value.adjustmentKcal = 450;
    expect(calculateActivity(value, context).result.targetKcal).toBeCloseTo(3469.965432098765, 6);
    value.goal = 'maintenance';
    expect(calculateActivity(value, context).input.signedAdjustmentKcal).toBe(0);
  });
  it('replaces a 60-minute forecast with 30 actual minutes, preserving the forecast', () => {
    const value = actualActivity(); value.training.actual!.blocks[0].minutes = 30;
    expect(calculateActivity(value, activityContext()).result.expenditure.expenditureKcal).toBeCloseTo(2899.540246913580, 6);
    expect(value.training.forecast!.blocks[0].minutes).toBe(60);
  });
  it('distinguishes missing from zero and ignores incomplete replaced forecasts', () => {
    const value = initialActivity(emptyProfile());
    expect(() => calculateActivity(value, activityContext())).toThrow(/Completa/);
    value.totalSteps.actual = 0; value.work.actual = { blocks: [], includedSteps: 0 }; value.training.actual = { blocks: [], includedSteps: 0 };
    value.training.forecast = { blocks: [{ id: 'unused', minutes: null, expenditure: { mode: 'met', activityId: '' } }], includedSteps: null };
    const energy = calculateActivity(value, activityContext()).result.expenditure;
    expect(energy.expenditureKcal).toBeCloseTo(2059.591111111111, 6); expect(energy.provisional).toBe(false);
  });
  it('requires missing selected duration and included steps rather than inventing zeros', () => {
    const value = actualActivity(); value.work.actual!.includedSteps = null;
    expect(() => calculateActivity(value, activityContext())).toThrow(/pasos incluidos/);
    value.work.actual!.includedSteps = 0; value.work.actual!.blocks[0].minutes = null;
    expect(() => calculateActivity(value, activityContext())).toThrow(/duración/);
  });
  it.each(['residual', 'allocation', 'budget', 'duplicate'] as const)('rejects invalid %s through the engine', kind => {
    const value = actualActivity();
    if (kind === 'residual') value.totalSteps.actual = 3599;
    if (kind === 'allocation') value.work.actual!.blocks = [];
    if (kind === 'budget') value.work.actual!.blocks[0].minutes = 1400;
    if (kind === 'duplicate') { const block = value.training.actual!.blocks[0]; block.linkedTrainingSessionId = 'stable-session'; value.training.actual!.blocks.push({ ...block, id: 'second' }); }
    expect(() => calculateActivity(value, activityContext())).toThrow();
  });
  it('requires percentages totaling 100 and allows zero-percent macros', () => {
    const value = actualActivity(); value.macros.protein = 30;
    expect(() => calculateActivity(value, activityContext())).toThrow(/100/);
    value.macros = { protein: 0, carbohydrate: 75, fat: 25 };
    expect(calculateActivity(value, activityContext()).result.macroGrams.protein).toBe(0);
  });
  it('supports incomplete/unsupported profiles with explicit full-day manual expenditure', () => {
    const value = initialActivity(emptyProfile()); value.mode = 'manual-tdee'; value.manualKcal = 2100; value.manualReason = 'Valor indicado';
    const result = calculateActivity(value, activityContext(emptyProfile()));
    expect(result.result.expenditure).toMatchObject({ expenditureKcal: 2100, thermicFraction: 0 });
    value.manualReason = ''; expect(() => calculateActivity(value, activityContext())).toThrow(/motivo/);
  });
  it('retains provisional cadence status until an actual walking duration replaces it', () => {
    const value = actualActivity(); expect(calculateActivity(value, activityContext()).result.expenditure.provisional).toBe(true);
    value.walking.actual = { mode: 'duration', minutes: 40, activityId: 'adult:17170' };
    expect(calculateActivity(value, activityContext()).result.expenditure.provisional).toBe(false);
  });
  it('uses the older-adult table and 2.7 oxygen reference without substituting adult codes', () => {
    const profile = { ...activityProfile(), age: 65, weightKg: 70 }, value = actualActivity();
    value.totalSteps.actual = 3000; value.work.actual = { blocks: [], includedSteps: 0 }; value.training.actual = { blocks: [], includedSteps: 0 };
    value.walking.actual = { mode: 'duration', minutes: 30, activityId: 'older-adult:1717060' };
    const energy = calculateActivity(value, activityContext(profile)).result.expenditure;
    if (energy.mode !== 'estimated') throw new Error('Expected estimate');
    expect(energy.blocks[0].grossKcal).toBeCloseTo(127.575, 6); expect(energy.blocks[0].activity?.referenceMlO2PerKgMin).toBe(2.7);
    value.walking.actual.activityId = 'adult:17170'; expect(() => calculateActivity(value, activityContext(profile))).toThrow();
  });
  it('links only completed owner/date sessions by their stable record ID, without inferring minutes', () => {
    const session = { ...sessionFixture(), status: 'completed' as const }, owner = session.personId, date = session.date;
    const block = linkedBlock(session, owner, date, []); expect(block).toMatchObject({ linkedTrainingSessionId: session.id, minutes: null, expenditure: { mode: 'met', activityId: '' } });
    expect(() => linkedBlock(session, owner, date, [block])).toThrow(/ya está/);
    expect(() => linkedBlock(session, newId(), date, [])).toThrow();
    expect(() => linkedBlock(session, owner, localDate('2026-01-02'), [])).toThrow();
    expect(() => linkedBlock({ ...session, status: 'draft' }, owner, date, [])).toThrow();
    expect(linkedBlock({ ...session, durationSource: 'manual', durationMinutes: 42.5 }, owner, date, []).minutes).toBe(42.5);
  });
  it('updates inherited defaults but preserves actuals, daily overrides and detached source context', () => {
    const before = activityProfile(), after = { ...before, weightKg: 90, goal: 'gain' as const, adjustmentKcal: 450, macros: { protein: 30, carbohydrate: 40, fat: 30 } };
    const value = actualActivity(); value.work.forecast!.includedSteps = 999;
    const next = updatedProfileDefaults(value, before, after);
    expect(next.goal).toBe('loss'); expect(next.adjustmentKcal).toBe(300); expect(next.macros).toEqual(after.macros);
    expect(next.work.actual).toEqual(value.work.actual); expect(next.work.forecast!.includedSteps).toBe(999);
    const context = activityContext(before), calculation = calculateActivity(value, context); context.profile.weightKg = 100;
    expect(calculation.input.energy).toMatchObject({ profile: { weightKg: 80 } });
  });
});
