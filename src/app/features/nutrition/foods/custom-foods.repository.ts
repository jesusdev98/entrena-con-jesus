import { Injectable, inject } from '@angular/core';
import { Database, StorageFailure, storageFailure } from '../../../core/storage/database';
import { OwnedRepository } from '../../../core/storage/owned.repository';
import type { UUID } from '../../../core/domain/identity';
import type { Draft } from '../../../core/storage/draft.model';
import type { CustomFood, CustomFoodFormValue } from '../nutrition.model';
import { validateCustomFood } from './food.model';

@Injectable({ providedIn: 'root' })
export class CustomFoodsRepository {
  private readonly database = inject(Database);
  private readonly owned = new OwnedRepository(this.database, 'customFoods');
  get(personId: UUID, id: UUID): Promise<CustomFood | undefined> { return this.owned.get(personId, id); }
  list(personId: UUID): Promise<CustomFood[]> { return this.owned.list(personId); }

  async save(personId: UUID, id: UUID, input: CustomFoodFormValue, baseUpdatedAt: string | null, draft: Draft): Promise<void> {
    let value: ReturnType<typeof validateCustomFood>;
    try { value = validateCustomFood(input); }
    catch { throw new StorageFailure('invalid', 'Revisa el nombre y los cuatro valores por 100 g: deben ser números finitos, iguales o mayores que cero.'); }
    await this.write(personId, id, baseUpdatedAt, previous => {
      if (previous?.archived) throw new StorageFailure('invalid', 'Restaura el alimento antes de editarlo.');
      return { ...value, archived: false };
    }, draft);
  }
  async setArchived(personId: UUID, food: CustomFood, archived: boolean): Promise<void> {
    if (food.personId !== personId) throw new StorageFailure('invalid', 'El alimento pertenece a otra persona.');
    await this.write(personId, food.id, food.updatedAt, previous => {
      if (!previous) throw new StorageFailure('invalid', 'El alimento ya no existe.');
      return { name: previous.name, per100g: previous.per100g, source: previous.source, archived };
    });
  }
  private async write(personId: UUID, id: UUID, baseUpdatedAt: string | null,
    update: (previous: CustomFood | undefined) => Pick<CustomFood, 'name' | 'per100g' | 'source' | 'archived'>, draft?: Draft): Promise<void> {
    const tx = (await this.database.open()).transaction(['settings', 'people', 'customFoods', 'drafts'], 'readwrite');
    try {
      // Serialize context checks with mode/person switches, including switches from another tab.
      const settings = await tx.objectStore('settings').get('workspace');
      const owner = await tx.objectStore('people').get(personId);
      if (!settings?.mode || settings.activePersonId !== personId || !owner || owner.archived || (settings.mode === 'client' && settings.personalPersonId !== personId)) {
        throw new StorageFailure('invalid', 'La persona activa cambió. Vuelve a su espacio para guardar este borrador.');
      }
      const previous = await tx.objectStore('customFoods').get([personId, id]);
      if ((previous?.updatedAt ?? null) !== baseUpdatedAt) throw new StorageFailure('conflict', 'El alimento cambió en otra pestaña. Compara la versión guardada con tu borrador.');
      const value = update(previous);
      if (draft) {
        const stored = await tx.objectStore('drafts').get([personId, draft.id]);
        if (draft.personId !== personId || draft.payload.kind !== 'custom-food' || draft.payload.foodId !== id ||
          stored?.payload.kind !== 'custom-food' || stored.payload.foodId !== id || stored.updatedAt !== draft.updatedAt ||
          JSON.stringify(stored.payload) !== JSON.stringify(draft.payload)) {
          throw new StorageFailure('conflict', 'El borrador cambió o no corresponde a este alimento. Vuelve a abrirlo antes de guardar.');
        }
        await tx.objectStore('drafts').delete([personId, draft.id]);
      }
      const now = new Date().toISOString();
      const updatedAt = previous && now <= previous.updatedAt ? new Date(Date.parse(previous.updatedAt) + 1).toISOString() : now;
      await tx.objectStore('customFoods').put({ id, personId, createdAt: previous?.createdAt ?? now, updatedAt, ...value });
      await tx.done;
    } catch (error) {
      try { tx.abort(); } catch { /* The transaction may already have aborted. */ }
      await tx.done.catch(() => undefined);
      throw storageFailure(error);
    }
  }
}
