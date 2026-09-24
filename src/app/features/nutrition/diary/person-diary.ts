import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { localDate, newId, type LocalDate, type UUID } from '../../../core/domain/identity';
import { storageFailure } from '../../../core/storage/database';
import { DraftCoordinator } from '../../../core/storage/draft-coordinator';
import { ProgressRing } from '../../../shared/charts/progress-ring';
import { Button } from '../../../shared/ui/button';
import { DailyTargetRepository } from '../../activity/daily-target.repository';
import { today, type DailyTargetSnapshot } from '../../activity/daily-target.model';
import { FoodCatalogStore } from '../foods/food-catalog.store';
import { CustomFoodsRepository } from '../foods/custom-foods.repository';
import { catalogChoice, customChoice, filterFoods, foodSnapshot, scaleFood, type FoodChoice } from '../foods/food.model';
import type { FoodLog, FoodSnapshot, MealConsumption, MealPlanRevision, PlannedMeal } from '../nutrition.model';
import { MealPlansRepository } from '../meal-plans/meal-plans.repository';
import { comparison, intake, mondayOf, plannedMealTotal, weekDates } from './diary.model';
import { DiaryRepository, type DiaryDraft } from './diary.repository';
import { ProgressExport, pdfFilename } from '../../pdf/progress-export';

interface MealOption { plan: MealPlanRevision; meal: PlannedMeal; day: string; week: string; key: string }
@Component({ selector: 'app-person-diary', imports: [Button, ProgressRing, DecimalPipe], changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './person-diary.html', styles: `:host { display:block; min-width:0 } :host > .stack { grid-template-columns:minmax(0,1fr) } section { min-width:0 }
    .rings { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.75rem }
    .diary-row { border:1px solid var(--line); padding:1rem; border-radius:1rem; min-width:0; overflow-wrap:anywhere }
    .fields { display:flex; flex-wrap:wrap; gap:1rem; align-items:end } .fields .field { flex:1 1 140px; min-width:0 }
    .fields input,.fields select { width:100%; min-width:0 } .summary-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(145px,1fr)); gap:.75rem }
    .summary-grid p { margin:0 } .scroll-table { overflow-x:auto; min-width:0; max-width:100% } table { width:100%; border-collapse:collapse } th,td { padding:.4rem; text-align:left; border-bottom:1px solid var(--line) }
    .scroll-table table { min-width:460px } .diary-row + .diary-row { margin-top:.5rem }
    @media(min-width:720px) { .rings { grid-template-columns:repeat(4,minmax(0,1fr)) } }` })
