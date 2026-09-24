import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, output, signal, effect } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { UUID } from '../../../core/domain/identity';
import { DraftCoordinator } from '../../../core/storage/draft-coordinator';
import { storageFailure } from '../../../core/storage/database';
import { Button } from '../../../shared/ui/button';
import { NutrientValues } from '../foods/nutrient-values';
import { FoodCatalogStore } from '../foods/food-catalog.store';
import { CustomFoodsRepository } from '../foods/custom-foods.repository';
import { catalogChoice, customChoice } from '../foods/food.model';
import type { CustomFood } from '../nutrition.model';
import { RowActions } from '../../routines/row-actions';
import { MealWeekEditor } from './meal-week-editor';
import { MealEditorStore } from './meal-editor.store';
import { duplicateWeek, editRows, newWeek, previewTotal, type MealPlanWeekDraft, type RowAction } from './meal-planning';

@Component({ selector: 'app-meal-editor', providers: [MealEditorStore], imports: [ReactiveFormsModule, Button, NutrientValues, RowActions, MealWeekEditor],
  changeDetection: ChangeDetectionStrategy.OnPush, template: `<section class="stack" aria-label="Editor de plan de comidas">
    <h2>{{ planId() ? 'Editar plan' : 'Nuevo plan semanal' }}</h2>
    @if (store.loading()) { <p role="status">Cargando borrador del plan…</p> }
    @if (store.error()) { <p class="error" role="alert">{{ store.error() }}</p> }
    @if (store.conflict()) { <div class="notice stack" role="alert"><h3>El plan o borrador cambió</h3>
      <p>Guardado: {{ store.current()?.name || 'Sin plan guardado' }} · {{ store.current()?.id || 'nuevo' }}.
        Otro borrador: {{ store.otherDraft()?.payload?.name || 'ninguno' }}. Compara tus cambios antes de continuar.</p>
      <div class="actions"><button appButton variant="secondary" (click)="store.resolve('current')">Usar versión guardada</button>
        <button appButton variant="secondary" (click)="store.resolve('other')" [disabled]="!store.otherDraft()">Usar otro borrador</button>
        <button appButton variant="secondary" (click)="store.resolve('mine')" [disabled]="!store.current() || !!store.current()?.archived">Conservar mis cambios sobre la versión actual</button>
        <button appButton variant="secondary" (click)="store.resolve('copy')">Guardar mis cambios como copia</button></div></div> }
    @if (!store.loading()) {
      <p role="status">{{ store.status() }}</p>
      <p class="muted">Solo planificación: estas comidas no son consumo real ni aparecen en los gráficos diarios.</p>
      <form [formGroup]="form" class="stack" (submit)="$event.preventDefault(); save()">
        <div class="field"><label for="meal-plan-name">Nombre del plan</label><input id="meal-plan-name" formControlName="name" maxlength="160" /></div>
        <div class="field"><label for="meal-plan-notes">Notas del plan</label><textarea id="meal-plan-notes" formControlName="notes" maxlength="2000"></textarea></div>
        @if (catalog.status() !== 'ready') { <p role="status">{{ catalog.error() || 'Cargando catálogo de alimentos…' }}</p>
          <button type="button" appButton variant="secondary" (click)="loadFoods()">Reintentar alimentos</button> }
        @if (foodError()) { <p role="alert" class="error">{{ foodError() }}</p><button type="button" appButton variant="secondary" (click)="loadFoods()">Reintentar personalizados</button> }
        @for (week of store.value().content.weeks; track week.id; let index = $index) {
          <details class="editor-card" open data-testid="plan-week"><summary>Semana {{ index + 1 }} · {{ week.name || 'Sin nombre' }}</summary>
            <div class="stack"><app-row-actions [label]="'semana ' + (index + 1)" [first]="$first" [last]="$last" (action)="act(week, $event)" />
              <app-meal-week-editor [week]="week" [choices]="choices()" (changed)="replace(week.id, $event)" /></div></details>
        }
        <button type="button" appButton variant="secondary" (click)="weeks([...store.value().content.weeks, newWeek()])">Añadir semana</button>
        <p><strong>Total previsto del plan</strong></p><app-nutrient-values [values]="previewTotal(store.value().content.weeks)" />
        @if (store.errors().length) { <ul role="alert">@for (error of store.errors(); track $index) { <li>{{ error }}</li> }</ul> }
        <div class="actions"><button type="submit" appButton [disabled]="store.saving() || store.conflict()">Guardar plan válido</button>
          <button type="button" appButton variant="secondary" (click)="close()">Cerrar y conservar borrador</button></div>
      </form>
    }
  </section>`, styleUrl: '../../routines/routine-editor.scss' })
export class MealEditor implements OnInit {
  readonly personId = input.required<UUID>(); readonly editorKey = input.required<string>(); readonly planId = input<UUID>();
  readonly saved = output<void>(); readonly closed = output<void>();
  readonly store = inject(MealEditorStore);
  protected readonly catalog = inject(FoodCatalogStore);
  private readonly custom = inject(CustomFoodsRepository);
  private readonly coordinator = inject(DraftCoordinator);
  private readonly destroy = inject(DestroyRef);
  readonly foodError = signal('');
  private readonly customFoods = signal<CustomFood[]>([]);
  readonly choices = computed(() => [...this.catalog.foods().map(catalogChoice), ...this.customFoods().filter(item => !item.archived).map(customChoice)]);
  protected readonly newWeek = newWeek; protected readonly previewTotal = previewTotal;
  readonly form = new FormGroup({ name: new FormControl('', { nonNullable: true }), notes: new FormControl('', { nonNullable: true }) });
  constructor() {
    effect(() => { const value = this.store.value(); this.form.setValue({ name: value.name, notes: value.content.notes }, { emitEvent: false }); });
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      const value = this.form.getRawValue(); this.store.change(value.name, { ...this.store.value().content, notes: value.notes });
    });
  }
  async ngOnInit(): Promise<void> {
    this.destroy.onDestroy(this.coordinator.register(() => this.store.flush()));
    await this.store.initialize(this.personId(), this.editorKey(), this.planId());
    await this.loadFoods();
  }
  async loadFoods(): Promise<void> {
    await this.catalog.load();
    try { this.customFoods.set(await this.custom.list(this.personId())); this.foodError.set(''); }
    catch (error) { this.foodError.set(storageFailure(error).message); }
  }
  protected replace(id: UUID, week: MealPlanWeekDraft): void { this.weeks(this.store.value().content.weeks.map(item => item.id === id ? week : item)); }
  protected act(week: MealPlanWeekDraft, action: RowAction): void { this.weeks(editRows(this.store.value().content.weeks, week.id, action, duplicateWeek)); }
  protected weeks(weeks: MealPlanWeekDraft[]): void { this.store.change(this.form.controls.name.value, { ...this.store.value().content, weeks }); }
  async save(): Promise<void> { if (await this.store.save()) this.saved.emit(); }
  async close(): Promise<void> { if (await this.store.flush()) this.closed.emit(); }
}
