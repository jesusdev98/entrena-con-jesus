/** Cancel waits without leaving abort listeners or polling timers behind. */
export async function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let onAbort: () => void = () => undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
    })]);
  } finally { signal.removeEventListener('abort', onAbort); }
}

/** A new successful cache hit extends the stall window, never the absolute limit. */
export function preparationDeadline(controller: AbortController, stallMs = 15_000, maximumMs = 600_000) {
  const stalled = () => controller.abort(new Error('Offline preparation stalled'));
  let stallTimeout = setTimeout(stalled, stallMs);
  const maximumTimeout = setTimeout(() => controller.abort(new Error('Offline preparation limit reached')), maximumMs);
  let lastCount = 0;
  return {
    progress(cached: number) {
      if (controller.signal.aborted || cached === lastCount) return;
      if (cached < lastCount) { lastCount = cached; return; }
      lastCount = cached;
      clearTimeout(stallTimeout);
      stallTimeout = setTimeout(stalled, stallMs);
    },
    clear() { clearTimeout(stallTimeout); clearTimeout(maximumTimeout); },
  };
}

/** Worker activation precedes Angular's initial prefetch; inspect the cache until complete. */
export async function waitForOfflineCache(
  resources: readonly URL[],
  cache: Pick<CacheStorage, 'match'>,
  hasController: () => boolean,
  signal: AbortSignal,
  onProgress: (cached: number, total: number) => void = () => undefined,
): Promise<void> {
  if (resources.length === 0) throw new Error('No required offline resources');
  let pending = resources;
  let reported = 0;
  while (true) {
    signal.throwIfAborted();
    if (hasController()) {
      const checkingAll = pending === resources;
      const responses = await abortable(Promise.all(pending.map(url => cache.match(url.href))), signal);
      pending = pending.filter((_url, index) => !responses[index]?.ok);
      const cached = resources.length - pending.length;
      if (cached !== reported) { reported = cached; onProgress(cached, resources.length); }
      if (pending.length === 0) {
        if (checkingAll && hasController()) return;
        // Recheck the complete set before announcing readiness, including resources
        // that may have disappeared while the remaining prefetch was in progress.
        pending = resources;
        continue;
      }
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await abortable(new Promise<void>(resolve => { timer = setTimeout(resolve, 250); }), signal);
    } finally { clearTimeout(timer); }
  }
}
