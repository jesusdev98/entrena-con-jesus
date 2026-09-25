import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { newId, type LocalDate, type UUID } from '../../core/domain/identity';
import { NumericValue } from '../../shared/ui/numeric-value';
import { Button } from '../../shared/ui/button';
import type { SourcedMet } from './met-catalog';
import { linkedBlock, type BlockDraft, type GroupDraft } from './daily-target.model';
import type { TrainingSession } from '../training/training.model';

@Component({ selector: 'app-activity-group-editor', imports: [FormsModule, NumericValue, Button], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="stack" [attr.aria-label]="label()">
    <h3>{{ label() }}</h3>
    @if (group(); as value) {
      <app-numeric-value [fieldId]="key() + '-steps'" [label]="'Pasos incluidos · ' + label()" [value]="value.includedSteps" (changed)="patch({ includedSteps: $event })" />
      @for (block of value.blocks; track block.id; let i = $index) {
        <fieldset class="stack" data-testid="activity-block"><legend>{{ label() }} · bloque {{ i + 1 }}</legend>
           <p>{{ block.linkedTrainingSessionId ? linkedLabel(block.linkedTrainingSessionId) : 'Bloque manual: comprueba que no repite una sesión ni otro bloque.' }}</p>
          <app-numeric-value [fieldId]="block.id + '-minutes'" [label]="'Duración (min) · ' + label() + ' · ' + (i + 1)" [value]="block.minutes" (changed)="replace(block.id, { minutes: $event })" />
          <div class="field"><label [for]="block.id + '-mode'">Método · {{ label() }} · {{ i + 1 }}</label>
            <select [id]="block.id + '-mode'" [ngModel]="block.expenditure.mode" (ngModelChange)="method(block, $event)"><option value="met">Actividad del Compendio</option><option value="manual-net">Gasto neto manual (sobre el basal)</option></select></div>
          @if (block.expenditure.mode === 'met') {
            <div class="field"><label [for]="block.id + '-met'">Actividad MET · {{ label() }} · {{ i + 1 }}</label>
              <select [id]="block.id + '-met'" [ngModel]="block.expenditure.activityId" (ngModelChange)="replace(block.id, { expenditure: { mode: 'met', activityId: $event } })">
                 <option value="">Selecciona una actividad compatible</option>@for (met of choices(); track met.id) { <option [value]="met.id">{{ met.label }} · {{ met.met }} MET</option> }
              </select></div>
             @if (source(block.expenditure.activityId); as met) { <p class="muted">{{ met.table === 'adult' ? 'Adultos' : 'Mayores de 60 años' }} · {{ met.edition }} · referencia {{ met.referenceMlO2PerKgMin }} ml O₂/kg/min. <a [href]="met.source.url" target="_blank" rel="noreferrer">Consultar fuente del Compendio para {{ met.label }}</a></p><small>{{ met.source.description }}</small> }
          } @else {
            <app-numeric-value [fieldId]="block.id + '-net'" [label]="'Gasto neto (kcal) · ' + label() + ' · ' + (i + 1)" [value]="block.expenditure.netKcal" (changed)="net(block, $event)" />
            <div class="field"><label [for]="block.id + '-reason'">Fuente o motivo · {{ label() }} · {{ i + 1 }}</label><input [id]="block.id + '-reason'" [ngModel]="block.expenditure.reason" (ngModelChange)="reason(block, $event)" /></div>
            <p>Introduce solo el gasto adicional sobre el basal, no las calorías brutas del reloj.</p>
          }
          <div class="actions"><button appButton variant="secondary" [disabled]="i === 0" [attr.aria-label]="'Subir ' + label() + ' · ' + (i + 1)" (click)="move(i, -1)">Subir</button>
            <button appButton variant="secondary" [disabled]="i === value.blocks.length - 1" [attr.aria-label]="'Bajar ' + label() + ' · ' + (i + 1)" (click)="move(i, 1)">Bajar</button>
            <button appButton variant="secondary" [attr.aria-label]="'Eliminar ' + label() + ' · ' + (i + 1)" (click)="remove(block.id)">Eliminar</button></div>
        </fieldset>
      }
      <button appButton variant="secondary" (click)="add()">Añadir bloque manual · {{ label() }}</button>
      @if (linkable()) {
        <div class="field"><label [for]="key() + '-session'">Sesión finalizada · {{ label() }}</label><select [id]="key() + '-session'" #session><option value="">Selecciona una sesión</option>
           @for (item of available(); track item.id; let index = $index) { <option [value]="item.id">{{ item.date }} · {{ item.labels.routine }} · {{ item.labels.day }} · {{ item.durationMinutes === null ? 'Duración pendiente' : item.durationMinutes + ' min' }} · sesión {{ index + 1 }}</option> }
        </select></div><button appButton variant="secondary" (click)="link(session.value); session.value = ''">Vincular sesión · {{ label() }}</button>
        <p>No se deduce el MET de RPE, cargas ni repeticiones. Selecciona el tipo real y completa la duración si falta.</p>
      }
      <button appButton variant="secondary" (click)="changed.emit(null)">Dejar sin dato · {{ label() }}</button>
    } @else { <p>Sin dato. {{ actual() ? 'Se utiliza la previsión, si existe.' : 'No se inventa actividad habitual.' }}</p><button appButton variant="secondary" (click)="changed.emit({ blocks: [], includedSteps: null })">Registrar · {{ label() }}</button> }
    <button appButton variant="secondary" (click)="changed.emit({ blocks: [], includedSteps: 0 })">Sin actividad (cero) · {{ label() }}</button>
  </section>`,
  styles: `:host, fieldset { display: block; min-width: 0; } fieldset { border: 1px solid var(--line); border-radius: .75rem; padding: .75rem; } p, small, legend { overflow-wrap: anywhere; } select { width: 100%; min-width: 0; }` })
export class ActivityGroupEditor {
  readonly group = input<GroupDraft | null>(null); readonly label = input.required<string>(); readonly key = input.required<string>();
  readonly choices = input.required<SourcedMet[]>(); readonly actual = input(false); readonly linkable = input(false);
  readonly sessions = input<TrainingSession[]>([]); readonly owner = input.required<UUID>(); readonly date = input.required<LocalDate>();
  readonly changed = output<GroupDraft | null>();
  readonly available = computed(() => this.sessions().filter(session => !this.group()?.blocks.some(block => block.linkedTrainingSessionId === session.id)));
  source(id: string) { return this.choices().find(met => met.id === id); }
  linkedLabel(id: string): string {
    const session = this.sessions().find(item => item.id === id);
    return session ? `Sesión real vinculada: ${session.date} · ${session.labels.routine} · ${session.labels.day}` : 'Sesión real vinculada a este bloque.';
  }
  patch(patch: Partial<GroupDraft>): void { if (this.group()) this.changed.emit({ ...this.group()!, ...patch }); }
  replace(id: string, patch: Partial<BlockDraft>): void { this.patch({ blocks: this.group()!.blocks.map(block => block.id === id ? { ...block, ...patch } : block) }); }
  add(): void { this.patch({ blocks: [...this.group()!.blocks, { id: newId(), minutes: null, expenditure: { mode: 'met', activityId: '' } }] }); }
  remove(id: string): void { this.patch({ blocks: this.group()!.blocks.filter(block => block.id !== id) }); }
  move(index: number, direction: number): void { const blocks = [...this.group()!.blocks]; [blocks[index], blocks[index + direction]] = [blocks[index + direction], blocks[index]]; this.patch({ blocks }); }
  method(block: BlockDraft, mode: 'met' | 'manual-net'): void { this.replace(block.id, { expenditure: mode === 'met' ? { mode, activityId: '' } : { mode, netKcal: null, reason: '' } }); }
  net(block: BlockDraft, netKcal: number | null): void { if (block.expenditure.mode === 'manual-net') this.replace(block.id, { expenditure: { ...block.expenditure, netKcal } }); }
  reason(block: BlockDraft, reason: string): void { if (block.expenditure.mode === 'manual-net') this.replace(block.id, { expenditure: { ...block.expenditure, reason } }); }
  link(id: string): void { const session = this.available().find(item => item.id === id); if (session) this.patch({ blocks: [...this.group()!.blocks, linkedBlock(session, this.owner(), this.date(), this.group()!.blocks)] }); }
}
