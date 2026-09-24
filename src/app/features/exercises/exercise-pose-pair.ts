import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import type { ReviewedExerciseMedia } from './exercise.model';
import { semanticLabels } from './exercise-catalog.model';

@Component({ selector: 'app-exercise-pose-pair', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (media(); as pair) {
    <p class="badge">{{ labels[pair.semantics] }}</p><p>{{ pair.description }}</p>
    <div class="poses" [attr.data-semantics]="pair.semantics" [attr.data-mode]="pair.mode">
      @for (frame of pair.frames; track frame.path) {
        <figure><div class="surface">
          @if (failed().includes(frame.path)) { <p role="status">Imagen no disponible. Revisa la preparación sin conexión en Ajustes.</p> }
          @else { <img [src]="frame.path" [alt]="name() + ' — ' + frame.label" width="512" height="512" loading="lazy" (error)="imageFailed(frame.path)" /> }
        </div><figcaption><strong>{{ $index + 1 }}. {{ frame.label }}</strong>
          <p class="credit"><a [href]="frame.attribution.creatorUrl" target="_blank" rel="noopener noreferrer">{{ frame.attribution.creator }}</a> ·
            <a [href]="frame.attribution.licenseUrl" target="_blank" rel="noopener noreferrer">{{ frame.attribution.license }}</a></p>
          <details><summary>Créditos de esta imagen</summary><div class="credit">
            <p><a [href]="frame.attribution.sourceUrl" target="_blank" rel="noopener noreferrer">Archivo original · fotograma {{ frame.frame }}</a></p>
            @if (frame.attribution.source; as source) {
              <p>Adaptación directa de <a [href]="source.url" target="_blank" rel="noopener noreferrer">{{ source.name }}</a> · <a [href]="source.licenseUrl" target="_blank" rel="noopener noreferrer">{{ source.license }}</a>.</p>
              <p>Cambios declarados por la fuente: <span lang="en">{{ source.changes }}</span></p>
            }
            <p>Base de la colección: <a [href]="frame.attribution.collectionCredit.url" target="_blank" rel="noopener noreferrer">{{ frame.attribution.collectionCredit.author }}</a> ·
              <a [href]="frame.attribution.collectionCredit.licenseUrl" target="_blank" rel="noopener noreferrer">{{ frame.attribution.collectionCredit.license }}</a>.</p>
            <p lang="en">{{ frame.attribution.collectionCredit.scope }}</p>
            <p>Cambios locales: <span lang="en">{{ frame.attribution.localChanges }}</span></p>
          </div></details>
        </figcaption></figure>
      }
    </div>
  } @else { <div class="placeholder" role="note">Sin imágenes: ejercicio personalizado. No hay ilustraciones asociadas.</div> }`,
  styles: `:host { display: block; min-width: 0; } .poses { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; }
    figure { margin: 0; min-width: 0; } .surface { background: var(--ink); color: white; border-radius: .75rem; padding: .35rem; }
    img { width: 100%; height: auto; display: block; } figcaption { overflow-wrap: anywhere; padding-top: .5rem; }
    .credit { font-size: .8rem; } .credit p { margin: .5rem 0; } .placeholder { padding: 1.5rem; background: var(--blue-soft); border: 1px dashed var(--primary-dark); border-radius: .75rem; }
    @media(max-width: 359px) { .poses { grid-template-columns: minmax(0, 1fr); } }` })
export class ExercisePosePair {
  readonly name = input.required<string>();
  readonly media = input<ReviewedExerciseMedia | null>(null);
  protected readonly labels = semanticLabels;
  protected readonly failed = signal<string[]>([]);
  protected imageFailed(path: string): void { this.failed.update(paths => [...paths, path]); }
}
