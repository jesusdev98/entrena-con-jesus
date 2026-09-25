import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { newId } from '../../core/domain/identity';
import { activityContext } from '../activity/activity.fixtures';
import { calculateActivity, initialActivity, today, type DailyTargetSnapshot } from '../activity/daily-target.model';
import { ProgressExport } from '../pdf/progress-export';
import { emptyProfile } from '../people/person.model';
import { TrainingRepository } from '../training/training.repository';
import { ProgressDataRepository } from './progress-data.repository';
import { PersonProgress } from './person-progress';

describe('person progress chart visibility', () => {
  it('shows saved manual expenditure without actual steps and distinguishes zero from missing data', async () => {
    const profile = emptyProfile(), owner = newId(), date = today();
    const person = { id: owner, kind: 'client' as const, displayName: 'Ana', reference: '', archived: false,
      profile, createdAt: '2026-01-01T12:00:00Z', updatedAt: '2026-01-01T12:00:00Z' };
    const activity = initialActivity(profile);
    activity.mode = 'manual-tdee'; activity.manualKcal = 2100; activity.manualReason = 'Entered by the person';
    const context = activityContext(profile);
    const snapshot: DailyTargetSnapshot = { id: newId(), personId: owner, createdAt: person.createdAt,
      updatedAt: person.createdAt, schemaVersion: 2, version: 1, date, context, activity,
      calculation: calculateActivity(activity, context) };
    TestBed.configureTestingModule({ providers: [provideRouter([]),
      { provide: TrainingRepository, useValue: { list: async () => [] } },
      { provide: ProgressDataRepository, useValue: { read: async () => ({ sessions: [], logs: [], snapshots: [snapshot] }) } },
      { provide: ProgressExport, useValue: { message: signal(''), error: signal(''), busy: signal(false), ready: signal(null) } },
    ] });
    const fixture = TestBed.createComponent(PersonProgress);
    fixture.componentRef.setInput('person', person);
    fixture.detectChanges(); await fixture.componentInstance.load(); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.componentInstance.chart().days.find(day => day.date === date)?.expenditure).toBe(2100);
    expect(host.querySelector('figure[aria-label="Pasos reales por día, pasos"]')).toBeNull();
    const chart = host.querySelector('figure[aria-label="Gasto diario guardado, kcal · origen manual o estimado en la tabla"]');
    expect(chart).not.toBeNull();
    expect(chart?.querySelector('caption')?.textContent).toContain('kcal');
    const row = [...chart!.querySelectorAll('tbody tr')].find(item => item.textContent?.includes(date));
    expect(row?.querySelector('td')?.textContent).toBe('2,100'); expect(row?.textContent).toContain('Manual');
    expect(host.textContent).toContain('No hay pasos reales guardados');

    const zero: DailyTargetSnapshot = { ...snapshot, calculation: { ...snapshot.calculation,
      result: { ...snapshot.calculation.result, expenditure: { ...snapshot.calculation.result.expenditure, expenditureKcal: 0 } } } };
    fixture.componentInstance.chartData.set({ sessions: [], logs: [], snapshots: [zero] }); fixture.detectChanges();
    expect(fixture.componentInstance.hasExpenditure()).toBe(true);
    expect([...host.querySelectorAll('figure[aria-label^="Gasto diario guardado"] tbody tr')]
      .find(item => item.textContent?.includes(date))?.querySelector('td')?.textContent).toBe('0');
    fixture.componentInstance.chartData.set({ sessions: [], logs: [], snapshots: [] }); fixture.detectChanges();
    expect(fixture.componentInstance.hasExpenditure()).toBe(false);
    expect(host.querySelector('figure[aria-label^="Gasto diario guardado"]')).toBeNull();
  });
});
