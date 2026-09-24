# Application architecture

The application is a client-rendered Angular 22 standalone SPA with lazy hash routes, feature-local models and typed IndexedDB repositories. Work units 1–2 provide the durable workspace boundary now reused by catalogs, routine planning, actual training/history and daily activity targets. Meal planning/diary and sharing workflows remain pending.

## Follow one save

1. `features/people/person-editor.ts` owns a typed Reactive Form and serializes changed values to a separate draft. Unsaved values remain in the visible form if persistence fails.
2. `core/storage/draft-coordinator.ts` flushes active editors before route changes, mode/person changes and app-update reloads.
3. `features/people/people.repository.ts` validates outside the transaction, then atomically writes the person, appends a profile revision and removes only that editor's draft. It awaits transaction completion and rolls back on failure.
4. `features/people/workspace.store.ts` publishes durable results through Signals. There is no successful in-memory fallback for failed storage writes.

## Boundaries

| Layer | Responsibility / entry point |
|---|---|
| Shell | `shared/ui/shell.*`: responsive navigation, explicit active-person identity and update messaging |
| Features | Local workspace, food/exercise catalogs, routine planning, actual training, saved progress and daily activity targets; contracts live beside each feature |
| Shared UI | Buttons, cards, labeled numeric fields, icon, CDK confirmation dialog and accessible numeric SVG progress ring |
| Storage | `core/storage/database.ts`, `database-schema.ts`, `migrations.ts`: connections, typed stores, additive migration lifecycle |
| Repositories | `PeopleRepository`, `DraftsRepository`, `OwnedRepository<S>`: explicit person boundaries, atomic writes, append-only revision access |
| PWA | `core/pwa/`, `ngsw-config.json`, `scripts/finalize-build.mjs`: current-resource prefetch and update plumbing |
| Tooling | Strict TypeScript/templates, Angular ESLint, CLI Vitest, Playwright and static preview |

## Identity and schema

Database name: `entrena-con-jesus`; schema version: **2**. Settings contains a stable workspace UUID, personal person UUID, mode, active person UUID and remembered trainer person UUID. A mode switch selects the personal workspace in Client mode and restores the previous available selection in Trainer mode. Archived clients retain records and can be restored.

- Version 1: `settings`, `people`, `profileRevisions`, `drafts`.
- Version 2: `customExercises`, `customFoods`, `routineRevisions`, `mealPlanRevisions`, `trainingSessions`, `foodLogs`, `dailySnapshots`, `mealConsumptions`, `externalSubjects`.
- Person-owned stores use compound `[personId, id]` primary keys and a `by-person` index. An identical foreign record UUID can exist independently for two local people. Repositories reject mismatched supplied owners and nonexistent people.
- Dated records index `[personId, localDate]`; sessions additionally support a multi-entry `personId:exerciseId` history index. Session start derives these keys from the selected saved day and freezes them with the prescribed snapshot.
- Daily snapshots are unique per person/date. Consumption receipts are unique per person/date/revision/meal, anticipating idempotent planned-meal transfers.
- External-subject mapping is unique by external workspace/person; display names are labels only.
- Profile and plan revision writes are append-only through the shared repository. Mutable feature workflows must use purpose-specific atomic repositories, not a generic overwrite API.

Upgrades reject a missing version-1 baseline rather than pretending a malformed database is usable. Blocked upgrades are visible; an old connection closes for a new schema version. Terminated/open-failed connections are retryable. The separate upgrade transaction rejection is observed while `openDB` exposes the failure to callers.

## Feature contracts

Feature-local `*.model.ts` files separate implemented training workflows from future nutrition/activity/sharing consumers:

- **Routines/training (implemented):** stable plan/parent-revision IDs; ordered weeks/days/exercises; typed prescriptions and independently entered actuals. Start freezes revision/week/day/media/credits; nullable drafts and explicit completed/skipped sets remain owner-bound. Full-draft/full-base checks guard atomic commits and corrections. Saved history uses local Monday weeks and exercise/date filters. See [training/history contracts](training-history.md).
- **Activity targets (implemented):** daily input distinguishes missing, forecast and actual for owner/date; immutable context and calculation payloads use the existing `dailySnapshots` and `drafts` stores, with a full-base guarded atomic save. See [daily activity contracts](daily-activity.md).
- **Meal planning/diary (later):** planned meals separate from food logs, per-100-g snapshots and consumption receipts.
- **MET correction:** sourced adult tables use `referenceMlO2PerKgMin: 3.5` and older-adult/MET60+ tables use `2.7`. The pure energy engine resolves against the captured age/table/source instead of applying 3.5 to both tables.
- **Transfers:** typed versioned plan/progress/backup envelopes and explicit external subjects. These types are **not runtime import validation**. Work unit 6 must implement bounded Zod validation, reference checks, review, conflicts and atomic application before accepting files.

Pure calculations should remain independent of Angular/storage/PDF libraries. Profile changes must not rewrite historical daily or actual-performance snapshots. Static sourced catalogs belong outside the personal database.

## Delivery and verification limits

The production build includes every current lazy chunk in prefetch configuration. `resource-manifest.json` lists the expected files; finalization regenerates `ngsw.json` to include the resource manifest itself. Service-worker tooling expects the build directory argument relative to the working directory. The preview serves the same relative build at `/` and `/entrena/`.

Worker activation is not initial-prefetch completion. Registration waits for application stability to avoid delaying the first lazy route behind catalog prefetch. `core/pwa/cache-readiness.ts` polls missing resources during installation, then checks the entire set again before readiness, including resources that disappeared during preparation. An activated worker must control the page and every expected resource (including the manifest) must have a successful cached response. `offline-status.ts` retains the 15-second preparation deadline, cancels waits/timers when destroyed or timed out, and prevents overlapping attempts. Incomplete preparation remains retryable; no registration-only or in-memory success fallback is used.

The person-selector wrapper uses normal block layout. WebKit allowed a long native option's intrinsic width to expand the document's scrollable area when the select was inside grid/flex layout, despite its border box fitting. Removing that layout interaction preserves native keyboard behavior, full option labels, the wrapping active-person caption and visible focus without blanket overflow clipping.

Vitest covers storage/editor behavior with fake IndexedDB, actual validation/history and cache-wait lifecycle semantics. Browser evidence remains separate: earlier Chromium checks covered offline catalog/routine/training flows at both paths and 320px layout/focus. The historical WebKit run failed first offline reload with an internal engine error and was not rerun for training. Run the current test and build commands in the README for current results.

No backend, authentication, automatic synchronization or remote publication is configured.
