import type { RoutineRevision } from '../routines/routine.model';
import type { Person } from '../people/person.model';
import { routineDocument, selectedArtwork, type PdfDocument, type RoutineArtwork } from './routine-document';

function localUrl(path: string): string { return new URL(path, document.baseURI).toString(); }
async function artworkFor(revision: RoutineRevision): Promise<RoutineArtwork[]> {
  const frames = selectedArtwork(revision);
  if (!frames.length) return [];
  const catalogResponse = await fetch(localUrl('catalogs/exercises.es.json'));
  if (!catalogResponse.ok) throw new Error('El catálogo local de ilustraciones no está disponible.');
  const catalog: { entries: { id: string; media: { frames: { path: string; sha256: string }[] } }[] } = await catalogResponse.json();
  const published = new Map(catalog.entries.flatMap(entry => entry.media.frames.map(frame => [frame.path, frame.sha256] as const)));
  return Promise.all(frames.map(async frame => {
    if (published.get(frame.path) !== frame.sha256) throw new Error('La ilustración no pertenece al catálogo publicado.');
    const response = await fetch(localUrl(frame.path));
    if (!response.ok || !response.headers.get('content-type')?.includes('image/svg+xml')) throw new Error('No se pudo cargar una ilustración local.');
    const buffer = await response.arrayBuffer();
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(n => n.toString(16).padStart(2, '0')).join('');
    if (hash !== frame.sha256) throw new Error('Una ilustración local no coincide con la revisión guardada.');
    const svg = new TextDecoder().decode(buffer);
    if (!/^<svg\s[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(svg)) throw new Error('La ilustración local no es válida.');
    return { path: frame.path, svg };
  }));
}

async function rasterize(artwork: RoutineArtwork[]): Promise<RoutineArtwork[]> {
  // Only invoked when pdfmake's SVG renderer rejects a previously hash-checked local asset.
  return Promise.all(artwork.map(async asset => {
    const image = new Image();
    const url = URL.createObjectURL(new Blob([asset.svg], { type: 'image/svg+xml' }));
    try {
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No se pudo convertir la ilustración local.');
      context.fillStyle = '#111827'; context.fillRect(0, 0, 1024, 1024);
      context.drawImage(image, 0, 0, 1024, 1024);
      return { ...asset, svg: canvas.toDataURL('image/png') };
    } finally { URL.revokeObjectURL(url); }
  }));
}

export async function renderPdf(documentDefinition: PdfDocument): Promise<Blob> {
  const [pdfModule, fontsModule] = await Promise.all([import('pdfmake/build/pdfmake.js'), import('pdfmake/build/vfs_fonts.js')]);
  const pdf = pdfModule.default;
  pdf.addVirtualFileSystem(fontsModule.default);
  const blob = await pdf.createPdf(documentDefinition).getBlob();
  if (blob.type !== 'application/pdf' || new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer()) !== '%PDF-') throw new Error('El archivo PDF generado no es válido.');
  return blob;
}

export async function exportRoutinePdf(person: Person, revision: RoutineRevision): Promise<{ blob: Blob; rasterFallback: boolean }> {
  if (person.id !== revision.personId) throw new Error('La rutina pertenece a otra persona.');
  const artwork = await artworkFor(revision);
  try { return { blob: await renderPdf(routineDocument(person, revision, artwork)), rasterFallback: false }; }
  catch (error) {
    if (!artwork.length) throw error;
    const images = await rasterize(artwork);
    const definition = routineDocument(person, revision, images, true);
    // Raster images use the same content slot, panel and captions; selectable text stays vector/text.
    for (const node of definition.content) replaceRaster(node);
    return { blob: await renderPdf(definition), rasterFallback: true };
  }
}

function replaceRaster(node: unknown): void {
  if (!node || typeof node !== 'object') return;
  const value = node as Record<string, unknown>;
  if (typeof value['svg'] === 'string' && value['svg'].startsWith('data:image/png;')) { value['image'] = value['svg']; delete value['svg']; }
  for (const entry of Object.values(value)) if (Array.isArray(entry)) entry.forEach(replaceRaster); else if (entry && typeof entry === 'object') replaceRaster(entry);
}

export function routinePdfFilename(revision: RoutineRevision): string {
  const slug = revision.name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 55) || 'rutina';
  return `entrena-con-jesus-${slug}-${revision.updatedAt.slice(0, 10)}.pdf`;
}

export function downloadPdf(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
