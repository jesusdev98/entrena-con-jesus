import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FoodPicker } from './food-picker';
import { FoodDetail } from './food-detail';
import { FoodCatalogStore } from './food-catalog.store';
import { catalogChoice } from './food.model';
import { catalogFixture, foodFixture } from './food.fixtures';

afterEach(() => { vi.unstubAllGlobals(); });
describe('reusable food components', () => {
  it('renders a keyboard button selection and an announced empty filter result', () => {
    const fixture = TestBed.createComponent(FoodPicker);
    const food = catalogChoice(foodFixture());
    fixture.componentRef.setInput('foods', [food]); fixture.detectChanges();
    const selected = vi.fn(); fixture.componentInstance.selected.subscribe(selected);
    const button = fixture.nativeElement.querySelector('article button') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toContain(food.name);
    button.click(); expect(selected).toHaveBeenCalledWith(food);
    fixture.componentInstance.form.controls.query.setValue('inexistente'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=status]').textContent).toContain('0 alimentos');
    expect(fixture.nativeElement.textContent).toContain('No hay alimentos que coincidan');
    expect(fixture.nativeElement.querySelectorAll('article')).toHaveLength(0);
  });
  it('shows provenance and a preview error without inventing consumption', () => {
    const fixture = TestBed.createComponent(FoodDetail);
    fixture.componentRef.setInput('food', catalogChoice(foodFixture())); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('USDA FoodData Central');
    expect(fixture.nativeElement.textContent).toContain('Rice, white, cooked');
    fixture.componentInstance.grams.setValue(150); fixture.detectChanges();
    expect(fixture.componentInstance.scaled()?.kcal).toBe(195);
    fixture.componentInstance.grams.setValue(null); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Introduce una cantidad finita');
    expect(fixture.nativeElement.textContent).toContain('no registra consumo');
  });
  it('associates the visible numeric label with the native input, not its component host', () => {
    const fixture = TestBed.createComponent(FoodDetail);
    fixture.componentRef.setInput('food', catalogChoice(foodFixture())); fixture.detectChanges();
    const label = fixture.nativeElement.querySelector('label') as HTMLLabelElement;
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(label.control).toBe(input);
    expect(fixture.nativeElement.querySelectorAll(`[id="${input.id}"]`)).toHaveLength(1);
  });
});
describe('local catalog loading', () => {
  it('exposes loading, rejects malformed content and permits an explicit retry', async () => {
    let resolve!: (value: Response) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }))
      .mockResolvedValueOnce(new Response(JSON.stringify(catalogFixture())));
    vi.stubGlobal('fetch', fetch);
    const store = TestBed.inject(FoodCatalogStore);
    const request = store.load(); expect(store.status()).toBe('loading');
    resolve(new Response('{"version":2}')); await request;
    expect(store.status()).toBe('error'); expect(store.foods()).toEqual([]); expect(store.error()).toContain('validar');
    await store.load(); expect(store.status()).toBe('ready'); expect(store.foods()).toHaveLength(1);
    expect(fetch.mock.calls[0][0].pathname).toContain('/catalogs/foods.es.json');
  });
  it('does not publish an HTTP failure as an empty catalog', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    const store = TestBed.inject(FoodCatalogStore); await store.load();
    expect(store.status()).toBe('error'); expect(store.error()).not.toBe('');
  });
});
