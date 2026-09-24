# Share plans and actual progress by file, with review before applying

`/transfers` exchanges **one selected routine or weekly meal plan**, **saved actual progress for a selected date range**, or a [complete personal-data backup](backups.md) as JSON files. Trainer and client exchange files themselves. There is no account, verified sender, remote sync or server. Full backups replace the entire local workspace; individual exchanges use explicit person mapping and review.

## Quick path

1. Select the intended person. Open **Compartir planes**, select a saved plan and download its JSON. Send it manually.
2. On the other device, select the destination person first, then choose the file. Check the source's stated workspace/person IDs, the local UUID, revision IDs and field-by-field changes.
3. Choose **Aceptar revisión recibida**, **Conservar original local**, or **Guardar copia independiente** and confirm the destination. Nothing is mapped or written before this confirmation.
4. The recipient may edit the imported plan in the regular editor and export it back. Review the returned revision before applying it. A divergent base is explicitly labeled; there is no automatic merge.

Prepare offline resources in **Ajustes** on *each* device before disconnecting. Bundled exercises/foods are referenced by stable catalog ID and version; recipient-side local catalogs rebuild snapshots with their ordered per-frame credits. Referenced personal exercises/foods travel in the file. No remote resource is fetched during import.

## Boundaries and recovery

| Boundary | Contract |
|---|---|
| File | UTF-8 JSON, at most 512 KiB, app `entrena-con-jesus`, `schemaVersion: 1`, `kind: plan`, UUID export/subject/plan/revision IDs and timestamp. Exactly one selected plan. Unknown/future formats are rejected. HTML, executable SVG and remote media URLs cannot be imported. Credits come from the bundled local catalog, not file-supplied artwork. |
| Validation | Zod4 strict known-field models, depth/node/array/string/numeric bounds, dates, plan-prescription validity, unique row IDs and resolved custom/catalog references are checked before any transaction. Invalid files leave all stores unchanged. |
| Identity | An external workspace/person pair is assigned only to the explicitly active local person on apply. IDs, never names, match returning revisions. A different local person cannot reuse an established mapping. Foreign IDs are provenance, not proof of identity or authorization. |
| Review | Each changed field/ordered row displays before/received values, local and foreign revision provenance and divergent-base status. Keep writes no plan; accept appends a local revision with the previous head as parent; copy creates a separate plan. Already-imported revision IDs are idempotent. |
| Atomicity | Apply rechecks the active person, settings, mapping and local head in one IndexedDB transaction, adding needed custom references and an optional mapping together with the new revision. A conflicting existing custom ID with different content is rejected rather than overwritten. A failed/quota transaction rolls back all writes. Actual sessions, food logs and consumption receipts are never written. |
| Edits | Imported content is detached from its source. Subsequent local edits append normally; exporting translates the imported base to its foreign revision ID. Local UUIDs remain local. Full-revision history is retained. |

Plan-file import does not import profile details, workouts, daily targets or consumed foods. It does not make a backup of browser data. Keep the original file until both devices have reviewed the intended revision. Older saved custom media-free exercise snapshots and published kcal portions remain detached; when a required catalog version is not locally available, import/export stops with a visible error instead of inventing values.

## Return actual progress to the trainer

1. The client selects their own person in **Compartir planes**, chooses **Desde/Hasta** (up to 31 calendar days including both endpoints, not after today) and downloads **progreso JSON**. It includes only completed saved training sessions and actual dated food logs; unfinished drafts, planned meals/routines and daily activity targets are excluded. The file contains health and meal details: choose the intended recipient before sending it. No public upload occurs.
2. The trainer explicitly selects the corresponding local client, chooses **Archivo de progreso JSON recibido**, and reviews foreign workspace/person UUIDs, date, revision and actual metrics for every added, already-present or conflicting record. Same display names never map people. Confirm the destination and choose **Conservar registro local** or **Reemplazar con recibido** separately for every conflict.
3. Open **Progreso** at the imported training week and **Diario alimentario** at the imported date. Repeating unchanged imports adds nothing. A corrected foreign record keeps one stable local occurrence; later foreign corrections require a fresh review.

| Boundary | Progress contract |
|---|---|
| File and source | Same strict UTF-8 JSON envelope (`app`, `schemaVersion: 1`, `kind: progress`, export ID/timestamp and opaque source workspace/person) and 512 KiB bound as plans. Up to 120 sessions and 600 logs per file. Catalog exercises/foods use bundled ID and exact version; custom snapshots contain bounded text and nutrition, never media or executable content. Missing catalog versions fail closed. |
| Validation | Strict known fields, finite actuals, source refs, complete set statuses, unique IDs, ownership, local date/range and nonfuture timestamps are checked before writing. Unknown/future, corrupt or oversized files leave all stores unchanged. The file is not an identity credential. |
| Identity and review | First apply binds the foreign workspace/person pair to the explicitly active local person in `externalSubjects`; later imports for that pair cannot target another person. A local UUID stays distinct from the foreign record ID. The per-record source revision/fingerprint and local state make unchanged repeats idempotent; conflicting versions require keep/replace. |
| Apply and history | One IndexedDB transaction rechecks the selected person, mapping and local actual-record state, then applies all decisions atomically. Failure rolls everything back. Replacing a record retains its local stable ID and frozen actual/source snapshots. Training and diary stores keep the **current record**, not an append-only correction history; keep earlier files if an external history is needed. No routine, meal plan, consumption receipt, draft, profile or target is overwritten. |
| Daily targets | Diary intake and weekly training history use imported actuals. Saved activity/target snapshots are not exchanged. Without a local target for that person/date, the diary says no target is saved; calories and targets are never inferred from imported food or prescriptions. |

An imported meal log retains its detached historical food/portion and optional foreign plan source label. It does not create a local meal-consumption receipt; the trainer cannot undo an unimported plan through it. Local corrections in ordinary diary/session editors remain edits of the current record.

## Verify and rollback

From the checkout, run `npm test -- --no-watch`, `npm run lint`, `npm run build`, `npm run validate:catalogs -- --built`, and `npx playwright test e2e/transfers.spec.ts --project=chromium-mobile --workers=1` (then `chromium-desktop`). Chromium offline tests require a controlling activated worker and successful cache responses for every required resource on both devices. An earlier 6b build passed 317 Angular tests, lint, all three built-catalog validators and 5/5 transfer cases per Chromium project; rerun checks for the current build.

Independent rollback boundary: remove `src/app/features/transfers/` runtime/schema/page/tests, the optional `exchange` provenance on routine/meal revisions, `/transfers` route and home/settings links, `e2e/transfers.spec.ts` and the matching README/docs. Keep all existing 13 stores and saved records; do not reset the database.

Progress-only rollback boundary: remove `progress-schema.ts`, `progress-exchange.ts`, their spec and the progress controls in `transfers-page.ts`, plus optional progress `exchange` fields on `TrainingSession`/`FoodLog` and corresponding browser/docs updates. Preserve plan exchange, all 13 stores and existing actual records; feature removal does not erase previously imported progress.
