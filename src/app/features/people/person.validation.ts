import { z } from 'zod';
import type { PersonFormValue } from './person.model';
import { StorageFailure } from '../../core/storage/database';

const optionalNumber = (min: number, max: number) => z.number().finite().min(min).max(max).nullable();
export const personFormSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  reference: z.string().trim().max(120),
  profile: z.object({
    age: optionalNumber(1, 120).refine(value => value === null || Number.isInteger(value)),
    formulaSex: z.enum(['male', 'female']).nullable(),
    heightCm: optionalNumber(30, 280), weightKg: optionalNumber(1, 600),
    goal: z.enum(['loss', 'maintenance', 'gain']),
    adjustmentKcal: z.number().finite(),
    macros: z.object({ protein: z.number().min(0).max(100), carbohydrate: z.number().min(0).max(100), fat: z.number().min(0).max(100) })
      .refine(value => Math.abs(value.protein + value.carbohydrate + value.fat - 100) < 0.000001),
    usualActivity: z.object({
      totalSteps: optionalNumber(0, 200000), workMinutes: optionalNumber(0, 1440), workActivityCode: z.string().max(40).nullable(),
      workSteps: optionalNumber(0, 200000), trainingMinutes: optionalNumber(0, 1440), trainingActivityCode: z.string().max(40).nullable(),
      trainingSteps: optionalNumber(0, 200000), walkingCadence: z.number().finite().positive().max(300),
    }),
  }).refine(profile => profile.goal === 'maintenance' ? profile.adjustmentKcal === 0 : profile.adjustmentKcal >= 0),
});

export function validatePerson(value: PersonFormValue): PersonFormValue {
  const result = personFormSchema.safeParse(value);
  if (!result.success) throw new StorageFailure('invalid', 'Revisa los datos: nombre obligatorio, medidas válidas y porcentajes que sumen 100 %.');
  return result.data;
}
