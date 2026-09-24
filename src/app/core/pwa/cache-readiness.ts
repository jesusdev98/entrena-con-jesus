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

/** Worker activation precedes Angular's initial prefetch; inspect the cache until complete. */
export async function waitForOfflineCache(
  resources: readonly URL[],
  cache: Pick<CacheStorage, 'match'>,
  hasController: () => boolean,
  signal: AbortSignal,
): Promise<void> {
  if (resources.length === 0) throw new Error('No required offline resources');
  let pending = resources;
  while (true) {
    signal.throwIfAborted();
    if (hasController()) {
      const checkingAll = pending === resources;
      const responses = await abortable(Promise.all(pending.map(url => cache.match(url.href))), signal);
      pending = pending.filter((_url, index) => !responses[index]?.ok);
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
