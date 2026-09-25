import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { LocalDate } from '../../core/domain/identity';
import { DraftCoordinator } from '../../core/storage/draft-coordinator';
import { NumericValue } from '../../shared/ui/numeric-value';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import type { Person } from '../people/person.model';
import { harrisBenedict } from '../nutrition/calculations/harris-benedict';
import type { ActivityDayValue, GroupDraft } from './daily-target.model';
import type { WalkingInput } from './energy-input';
import { ActivityEditorStore } from './activity-editor.store';
import { ActivityGroupEditor } from './activity-group-editor';
import { TargetSummary } from './target-summary';

@Component({ selector: 'app-activity-editor', providers: [ActivityEditorStore], imports: [FormsModule, RouterLink, NumericValue, Button, Card, ActivityGroupEditor, TargetSummary],
  changeDetection: ChangeDetectionStrategy.OnPush, templateUrl: './activity-editor.html',
  styles: `:host { display: block; min-width: 0; } fieldset { border: 0; padding: 0; margin: 0; min-width: 0; } pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: .75rem; } .identity, small { overflow-wrap: anywhere; } details { border-top: 1px solid var(--line); padding-top: 1rem; }` })
export class ActivityEditor implements OnInit {
  readonly person = input.required<Person>(); readonly date = input.required<LocalDate>(); readonly store = inject(ActivityEditorStore);
  private readonly coordinator = inject(DraftCoordinator); private readonly destroy = inject(DestroyRef);
  readonly confirmRefresh = signal(false);
  readonly profileError = computed(() => { const context = this.store.draft()?.payload.context; if (!context) return ''; try { harrisBenedict(context.profile); return ''; } catch (error) { return (error as Error).message; } });
  readonly eligible = computed(() => { const context = this.store.draft()?.payload.context; if (!context || this.profileError()) return []; const age = context.profile.age!; return context.catalog.entries.filter(met => met.table === (age >= 60 ? 'older-adult' : 'adult')); });
  readonly workChoices = computed(() => this.eligible().filter(met => met.category === 'work'));
  readonly trainingChoices = computed(() => this.eligible().filter(met => met.category !== 'work'));
  readonly walkingChoices = computed(() => this.eligible().filter(met => met.category === 'walking'));
  readonly groups = [{ key: 'work' as const, label: 'Trabajo' }, { key: 'training' as const, label: 'Entrenamiento' }];
  comparison(value: ActivityDayValue | null | undefined): string[] {
    if (!value) return ['No hay una versión guardada para comparar.'];
    const rows = [`Método: ${value.mode === 'manual-tdee' ? 'Gasto diario manual' : 'Estimación con actividad'}`,
      `Gasto manual: ${value.manualKcal ?? 'Sin indicar'} kcal · Motivo: ${value.manualReason || 'Sin indicar'}`,
      `Pasos reales: ${value.totalSteps.actual ?? 'Sin indicar'} · previstos: ${value.totalSteps.forecast ?? 'Sin indicar'}`];
    for (const [key, title] of [['work', 'Trabajo'], ['training', 'Entrenamiento']] as const) {
      for (const source of ['actual', 'forecast'] as const) {
        const group = value[key][source];
        rows.push(`${title} ${source === 'actual' ? 'real' : 'previsto'}: ${group ? `${group.includedSteps ?? 'Sin indicar'} pasos incluidos · ${group.blocks.length} bloques` : 'Sin dato'}`);
        group?.blocks.forEach((block, index) => {
          const activityId = block.expenditure.mode === 'met' ? block.expenditure.activityId : '';
          const met = this.store.draft()?.payload.context.catalog.entries.find(item => item.id === activityId);
          const session = this.store.sessions().find(item => item.id === block.linkedTrainingSessionId);
          rows.push(`${title} ${source === 'actual' ? 'real' : 'previsto'}, bloque ${index + 1}: ${block.minutes ?? 'Sin duración'} min · ${block.expenditure.mode === 'met' ? met?.label || 'Actividad del Compendio sin elegir' : `Gasto neto ${block.expenditure.netKcal ?? 'Sin indicar'} kcal · ${block.expenditure.reason || 'Sin fuente'}`}${block.linkedTrainingSessionId ? ` · Sesión ${session?.date ?? 'guardada'}: ${session?.labels.routine ?? 'Entrenamiento'}` : ''}`);
        });
      }
    }
    const walk = value.walking.actual ?? value.walking.forecast;
    rows.push(`Caminata: ${walk ? walk.mode === 'cadence' ? `${walk.stepsPerMinute ?? 'Sin indicar'} pasos/min` : `${walk.minutes ?? 'Sin indicar'} min` : 'Sin dato'}`);
    rows.push(`Objetivo: ${value.goal === 'loss' ? 'Déficit' : value.goal === 'gain' ? 'Superávit' : 'Mantenimiento'} · ajuste ${value.adjustmentKcal ?? 'Sin indicar'} kcal`);
    rows.push(`Macronutrientes: proteínas ${value.macros.protein ?? 'Sin indicar'} %, carbohidratos ${value.macros.carbohydrate ?? 'Sin indicar'} %, grasas ${value.macros.fat ?? 'Sin indicar'} %`);
    return rows;
  }
  async ngOnInit(): Promise<void> { this.destroy.onDestroy(this.coordinator.register(() => this.store.flush())); await this.store.initialize(this.person().id, this.date()); }
  patch(patch: Partial<ActivityDayValue>): void { this.store.change({ ...this.store.draft()!.payload.value, ...patch }); }
  steps(source: 'forecast' | 'actual', value: number | null): void { this.patch({ totalSteps: { ...this.store.draft()!.payload.value.totalSteps, [source]: value } }); }
  group(key: 'work' | 'training', source: 'forecast' | 'actual', value: GroupDraft | null): void { this.patch({ [key]: { ...this.store.draft()!.payload.value[key], [source]: value } }); }
  macro(key: 'protein' | 'carbohydrate' | 'fat', value: number | null): void { this.patch({ macros: { ...this.store.draft()!.payload.value.macros, [key]: value } }); }
  walking(): WalkingInput { const values = this.store.draft()!.payload.value.walking; return values.actual ?? values.forecast ?? { mode: 'cadence' }; }
  walk(value: WalkingInput | null): void { this.patch({ walking: { ...this.store.draft()!.payload.value.walking, actual: value } }); }
  walkingMode(mode: 'cadence' | 'duration'): void { const current = this.walking(); this.walk(mode === 'duration' ? { mode, minutes: 0, activityId: current.activityId ?? '' } : { mode, stepsPerMinute: 100, activityId: current.activityId }); }
  walkingId(activityId: string): void { this.walk({ ...this.walking(), activityId }); }
  walkingNumber(value: number | null): void { const current = this.walking(); if (value === null) { this.walk(null); return; } this.walk(current.mode === 'duration' ? { ...current, minutes: value } : { ...current, stepsPerMinute: value }); }
}
