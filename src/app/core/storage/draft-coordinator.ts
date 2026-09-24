import { Injectable, signal } from '@angular/core';

/** Editors register durable flushes; transitions never silently discard failed drafts. */
@Injectable({ providedIn: 'root' })
export class DraftCoordinator {
  readonly pending = signal(false);
  private readonly writers = new Set<() => Promise<boolean>>();
  register(writer: () => Promise<boolean>): () => void {
    this.writers.add(writer);
    return () => { this.writers.delete(writer); this.pending.set(false); };
  }
  async flush(): Promise<boolean> {
    const results = await Promise.all([...this.writers].map(writer => writer()));
    const saved = results.every(Boolean);
    this.pending.set(!saved);
    return saved;
  }
}
