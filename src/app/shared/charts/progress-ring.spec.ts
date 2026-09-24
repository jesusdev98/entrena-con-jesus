import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ProgressRing } from './progress-ring';

describe('accessible intake ring', () => {
  it('announces zero targets and overflow without nonfinite SVG geometry or hiding excess', () => {
    const fixture = TestBed.createComponent(ProgressRing);
    fixture.componentRef.setInput('label', 'Proteínas (g)');
    fixture.componentRef.setInput('value', 25);
    fixture.componentRef.setInput('target', 0);
    fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('svg') as SVGElement;
    const arc = fixture.nativeElement.querySelectorAll('circle')[1] as SVGCircleElement;
    expect(arc.getAttribute('stroke-dasharray')).toBe('0 100');
    expect(svg.getAttribute('aria-label')).toContain('objetivo cero; exceso: 25');
    fixture.componentRef.setInput('target', 10); fixture.detectChanges();
    expect(arc.getAttribute('stroke-dasharray')).toBe('100 100');
    expect(svg.getAttribute('aria-label')).toContain('exceso: 15');
    fixture.componentRef.setInput('target', Number.NaN); fixture.detectChanges();
    expect(arc.getAttribute('stroke-dasharray')).toBe('0 100');
  });
});
