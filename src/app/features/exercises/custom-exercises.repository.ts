import { Injectable, inject } from '@angular/core';
import { Database, StorageFailure, storageFailure } from '../../core/storage/database';
import { OwnedRepository } from '../../core/storage/owned.repository';
import type { UUID } from '../../core/domain/identity';
import type { Draft } from '../../core/storage/draft.model';
import type { CustomExercise, CustomExerciseFormValue } from './exercise.model';
import { validateCustomExercise } from './exercise-catalog.model';

@Injectable({ providedIn: 'root' })
export class CustomExercisesRepository {
  private readonly database = inject(Database);
  private readonly owned = new OwnedRepository(this.database, 'customExercises');
  get(personId: UUID, id: UUID): Promise<CustomExercise | undefined> { return this.owned.get(personId, id); }
  list(personId: UUID): Promise<CustomExercise[]> { return this.owned.list(personId); }

  async save(personId: UUID, id: UUID, input: CustomExerciseFormValue, baseUpdatedAt: string | null, draft: Draft): Promise<void> {
    let value: ReturnType<typeof validateCustomExercise>;
    try { value = validateCustomExercise(input); }
    catch { throw new StorageFailure('invalid', 'Revisa el nombre, la categoría, el tipo de registro y la longitud de los textos.'); }
    if (draft.payload.kind !== 'custom-exercise' || draft.payload.baseUpdatedAt !== baseUpdatedAt ||
      JSON.stringify(draft.payload.value) !== JSON.stringify(input)) {
      throw new StorageFailure('conflict', 'Los valores no corresponden al borrador. Vuelve a abrirlo antes de guardar.');
    }
    await this.write(personId, id, baseUpdatedAt, previous => {
      if (previous?.archived) throw new StorageFailure('invalid', 'Restaura el ejercicio antes de editarlo.');
      return { ...value, archived: false };
    }, draft);
  }
  async setArchived(personId: UUID, exercise: CustomExercise, archived: boolean): Promise<void> {
    if (exercise.personId !== personId) throw new StorageFailure('invalid', 'El ejercicio pertenece a otra persona.');
    await this.write(personId, exercise.id, exercise.updatedAt, previous => {
      if (!previous) throw new StorageFailure('invalid', 'El ejercicio ya no existe.');
      return { name: previous.name, category: previous.category, loggingType: previous.loggingType,
        instruction: previous.instruction, notes: previous.notes, equipment: previous.equipment, archived };
    });
  }
  private async write(personId: UUID, id: UUID, baseUpdatedAt: string | null,
    update: (previous: CustomExercise | undefined) => Pick<CustomExercise, 'name' | 'category' | 'loggingType' | 'instruction' | 'notes' | 'equipment' | 'archived'>, draft?: Draft): Promise<void> {
    const tx = (await this.database.open()).transaction(['settings', 'people', 'customExercises', 'drafts'], 'readwrite');
    try {
      // Serialize context checks with persisted person/mode switches, including other tabs.
      const settings = await tx.objectStore('settings').get('workspace');
      const owner = await tx.objectStore('people').get(personId);
      if (!settings?.mode || settings.activePersonId !== personId || !owner || owner.archived || (settings.mode === 'client' && settings.personalPersonId !== personId)) {
        throw new StorageFailure('invalid', 'La persona activa cambió. Vuelve a su espacio para guardar este borrador.');
      }
      const previous = await tx.objectStore('customExercises').get([personId, id]);
      if ((previous?.updatedAt ?? null) !== baseUpdatedAt) throw new StorageFailure('conflict', 'El ejercicio cambió en otra pestaña. Compara la versión guardada con tu borrador.');
      const value = update(previous);
      if (draft) {
        const stored = await tx.objectStore('drafts').get([personId, draft.id]);
        if (draft.personId !== personId || draft.payload.kind !== 'custom-exercise' || draft.payload.exerciseId !== id ||
          stored?.payload.kind !== 'custom-exercise' || stored.payload.exerciseId !== id || stored.updatedAt !== draft.updatedAt ||
          JSON.stringify(stored.payload) !== JSON.stringify(draft.payload)) {
          throw new StorageFailure('conflict', 'El borrador cambió o no corresponde a este ejercicio. Vuelve a abrirlo antes de guardar.');
        }
        await tx.objectStore('drafts').delete([personId, draft.id]);
      }
      const now = new Date().toISOString();
      const updatedAt = previous && now <= previous.updatedAt ? new Date(Date.parse(previous.updatedAt) + 1).toISOString() : now;
      await tx.objectStore('customExercises').put({ id, personId, createdAt: previous?.createdAt ?? now, updatedAt, ...value });
      await tx.done;
    } catch (error) {
      try { tx.abort(); } catch { /* The transaction may already have aborted. */ }
      await tx.done.catch(() => undefined);
      throw storageFailure(error);
    }
  }
}
