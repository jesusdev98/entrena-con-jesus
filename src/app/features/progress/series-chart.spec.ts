import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { SeriesChart } from './series-chart';

describe('accessible SVG progress series', () => {
  it('keeps the SVG decorative and exposes titled units, a keyboard-expandable semantic table, gaps and zero', () => {
    const fixture = TestBed.createComponent(SeriesChart);
    fixture.componentRef.setInput('title', 'Proteínas reales'); fixture.componentRef.setInput('unit', 'g');
    fixture.componentRef.setInput('targetLabel', 'Objetivo guardado');
    fixture.componentRef.setInput('points', [
      { label: '2026-01-01', actual: null, target: null },
      { label: '2026-01-02', actual: 0, target: 0 },
      { label: '2026-01-03', actual: 20, target: null },
    ]);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('figure')?.getAttribute('aria-label')).toBe('Proteínas reales, g');
    expect(host.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('summary')?.textContent).toContain('Ver datos de Proteínas reales');
    expect(host.querySelectorAll('th[scope="row"]')).toHaveLength(3);
    expect(host.querySelectorAll('th[scope="col"]')).toHaveLength(3);
    expect(host.querySelector('tbody')?.textContent).toContain('Sin registro');
    expect(host.querySelector('tbody')?.textContent).toContain('Sin objetivo guardado');
    expect(host.querySelector('tbody')?.textContent).toContain('0');
    expect(host.querySelectorAll('circle')).toHaveLength(2);
    expect(host.querySelectorAll('rect')).toHaveLength(1);
  });
});
