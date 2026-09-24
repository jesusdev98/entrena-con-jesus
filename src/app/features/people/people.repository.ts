import { Injectable, inject } from '@angular/core';
import { Database, StorageFailure, storageFailure } from '../../core/storage/database';
import { newId, type UUID } from '../../core/domain/identity';
import { emptyProfile, type AppMode, type AppSettings, type Person, type PersonFormValue } from './person.model';

export interface WorkspaceSnapshot { settings: AppSettings; people: Person[] }

@Injectable({ providedIn: 'root' })
export class PeopleRepository {
  private readonly database = inject(Database);

  async load(): Promise<WorkspaceSnapshot> {
    const tx = (await this.database.open()).transaction(['settings', 'people'], 'readwrite');
    try {
      let settings = await tx.objectStore('settings').get('workspace');
      if (!settings) {
        const id = newId();
        const now = new Date().toISOString();
        settings = { id: 'workspace', workspaceId: newId(), mode: null, personalPersonId: id, activePersonId: id, lastTrainerPersonId: id };
        await tx.objectStore('people').add({ id, kind: 'personal', displayName: 'Mi espacio', reference: '', archived: false, profile: emptyProfile(), createdAt: now, updatedAt: now });
        await tx.objectStore('settings').add(settings);
      }
      const people = await tx.objectStore('people').getAll();
      await tx.done;
      return { settings, people };
    } catch (error) { await tx.done.catch(() => undefined); throw storageFailure(error); }
  }

  async chooseMode(mode: AppMode): Promise<void> {
    const tx = (await this.database.open()).transaction(['settings', 'people'], 'readwrite');
    try {
      const settings = await tx.objectStore('settings').get('workspace');
      if (!settings) throw new StorageFailure('invalid', 'Primero crea tu espacio.');
      const previous = await tx.objectStore('people').get(settings.lastTrainerPersonId);
      settings.mode = mode;
      settings.activePersonId = mode === 'trainer' && previous && !previous.archived ? previous.id : settings.personalPersonId;
      await tx.objectStore('settings').put(settings);
      await tx.done;
    } catch (error) { await tx.done.catch(() => undefined); throw storageFailure(error); }
  }

  async selectPerson(personId: UUID): Promise<void> {
    const tx = (await this.database.open()).transaction(['settings', 'people'], 'readwrite');
    try {
      const settings = await tx.objectStore('settings').get('workspace');
      const person = await tx.objectStore('people').get(personId);
      if (!settings || !person || person.archived || (settings.mode !== 'trainer' && personId !== settings.personalPersonId)) {
        throw new StorageFailure('invalid', 'Esta persona no está disponible en el modo actual.');
      }
      settings.activePersonId = personId;
      if (settings.mode === 'trainer') settings.lastTrainerPersonId = personId;
      await tx.objectStore('settings').put(settings);
      await tx.done;
    } catch (error) { await tx.done.catch(() => undefined); throw storageFailure(error); }
  }

  async savePerson(id: UUID, input: PersonFormValue, baseUpdatedAt: string | null, draft?: { personId: UUID; id: UUID }, onboardingMode?: AppMode): Promise<void> {
    const { validatePerson } = await import('./person.validation');
    const value = validatePerson(input);
    const tx = (await this.database.open()).transaction(['settings', 'people', 'profileRevisions', 'drafts'], 'readwrite');
    try {
      const settings = await tx.objectStore('settings').get('workspace');
      const previous = await tx.objectStore('people').get(id);
      if (!settings || (settings.mode !== 'trainer' && id !== settings.personalPersonId)) throw new StorageFailure('invalid', 'Selecciona el modo Entrenador para gestionar clientes.');
      if ((previous?.updatedAt ?? null) !== baseUpdatedAt) throw new StorageFailure('conflict', 'Este perfil cambió en otra pestaña. El borrador se conserva; vuelve a abrir el perfil para comparar los datos.');
      if (previous?.archived) throw new StorageFailure('invalid', 'Restaura esta persona antes de editarla.');
      const now = new Date().toISOString();
      const updatedAt = previous && now <= previous.updatedAt ? new Date(Date.parse(previous.updatedAt) + 1).toISOString() : now;
      const person: Person = {
        id, kind: previous?.kind ?? 'client', ...value, archived: false,
        createdAt: previous?.createdAt ?? now, updatedAt,
      };
      await tx.objectStore('people').put(person);
      await tx.objectStore('profileRevisions').add({ id: newId(), personId: id, createdAt: now, updatedAt: now, profile: value.profile });
      if (draft) {
        const storedDraft = await tx.objectStore('drafts').get([draft.personId, draft.id]);
        if (storedDraft && (storedDraft.payload.kind !== 'person' || storedDraft.payload.subjectId !== id)) throw new StorageFailure('invalid', 'El borrador no corresponde a este perfil.');
        await tx.objectStore('drafts').delete([draft.personId, draft.id]);
      }
      if (onboardingMode) {
        if (id !== settings.personalPersonId || settings.mode !== null) throw new StorageFailure('invalid', 'La configuración inicial ya está completa.');
        settings.mode = onboardingMode;
        await tx.objectStore('settings').put(settings);
      }
      await tx.done;
    } catch (error) {
      try { tx.abort(); } catch { /* Already aborted by IndexedDB. */ }
      await tx.done.catch(() => undefined);
      throw storageFailure(error);
    }
  }

  async setArchived(id: UUID, archived: boolean): Promise<void> {
    const tx = (await this.database.open()).transaction(['settings', 'people'], 'readwrite');
    try {
      const settings = await tx.objectStore('settings').get('workspace');
      const person = await tx.objectStore('people').get(id);
      if (!settings || settings.mode !== 'trainer' || !person || person.kind === 'personal') throw new StorageFailure('invalid', 'No se puede archivar este espacio.');
      await tx.objectStore('people').put({ ...person, archived, updatedAt: new Date().toISOString() });
      if (archived && settings.activePersonId === id) settings.activePersonId = settings.personalPersonId;
      if (archived && settings.lastTrainerPersonId === id) settings.lastTrainerPersonId = settings.personalPersonId;
      await tx.objectStore('settings').put(settings);
      await tx.done;
    } catch (error) {
      try { tx.abort(); } catch { /* Already aborted. */ }
      await tx.done.catch(() => undefined);
      throw storageFailure(error);
    }
  }
}
