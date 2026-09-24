import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { localDate } from '../../core/domain/identity';
import { DraftCoordinator } from '../../core/storage/draft-coordinator';
import { WorkspaceStore } from '../people/workspace.store';
import { ActivityEditor } from './activity-editor';
import { today } from './daily-target.model';

@Component({ selector: 'app-activity-page', imports: [RouterLink, ActivityEditor], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="stack"><header><p class="eyebrow">Actividad y alimentación</p><h1>Actividad diaria y objetivos</h1><p>Estimaciones por persona y fecha local; datos previstos y reales separados.</p><a routerLink="/nutrition">Catálogo de alimentos</a></header>
    <div class="field"><label for="activity-date">Fecha de actividad</label><input id="activity-date" type="date" [value]="date()" #field (change)="selectDate(field)" /></div>
    @if (error()) { <p role="alert">{{ error() }}</p> }
    @for (context of contexts(); track context.key) { <app-activity-editor [person]="context.person" [date]="date()" /> }
  </div>` })
export class ActivityPage {
  private readonly workspace = inject(WorkspaceStore); private readonly coordinator = inject(DraftCoordinator);
  private readonly route = inject(ActivatedRoute); private readonly router = inject(Router);
  readonly date = signal(this.initialDate()); readonly error = signal('');
  readonly contexts = computed(() => { const person = this.workspace.activePerson(); return person ? [{ person, key: `${person.id}:${this.workspace.settings()?.mode}:${this.date()}` }] : []; });
  private initialDate() {
    const requested = this.route.snapshot.queryParamMap.get('date');
    if (!requested) return today();
    try { return localDate(requested); } catch { return today(); }
  }
  async selectDate(field: HTMLInputElement): Promise<void> {
    try { const date = localDate(field.value); if (await this.coordinator.flush()) {
      if (await this.router.navigate([], { relativeTo: this.route, queryParams: { date }, queryParamsHandling: 'merge', replaceUrl: true })) {
        this.date.set(date); this.error.set('');
      } else { field.value = this.date(); this.error.set('No se pudo abrir esta fecha.'); }
    } else { field.value = this.date(); this.error.set('Resuelve el borrador pendiente antes de cambiar de fecha.'); } }
    catch { field.value = this.date(); this.error.set('Selecciona una fecha válida.'); }
  }
}
