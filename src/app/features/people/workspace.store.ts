import { Injectable, computed, inject, signal } from '@angular/core';
import { PeopleRepository } from './people.repository';
import type { AppMode, AppSettings, Person } from './person.model';
import type { UUID } from '../../core/domain/identity';
import { storageFailure } from '../../core/storage/database';
import { DraftCoordinator } from '../../core/storage/draft-coordinator';

@Injectable({ providedIn: 'root' })
export class WorkspaceStore {
  private readonly repository = inject(PeopleRepository);
  private readonly drafts = inject(DraftCoordinator);
  readonly settings = signal<AppSettings | null>(null);
  readonly people = signal<Person[]>([]);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly ready = signal(false);
  readonly activePerson = computed(() => this.people().find(person => person.id === this.settings()?.activePersonId));
  readonly personalPerson = computed(() => this.people().find(person => person.id === this.settings()?.personalPersonId));
  readonly isTrainer = computed(() => this.settings()?.mode === 'trainer');
  readonly availablePeople = computed(() => this.people().filter(person => !person.archived && (this.isTrainer() || person.kind === 'personal')));

  async refresh(): Promise<void> {
    const snapshot = await this.repository.load();
    this.people.set(snapshot.people);
    this.settings.set(snapshot.settings);
    this.ready.set(true);
  }
  async initialize(): Promise<void> { await this.perform(() => this.refresh()); }
  async perform(action: () => Promise<void>): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    this.error.set('');
    try { await action(); return true; }
    catch (error) { this.error.set(storageFailure(error).message); return false; }
    finally { this.busy.set(false); }
  }
  async changeMode(mode: AppMode): Promise<boolean> {
    if (!await this.drafts.flush()) return false;
    return this.perform(async () => { await this.repository.chooseMode(mode); await this.refresh(); });
  }
  async selectPerson(id: UUID): Promise<boolean> {
    if (!await this.drafts.flush()) return false;
    return this.perform(async () => { await this.repository.selectPerson(id); await this.refresh(); });
  }
  async archive(id: UUID, archived: boolean): Promise<boolean> {
    return this.perform(async () => { await this.repository.setArchived(id, archived); await this.refresh(); });
  }
}