export class PersonDiary implements OnInit {
  readonly personId = input.required<UUID>(); readonly name = input.required<string>();
  private readonly repo = inject(DiaryRepository); private readonly targets = inject(DailyTargetRepository);
  readonly pdf = inject(ProgressExport);
  private readonly plansRepo = inject(MealPlansRepository); private readonly customRepo = inject(CustomFoodsRepository);
  protected readonly catalog = inject(FoodCatalogStore); private readonly drafts = inject(DraftCoordinator);
  private readonly destroy = inject(DestroyRef); private readonly route = inject(ActivatedRoute); private readonly router = inject(Router);
  readonly date = signal<LocalDate>(today()); readonly logs = signal<FoodLog[]>([]); readonly receipts = signal<MealConsumption[]>([]);
  readonly target = signal<DailyTargetSnapshot | null>(null); readonly plans = signal<MealPlanRevision[]>([]);
  readonly custom = signal<FoodChoice[]>([]); readonly weekLogs = signal<FoodLog[]>([]);
  readonly weekTargets = signal<(DailyTargetSnapshot | null)[]>([]);
  readonly query = signal(''); readonly chosen = signal<FoodSnapshot | null>(null); readonly grams = signal<number | null>(null);
  readonly mealLabel = signal('Desayuno'); readonly selectedMeal = signal(''); readonly plannedGrams = signal<number[]>([]);
  readonly plannedWeek = signal('');
  readonly editing = signal<FoodLog | null>(null); readonly editGrams = signal<number | null>(null); readonly editLabel = signal('');
  readonly busy = signal(false); readonly loading = signal(true); readonly error = signal(''); readonly message = signal('');
  readonly draftStatus = signal('');
  private durableDraft: DiaryDraft | null = null; private pending: Promise<void> = Promise.resolve(); private epoch = 0;
  private unregister?: () => void;
  readonly totals = computed(() => comparison(this.logs(), this.target()));
  readonly choices = computed(() => filterFoods([
    ...this.catalog.foods().map(catalogChoice), ...this.custom()], { query: this.query(), group: '', preparation: '' }).slice(0, 30));
  readonly chosenInChoices = computed(() => this.choices().some(choice => choice.id === this.chosen()?.foodId));
  readonly options = computed<MealOption[]>(() => this.plans().filter(plan => !plan.archived).flatMap(plan => plan.content.weeks.flatMap(week =>
    week.days.flatMap(day => day.meals.filter(meal => meal.foods.length).map(meal => ({ plan, week: week.name, day: day.name,
      meal, key: `${plan.id}:${meal.id}` }))))));
  readonly selection = computed(() => this.options().find(option => option.key === this.selectedMeal()));
  readonly plannedWeeks = computed(() => this.plans().filter(plan => !plan.archived).flatMap(plan => plan.content.weeks.map(week =>
    ({ key: `${plan.id}:${week.id}`, label: `${plan.name} · ${week.name}`, week }))));
  readonly dates = computed(() => weekDates(mondayOf(this.date())));
  readonly weekly = computed(() => this.dates().map((day, index) => {
    const actual = intake(this.weekLogs().filter(log => log.date === day));
    const saved = this.weekTargets()[index] ?? null;
    const planned = this.plannedWeeks().find(item => item.key === this.plannedWeek())?.week.days[index];
    return { day, actual: actual.kcal, target: saved?.calculation.result.targetKcal ?? null,
      planned: planned ? planned.meals.reduce((sum, meal) => sum + plannedMealTotal(meal).kcal, 0) : null };
  }));
  ngOnInit(): void {
    const param = this.route.snapshot.queryParamMap.get('date');
    try { if (param) this.date.set(localDate(param)); } catch { this.error.set('La fecha del enlace no es válida.'); }
    this.unregister = this.drafts.register(async () => this.flush());
    this.destroy.onDestroy(() => { this.unregister?.(); });
    void this.catalog.load(); void this.load();
  }
  private queueDraft(): void {
    const owner = this.personId(), date = this.date(), epoch = this.epoch;
    const food = this.chosen(), grams = this.grams(), mealLabel = this.mealLabel();
    const edit = this.editing() ? { base: structuredClone(this.editing()!), grams: this.editGrams(), mealLabel: this.editLabel() } : null;
    const needed = !!food || grams !== null || mealLabel !== 'Desayuno' || !!edit;
    this.draftStatus.set('Guardando borrador del diario…');
    this.pending = this.pending.catch(() => undefined).then(async () => {
      if (epoch !== this.epoch) return;
      const previous = this.durableDraft;
      const now = new Date().toISOString();
      const next: DiaryDraft | null = needed ? { id: previous?.id ?? newId(), personId: owner,
        createdAt: previous?.createdAt ?? now, updatedAt: now, editorKey: `food-diary:${date}`,
        payload: { kind: 'food-diary', date, food: food ? structuredClone(food) : null, grams, mealLabel, edit } } : null;
      await this.repo.saveDraft(owner, next, previous, date);
      this.durableDraft = next;
      this.draftStatus.set(next ? 'Borrador del diario guardado.' : 'Borrador del diario retirado.');
    }).catch(error => { this.error.set(storageFailure(error).message); throw error; });
  }
  private async flush(): Promise<boolean> { try { await this.pending; return true; } catch { return false; } }
  choose(value: string): void { this.chosen.set(this.choices().find(item => item.id === value) ? foodSnapshot(this.choices().find(item => item.id === value)!) : null); this.queueDraft(); }
  setGrams(value: string): void { this.grams.set(value === '' ? null : Number(value)); this.queueDraft(); }
  setLabel(value: string): void { this.mealLabel.set(value); this.queueDraft(); }
  async changeDate(value: string): Promise<void> {
    let date: LocalDate;
    try { date = localDate(value); } catch { this.error.set('Selecciona una fecha válida.'); return; }
    if (date === this.date() || !await this.flush()) return;
    this.date.set(date); this.selectedMeal.set(''); this.query.set('');
    await this.router.navigate([], { relativeTo: this.route, queryParams: { date }, queryParamsHandling: 'merge' });
    await this.load();
  }
  async load(): Promise<void> {
    const epoch = ++this.epoch, owner = this.personId(), date = this.date();
    this.loading.set(true); this.error.set('');
    try {
      const dates = weekDates(mondayOf(date));
      const [logs, receipts, target, plans, custom, draft, weekLogs, weekTargets] = await Promise.all([
        this.repo.day(owner, date), this.repo.receipts(owner, date), this.targets.get(owner, date), this.plansRepo.list(owner),
        this.customRepo.list(owner), this.repo.draft(owner, date), this.repo.week(owner, dates), Promise.all(dates.map(day => this.targets.get(owner, day)))]);
      if (this.destroy.destroyed || epoch !== this.epoch) return;
      this.logs.set(logs); this.receipts.set(receipts); this.target.set(target); this.plans.set(plans);
      this.custom.set(custom.filter(item => !item.archived).map(customChoice)); this.weekLogs.set(weekLogs); this.weekTargets.set(weekTargets);
      this.durableDraft = draft; this.chosen.set(draft?.payload.food ?? null); this.grams.set(draft?.payload.grams ?? null);
      this.mealLabel.set(draft?.payload.mealLabel ?? 'Desayuno');
      this.editing.set(draft?.payload.edit?.base ?? null); this.editGrams.set(draft?.payload.edit?.grams ?? null);
      this.editLabel.set(draft?.payload.edit?.mealLabel ?? '');
      this.draftStatus.set(draft ? 'Borrador del diario recuperado.' : '');
    } catch (error) { if (epoch === this.epoch) this.error.set(storageFailure(error).message); }
    finally { if (epoch === this.epoch) this.loading.set(false); }
  }
  async exportPdf(): Promise<void> {
    const owner = this.personId(), date = this.date();
    await this.pdf.run(owner, date, () => this.personId() === owner && this.date() === date,
      pdfFilename('nutricion', this.name(), date), async person => {
        const [logs, target] = await Promise.all([this.repo.day(owner, date), this.targets.get(owner, date)]);
        const { nutritionDocument } = await import('../../pdf/nutrition-document');
        const { renderPdf } = await import('../../pdf/pdf-export');
        return renderPdf(nutritionDocument(person, date, structuredClone(logs), target ? structuredClone(target) : null));
      });
  }
  async add(): Promise<void> {
    if (this.busy() || this.editing() || !await this.flush()) return;
    const food = this.chosen(), grams = this.grams();
    if (!food || grams === null) { this.error.set('Elige un alimento y completa los gramos.'); return; }
    await this.perform(async () => {
      await this.repo.add(this.personId(), this.date(), this.mealLabel(), food, grams, this.durableDraft);
      this.durableDraft = null;
      await this.load(); this.message.set('Alimento registrado en consumo real.');
    });
  }
  selectMeal(key: string): void { this.selectedMeal.set(key); this.plannedGrams.set(this.selection()?.meal.foods.map(item => item.grams) ?? []); }
  consumed(option: MealOption): boolean { return this.receipts().some(item => item.planId === option.plan.planId && item.mealId === option.meal.id); }
  async consume(): Promise<void> {
    const option = this.selection(); if (!option || this.busy()) return;
    await this.perform(async () => {
      const receipt = await this.repo.consume(this.personId(), this.date(), option.plan, option.meal, this.plannedGrams());
      await this.load(); this.message.set(receipt.state === 'undone' ? 'Esta comida ya se deshizo. Añade porciones manuales si necesitas registrarla de nuevo.' : 'Comida marcada como consumida una sola vez.');
    });
  }
  planned(option: MealOption): number { return plannedMealTotal(option.meal).kcal; }
  amount(log: FoodLog): number { return scaleFood(log.food.per100g, log.grams).kcal; }
  startEdit(log: FoodLog): void { this.editing.set(log); this.editGrams.set(log.grams); this.editLabel.set(log.mealLabel); this.queueDraft(); }
  changeEditGrams(value: string): void { this.editGrams.set(value === '' ? null : Number(value)); this.queueDraft(); }
  changeEditLabel(value: string): void { this.editLabel.set(value); this.queueDraft(); }
  cancelEdit(): void { this.editing.set(null); this.queueDraft(); }
  async saveEdit(): Promise<void> {
    const log = this.editing(), grams = this.editGrams(); if (!log || grams === null || !await this.flush()) return;
    await this.perform(async () => { await this.repo.edit(this.personId(), log, grams, this.editLabel(), this.durableDraft); await this.load(); this.message.set('Cantidad real actualizada; el plan no cambió.'); });
  }
  async remove(log: FoodLog): Promise<void> {
    if (!window.confirm(`¿Eliminar ${log.food.name} del consumo real de ${this.date()}?`)) return;
    await this.perform(async () => { await this.repo.remove(this.personId(), log); await this.load(); this.message.set('Registro real eliminado.'); });
  }
  async undo(receipt: MealConsumption): Promise<void> {
    if (!window.confirm('¿Deshacer esta comida consumida? Se eliminarán sus porciones reales vinculadas; el plan seguirá intacto.')) return;
    await this.perform(async () => { await this.repo.undo(this.personId(), receipt); await this.load(); this.message.set('Comida deshecha. El plan sigue disponible.'); });
  }
  private async perform(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    try { await action(); } catch (error) { this.error.set(storageFailure(error).message); }
    finally { this.busy.set(false); }
  }
}
