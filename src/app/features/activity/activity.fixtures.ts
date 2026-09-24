import catalogJson from '../../../../public/catalogs/activity-mets.json';
import { newId } from '../../core/domain/identity';
import { emptyProfile, type PersonProfile } from '../people/person.model';
import { capturedContext, initialActivity, type ActivityDayValue } from './daily-target.model';
import { parseMetCatalog } from './met-catalog';

export const activityCatalog = parseMetCatalog(catalogJson);
export function activityProfile(): PersonProfile {
  return { ...emptyProfile(), age: 30, formulaSex: 'male', weightKg: 80, heightCm: 180,
    usualActivity: { totalSteps: 7600, workMinutes: 240, workActivityCode: '11115', workSteps: 3000,
      trainingMinutes: 60, trainingActivityCode: '02054', trainingSteps: 600, walkingCadence: 100 } };
}
export function activityContext(profile = activityProfile()) {
  return capturedContext({ id: newId(), personId: newId(), profile, createdAt: '2026-01-01T12:00:00Z', updatedAt: '2026-01-01T12:00:00Z' }, activityCatalog);
}
export function actualActivity(): ActivityDayValue {
  const value = initialActivity(activityProfile());
  value.totalSteps.actual = value.totalSteps.forecast;
  value.work.actual = structuredClone(value.work.forecast);
  value.training.actual = structuredClone(value.training.forecast);
  for (const block of [...value.work.actual!.blocks, ...value.training.actual!.blocks]) block.id = newId();
  value.goal = 'loss'; value.adjustmentKcal = 300;
  return value;
}
