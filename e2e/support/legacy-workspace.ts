import type { Page } from '@playwright/test';

/** Existing empty-workspace scenarios exercise the real markerless legacy path, not first-install demo onboarding. */
export async function markLegacyWorkspace(page: Page): Promise<void> {
  await page.getByRole('radio', { name: /Entrenador/ }).waitFor();
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('entrena-con-jesus');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('settings', 'readwrite');
        const store = tx.objectStore('settings');
        const request = store.get('workspace');
        request.onsuccess = () => {
          const settings = request.result;
          if (!settings || settings.mode !== null || settings.demoSeed?.status !== 'eligible') {
            tx.abort(); return;
          }
          delete settings.demoSeed;
          store.put(settings);
        };
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error('Expected a new empty workspace'));
        tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  });
}
