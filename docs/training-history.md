# Actual training and weekly history

`/training` records actual performance from a saved routine revision. `/progress` compares saved results with their original prescriptions across local Monday–Sunday weeks. Plans never count as actuals. All data stays with the selected person's UUID in the existing 13-store database.

## Quick path

1. Open **Rutinas → Entrenar [routine]**, select revision/week/day/date and **Iniciar sesión**.
2. Enter actual values and RPE; explicitly **Completar serie** or mark **No realizada**. Incomplete values remain recoverable drafts, including after reload and owner/mode changes.
3. Optionally enter total actual minutes and notes, then **Finalizar y guardar sesión**. Every set must be completed or explicitly skipped.
4. Open **Progreso** and choose two weeks. Filter by exercise identity or an optional exact date; the date intersects both weeks. Clear it to restore full-week comparisons.
5. **Corregir sesión** opens a correction draft. Reopen individual sets, change actual values, then **Guardar corrección intencional**. Historical targets and media remain frozen.

Offline use requires the successful **Ajustes** readiness check before disconnecting. Cached instructions/pose pairs and local draft/session writes work independently of the network; external attribution links require connectivity.

## Contracts

| Boundary | Rule |
|---|---|
| Start | Read the selected owner/revision/week/day inside a transaction. Snapshot names, routine/exercise/set notes, targets, exercise instructions, logging type, media and credits. Preserve source IDs even if the routine later changes or is archived. |
| Blank actuals | New sets have nullable fields and no RPE. No target-to-actual copying or automatic completion. Zero load/assistance is an explicit actual value, not a missing value. |
| Completed actuals | Weight/reps requires nonnegative finite kg and positive integer repetitions. Bodyweight requires repetitions; assistance has its own nonnegative kg field. Duration requires positive finite seconds; distance/duration requires positive finite meters and seconds. |
| Effort | Completed sets require RPE 1–10 in 0.5 steps. Repetition types allow optional finite nonnegative RIR independently; duration/distance do not accept RIR. |
| Skipped sets | Store `status: skipped`, `actual: null`, `rpe: null`. Partial sessions may finish after all remaining sets are explicitly skipped. Even all-skipped sessions are honest saved records with zero completed sets, not invented performance. |
| Compatibility | Use existing logging normalization for catalog/legacy hyphenated and custom underscore identifiers. Retain deep media/source/credit metadata without rewriting catalog bytes. |
| Recovery | Each editor captures its owner. Serialized writes compare the entire last durable draft. Person/mode/route transitions flush pending values to that owner; write failures retain inputs and block departure. |
| Commit | Check persisted active person/mode, full saved base and full durable draft. Delete draft and write session in one transaction; failures roll both back. Same-name clients remain separate. |
| Conflict | Display local and durable actuals. Explicit **Descartar mis cambios y recuperar versión durable** replaces local edits with the latest draft or saved session. A further race fails the next full comparison again. |
| Corrections | Keep session/exercise/set IDs, start time, original completion time and prescription snapshots. Increment the session version; date, actuals, notes and manual total duration can be intentionally corrected. |
| History | Derive from completed saved sessions, filtered by owner, local week, exercise ID and optional exact date. Display skipped rows but count only completed sets. Calendar arithmetic preserves Monday/year/leap-day boundaries without UTC-shifting the user's date. |
| Future consumers | Stable source/session/set IDs, local date, version, start/completion timestamps, manual total minutes and duration provenance are available for later export/activity. There are no calorie/MET calculations or activity writes. |

## Implementation and verification

- `src/app/features/training/training-domain.ts`, `training.model.ts`: actual validation, immutable start snapshots and explicit set transitions.
- `training.repository.ts`, `training-editor.store.ts`: owner-bound persistence, full-base conflict checks and transactional save/correction.
- `training-page.ts`, `person-training.*`, `training-editor.*`, `actual-set-editor.ts`: route/context composition and accessible Spanish forms, using shared numeric fields, buttons and pose pairs.
- `session-summary.ts`: textual planned/actual comparison, reused in history and conflicts.
- `src/app/features/progress/person-progress.*`, `training-history.ts`: saved history filters and local calendar weeks.
- Four colocated spec files cover validation, rollback, stale edits, restart/owner switching, snapshot detachment and date boundaries. `e2e/training.spec.ts` covers actual browser workflows; routine regressions remain in `e2e/routines.spec.ts`.

Run full Angular units, lint/build, food/exercise data tests and both built validators, then:

```bash
npx playwright test e2e/training.spec.ts e2e/routines.spec.ts --project=chromium-mobile --project=chromium-desktop
```

Rerun the focused tests and browser scenarios for current results; historical screenshots and session logs are internal.

## Independent work-unit boundary

Rollback boundary: training and progress domain/repository/editor/history files and their specs, `e2e/training.spec.ts`, training draft/model contracts, route/home/routine-entry integration and these README/docs changes form one behavior unit. Restore the previous placeholder entries together if reverting. Preserve all existing personal stores and records, routine planning, catalog sources/artwork and nutrition functionality. No rollback/reset was performed.

The shared startup/readiness fixes are independently bounded by `app.config.ts` and `core/pwa/cache-readiness.ts/.spec.ts`; they do not depend on training data or change stores. Existing workspace browser assertions now exercise the delivered routine page and wait for distinct references before reading same-name client IDs.

Next entry point: nutrition/activity (unit 5), consuming session IDs and explicit duration only when that separate integration is implemented. METs, plans/diary/calculations, transfers/backups and PDFs remain pending. WebKit's known internal offline reload error and real-device installation are outside this unit's verification.
