import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, OnInit, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { Dialog } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { Button } from '../../../shared/ui/button';
import { storageFailure } from '../../../core/storage/database';
import type { Person } from '../../people/person.model';
import type { CustomFood } from '../nutrition.model';
import type { UUID } from '../../../core/domain/identity';
import { FoodCatalogStore } from './food-catalog.store';
import { CustomFoodsRepository } from './custom-foods.repository';
import { CustomFoodEditor } from './custom-food-editor';
import { FoodPicker } from './food-picker';
import { FoodDetailDialog, type FoodDetailAction } from './food-detail-dialog';
import { catalogChoice, customChoice, type FoodChoice } from './food.model';

@Component({ selector: 'app-person-food-catalog', imports: [ReactiveFormsModule, Button, FoodPicker, CustomFoodEditor],
  changeDetection: ChangeDetectionStrategy.OnPush, template: `<div class="stack">
    <section class="notice" aria-label="Persona del catálogo"><h2>Alimentos personalizados de {{ person().displayName }}</h2>
       <p>{{ person().reference || 'Espacio local' }}</p>
      <button #newButton appButton [disabled]="editor() !== null || loading() || busy()" (click)="editor.set('new')">Añadir alimento personalizado</button>
      <p class="muted">Este botón también recupera el borrador de un alimento nuevo.</p></section>
    @if (message()) { <p role="status">{{ message() }}</p> }
    @if (error()) { <div class="error" role="alert"><p>{{ error() }}</p><button appButton variant="secondary" (click)="loadCustom()">Reintentar lectura de personalizados</button></div> }
    @if (loading()) { <p role="status">Cargando alimentos de esta persona…</p> }
    @for (key of editor() === null ? [] : [editor()]; track key) {
      <app-custom-food-editor [personId]="person().id" [foodId]="key === 'new' ? undefined : asId(key)" (saved)="onSaved()" (closed)="closeEditor()" />
    }
    @if (editor() === null) {
      <div class="field"><label for="food-origin">Origen</label><select id="food-origin" [formControl]="originControl">
        <option value="all">Todos los alimentos activos</option><option value="usda">USDA</option>
        <option value="custom">Personalizados de esta persona</option><option value="archived">Archivados de esta persona</option>
      </select></div>
      @if (catalog.status() === 'loading' || catalog.status() === 'idle') { <p role="status">Cargando catálogo USDA local…</p> }
      @if (catalog.error()) { <div class="error" role="alert"><p>{{ catalog.error() }}</p><button appButton variant="secondary" (click)="catalog.load()">Reintentar catálogo USDA</button></div> }
       @if (canBrowse()) {
         @if ((origin() === 'custom' || origin() === 'archived') && !choices().length) { <p class="notice">{{ origin() === 'archived' ? 'No hay alimentos personalizados archivados. Cambia el origen para explorar USDA.' : 'Todavía no hay alimentos personalizados. Usa «Añadir alimento personalizado» para crear el primero.' }}</p> }
         @for (source of [origin()]; track source) { <app-food-picker [foods]="choices()" (selected)="showDetail($event)" /> }
      }
    }
  </div>`, styles: `:host { display: block; min-width: 0; } .notice p:last-child { margin: .75rem 0 0; } select { max-width: 100%; }` })
export class PersonFoodCatalog implements OnInit {
  readonly person = input.required<Person>();
  protected readonly catalog = inject(FoodCatalogStore);
  private readonly repository = inject(CustomFoodsRepository);
  private readonly dialog = inject(Dialog);
  private readonly destroy = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly newButton = viewChild<ElementRef<HTMLButtonElement>>('newButton');
  readonly foods = signal<CustomFood[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly message = signal('');
  readonly busy = signal(false);
  readonly editor = signal<UUID | 'new' | null>(null);
  readonly originControl = new FormControl('all', { nonNullable: true });
  readonly origin = toSignal(this.originControl.valueChanges, { initialValue: 'all' });
  private owner!: UUID;
  private loadVersion = 0;
  protected readonly canBrowse = computed(() => this.origin() === 'usda' ? this.catalog.status() === 'ready' :
    this.origin() === 'all' ? this.catalog.status() === 'ready' && !this.loading() && !this.error() : !this.loading() && !this.error());
  readonly choices = computed(() => {
    const origin = this.origin();
    const standard = origin === 'all' || origin === 'usda' ? this.catalog.foods().map(catalogChoice) : [];
    const custom = origin === 'usda' ? [] : this.foods().filter(food => !!food.archived === (origin === 'archived')).map(customChoice);
    return [...standard, ...custom];
  });
  ngOnInit(): void { this.owner = this.person().id; void this.loadCustom(); void this.catalog.load(); }
  protected asId(value: UUID | 'new' | null): UUID | undefined { return value && value !== 'new' ? value : undefined; }
  async loadCustom(): Promise<void> {
    const version = ++this.loadVersion;
    this.loading.set(true);
    this.error.set('');
    try { const foods = await this.repository.list(this.owner); if (!this.destroy.destroyed && version === this.loadVersion) this.foods.set(foods); }
    catch (error) { if (version === this.loadVersion) { this.foods.set([]); this.error.set(storageFailure(error).message); } }
    finally { if (version === this.loadVersion) this.loading.set(false); }
  }
  async showDetail(food: FoodChoice): Promise<void> {
    if (this.busy()) return;
    const ref = this.dialog.open<FoodDetailAction>(FoodDetailDialog, { data: food, ariaLabelledBy: 'food-detail-title' });
    const unregister = this.destroy.onDestroy(() => ref.close());
    const action = await firstValueFrom(ref.closed);
    unregister();
    if (this.destroy.destroyed || food.kind !== 'custom' || !action) return;
    if (action === 'edit') { this.editor.set(food.entry.id); return; }
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    try {
      await this.repository.setArchived(this.owner, food.entry, action === 'archive');
      await this.loadCustom();
      this.message.set(action === 'archive' ? 'Alimento archivado. Puedes restaurarlo desde el origen Archivados.' : 'Alimento restaurado.');
      this.focusCreate();
    } catch (error) { this.error.set(storageFailure(error).message); }
    finally { this.busy.set(false); }
  }
  private focusCreate(): void { afterNextRender(() => this.newButton()?.nativeElement.focus(), { injector: this.injector }); }
  closeEditor(): void { this.editor.set(null); this.focusCreate(); }
  async onSaved(): Promise<void> { this.editor.set(null); this.message.set('Alimento guardado en esta persona.'); await this.loadCustom(); this.focusCreate(); }
}
