import type { PdfDocument, PdfNode } from './routine-document';

export const blue = '#2563EB';
export const graphite = '#111827';
export const pale = '#EFF6FF';
export const number = (value: number): string => new Intl.NumberFormat('es', { maximumFractionDigits: 2 }).format(value);
export function text(value: string, size = 9): PdfNode { return { text: value, fontSize: size, color: '#334155', margin: [0, 3, 0, 4] }; }
export function heading(value: string): PdfNode { return { text: value, fontSize: 12, bold: true, color: blue, margin: [0, 12, 0, 5], headlineLevel: 1 }; }
/** Give unusually long imported names a legal line break inside narrow PDF columns. */
export function label(value: string): string { return value.replace(/\S{35,}/gu, word => word.match(/.{1,30}/gu)?.join(' ') ?? word); }
export function chunks(value: string, label: string): PdfNode[] {
  const words = value.split(/\s+/); const parts: string[] = []; let current = '';
  for (const word of words) {
    // A single unbroken token must also be bounded, or pdfmake can overflow the page.
    for (const piece of word.match(/.{1,55}/gu) ?? []) {
      if (current.length + piece.length > 350 && current) { parts.push(current); current = ''; }
      current += `${current ? ' ' : ''}${piece}`;
    }
  }
  if (current) parts.push(current);
  return parts.map((part, index) => ({ stack: [text(`${label}${index ? ' (continuación)' : ''}: ${part}`)], unbreakable: true }));
}
export function brandedDocument(person: string, title: string, status: string, content: PdfNode[]): PdfDocument {
  return { pageSize: 'A4', pageMargins: [43, 51, 43, 48], defaultStyle: { font: 'Roboto', fontSize: 10, color: graphite },
    pageBreakBefore: (node: { headlineLevel?: number }, followingNodesOnPage: unknown[]) => !!node.headlineLevel && followingNodesOnPage.length === 0,
    info: { title: `${title} · Entrena con Jesús`, author: 'Entrena con Jesús', subject: status },
    background: () => ({ text: 'Entrena con Jesús', color: '#C7D9F4', opacity: 0.13, fontSize: 40, bold: true, absolutePosition: { x: 110, y: 378 }, rotation: -25 }),
    header: () => ({ text: `${person}   /   ${title}   ·   ${status}`, fontSize: 8, color: blue, margin: [43, 22, 43, 0] }),
    footer: (page: number, pages: number) => ({ columns: [{ text: `Entrena con Jesús · ${status}`, color: '#64748B' }, { text: `${page} / ${pages}`, alignment: 'right', color: '#64748B' }], fontSize: 8, margin: [43, 0, 43, 18] }), content };
}
