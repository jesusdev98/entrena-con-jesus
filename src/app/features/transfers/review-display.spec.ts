import { describe, expect, it } from 'vitest';
import { filePersonLabel, reviewLabel, reviewPath, reviewValue } from './review-display';

describe('file review presentation', () => {
  const opaque = '4b17ab1e-e9dd-4834-8c61-01359a93b114';
  it('describes changed fields without leaking identifiers from paths or nested JSON values', () => {
    expect(reviewPath('Plan.content.weeks[1].days[2].id')).toBe('Plan · Contenido · Semana 1 · Día 2 · Referencia interna');
    expect(reviewPath('Plan.name')).toBe('Plan · Nombre');
    expect(reviewValue('Plan.content.weeks[1].days[2].id', JSON.stringify(opaque))).toBe('Referencia interna (oculta)');
    expect(reviewValue('Plan.content', JSON.stringify({ id: opaque, source: { customFoodId: opaque }, name: 'Comida' })))
      .not.toContain(opaque);
    expect(reviewValue('Plan.notes', `"Guardado el ${opaque}"`)).not.toContain(opaque);
    expect(reviewLabel(opaque)).toBe('referencia interna');
    expect(filePersonLabel(opaque)).toBe('Origen sin verificar');
    expect(filePersonLabel('Alex')).toBe('Nombre declarado: Alex · origen sin verificar');
  });
});
