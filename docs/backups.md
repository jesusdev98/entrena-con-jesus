# Restore all personal data on another device

Open **Ajustes → Abrir intercambio y copias completas** and select **Descargar copia completa JSON**. Keep the file somewhere safe: it contains private health, activity and nutrition information for **every** person on this browser origin. It is generated locally and never uploaded. Download a fresh copy before changing browsers, devices or addresses.

## Restore

1. On the destination device, open **Compartir planes → Copia completa de este dispositivo** and choose the saved JSON file. It also works offline once the application and its resources are ready in **Ajustes**.
2. Inspect the file date, the full UUID of each person (same names are independent), and the incoming/existing record counts for each store. **Cancel** leaves the destination untouched.
3. Tick the explicit replacement confirmation and select **Restaurar y reemplazar datos**. This **replaces all local personal data**, including profiles, plans, histories, daily targets, custom entries, consumption receipts, drafts, external mappings, mode and active person. It does not merge by name. After success the application reloads into the restored workspace.

## File and recovery contract

| Area | Behavior |
|---|---|
| Format | UTF-8 JSON, `app: entrena-con-jesus`, `schemaVersion: 1`, `kind: backup`, export UUID/time and SHA-256 checksum of the JSON payload. The checksum detects accidental damage; it does **not** authenticate the sender, encrypt the file or prevent deliberate editing. Protect the file yourself. Future versions, truncated files and unknown top-level fields are rejected. |
| Content | One consistent IndexedDB read transaction across **all 13 existing stores**: settings, people, profile revisions, custom exercises/foods, routine/meal revisions, sessions, food logs, daily snapshots, meal-consumption receipts, unfinished drafts and foreign-subject mappings. Stable IDs and detached historical food/exercise snapshots, credits and sourced metadata remain with the records. No stored type is intentionally excluded. |
| Bundled resources | Static third-party exercise/food/MET catalogs, SVGs and application assets are not copied or overwritten. Install/prepare the destination application at a version containing the catalog resources referenced by historical snapshots; detached custom resources and historical media metadata travel with the file. |
| Validation | Maximum 20 MiB UTF-8, bounded depth/node counts and arrays, strict version/store/record fields, finite bounded numbers, valid IDs/dates/ownership, person/settings identity, revision ancestry, indexed uniqueness, intake sources and receipts are checked before a write transaction. Imported strings are rendered as text; external asset paths, executable content and remote media are rejected. Historical source-credit HTTPS links are metadata only. |
| Atomicity | Review records the current database snapshot. Confirmed restore rechecks it for changes in the same IndexedDB transaction that clears and inserts all 13 stores. A quota/constraint failure aborts the transaction and retains the original bytes. If another tab changed data after preview, select the file again. Other tabs receive a reload notification after a successful restore. |

Backup size is deliberately bounded; an export above 20 MiB fails visibly instead of downloading a partial file. This file is a full-device replacement. For selective exchange of one plan or a date range of actual progress with explicit person mapping, use [manual transfers](transfers.md).

## Verify and rollback

Run `npm test -- --no-watch`, `npm run lint`, `npm run build`, `npm run validate:catalogs -- --built`, then the serial `e2e/backups.spec.ts` and existing `e2e/transfers.spec.ts` Chromium mobile/desktop projects. Offline cases verify a controlling activated service worker and every required cache response before disconnecting.

Independent feature rollback removes `src/app/features/transfers/backup-*`, the backup panel integration in `transfers-page.ts`, the Ajustes backup link/copy, `Database.notifyRestored` and its channel, backup browser tests and this documentation. No migration or IndexedDB reset is needed; existing 13 stores and personal records remain.
