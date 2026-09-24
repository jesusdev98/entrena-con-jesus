import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { deleteDB } from 'idb';
import { afterEach, describe, expect, it } from 'vitest';
import { Shell } from './shell';
import { Database, DATABASE_NAME } from '../../core/storage/database';
import { newId, type UUID } from '../../core/domain/identity';
import { OfflineStatus } from '../../core/pwa/offline-status';
import { AppUpdates } from '../../core/pwa/app-updates';
import { WorkspaceStore } from '../../features/people/workspace.store';
import { PeopleRepository } from '../../features/people/people.repository';
import { emptyProfile } from '../../features/people/person.model';

describe('trainer selector restoration', () => {
  let database: Database;
  afterEach(async () => { database.close(); await deleteDB(database.name); });

  it('renders the persisted non-first same-name client after Client mode and reload', async () => {
    TestBed.configureTestingModule({
      imports: [Shell],
      providers: [
        provideRouter([]),
        { provide: DATABASE_NAME, useValue: `selector-${newId()}` },
        { provide: OfflineStatus, useValue: { online: signal(true) } },
        { provide: AppUpdates, useValue: { ready: signal(false), error: signal('') } },
      ],
    });
    database = TestBed.inject(Database);
    const workspace = TestBed.inject(WorkspaceStore);
    const people = TestBed.inject(PeopleRepository);
    await workspace.initialize();
    await workspace.changeMode('trainer');
    const firstId = '00000000-0000-4000-8000-000000000001' as UUID;
    const selectedId = 'ffffffff-ffff-4fff-bfff-ffffffffffff' as UUID;
    for (const [id, reference] of [[firstId, 'Morning'], [selectedId, 'Evening']] as const) {
      await people.savePerson(id, { displayName: 'Alex', reference, profile: emptyProfile() }, null);
    }
    await workspace.refresh();
    await workspace.selectPerson(selectedId);
    await workspace.changeMode('client');
    database.close();
    await workspace.refresh();

    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#active-person')).toBeNull();
    await workspace.changeMode('trainer');
    fixture.detectChanges();
    await fixture.whenStable();

    const persisted = (await people.load()).settings;
    expect(persisted.activePersonId).toBe(selectedId);
    expect(persisted.lastTrainerPersonId).toBe(selectedId);
    expect(workspace.activePerson()?.reference).toBe('Evening');
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('#active-person');
    expect(select.options[0].value).toBe(firstId);
    expect(select.value).toBe(selectedId);
    expect(select.selectedOptions[0].textContent).toContain('Evening');
  });
});
