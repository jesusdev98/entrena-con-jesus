import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abortable, waitForOfflineCache } from './cache-readiness';

describe('offline cache installation lifecycle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const resources = [new URL('https://example.test/entrena/main.js'), new URL('https://example.test/entrena/lazy.js')];

  it('waits for every resource after activation instead of treating the first cache miss as final', async () => {
    let installed = false;
    let ready = false;
    const cache = { match: vi.fn(async (url: RequestInfo | URL) =>
      String(url).endsWith('main.js') || installed ? new Response('cached') : undefined) };
    const waiting = waitForOfflineCache(resources, cache, () => true, new AbortController().signal).then(() => { ready = true; });
    await vi.advanceTimersByTimeAsync(500);
    expect(ready).toBe(false);
    installed = true;
    await vi.advanceTimersByTimeAsync(250);
    await waiting;
    expect(ready).toBe(true);
    expect(cache.match).toHaveBeenCalledWith('https://example.test/entrena/lazy.js');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not announce cached resources until a worker controls the page', async () => {
    let controlled = false;
    let ready = false;
    const waiting = waitForOfflineCache(resources, { match: async () => new Response('cached') }, () => controlled,
      new AbortController().signal).then(() => { ready = true; });
    await vi.advanceTimersByTimeAsync(500);
    expect(ready).toBe(false);
    controlled = true;
    await vi.advanceTimersByTimeAsync(250);
    await waiting;
    expect(ready).toBe(true);
  });
  it('polls only missing resources during prefetch, then verifies the complete cache again', async () => {
    let installed = false;
    const cache = { match: vi.fn(async (url: RequestInfo | URL) => String(url).endsWith('main.js') || installed ? new Response('cached') : undefined) };
    const waiting = waitForOfflineCache(resources, cache, () => true, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1000);
    expect(cache.match.mock.calls.filter(([url]) => String(url).endsWith('main.js'))).toHaveLength(1);
    installed = true;
    await vi.advanceTimersByTimeAsync(250);
    await waiting;
    expect(cache.match.mock.calls.filter(([url]) => String(url).endsWith('main.js'))).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not trust an earlier hit if a resource disappears before final verification', async () => {
    let mainPresent = true;
    let lazyPresent = false;
    let ready = false;
    const cache = { match: async (url: RequestInfo | URL) => (String(url).endsWith('main.js') ? mainPresent : lazyPresent) ? new Response('cached') : undefined };
    const waiting = waitForOfflineCache(resources, cache, () => true, new AbortController().signal).then(() => { ready = true; });
    await vi.advanceTimersByTimeAsync(250);
    mainPresent = false; lazyPresent = true;
    await vi.advanceTimersByTimeAsync(250);
    expect(ready).toBe(false);
    mainPresent = true;
    await vi.advanceTimersByTimeAsync(250);
    await waiting;
    expect(ready).toBe(true);
  });

  it('leaves failed/incomplete caches unready and cancels polling at the deadline', async () => {
    const controller = new AbortController();
    const waiting = waitForOfflineCache(resources, { match: async () => new Response('failed', { status: 503 }) }, () => true, controller.signal);
    const rejected = expect(waiting).rejects.toThrow('deadline');
    await vi.advanceTimersByTimeAsync(500);
    controller.abort(new Error('deadline'));
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects an empty expected-resource set', async () => {
    await expect(waitForOfflineCache([], { match: async () => undefined }, () => true, new AbortController().signal)).rejects.toThrow('No required');
  });

  it('cancels activation or cache operations that never finish', async () => {
    const controller = new AbortController();
    const waiting = abortable(new Promise<never>(() => undefined), controller.signal);
    const rejected = expect(waiting).rejects.toThrow('cancelled');
    controller.abort(new Error('cancelled'));
    await rejected;
  });
});
