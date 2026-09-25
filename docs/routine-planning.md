# Routine planning and recovery

`/routines` provides person-owned multiweek plans, nested editing and recoverable drafts. Saved plans are validated, append-only revisions. This unit plans targets; it does not record actual workouts or effort.

## Quick path

1. Select the intended person, open **Rutinas**, then **Crear rutina / recuperar nueva**. The person's reference and UUID remain visible above the editor.
2. Name the routine, weeks and days. **Añadir ejercicio** searches the existing 250-entry catalog plus that person's active custom exercises. Review the details, then **Añadir al día**.
3. Enter targets for each set. Weeks, days, exercise instances and sets support duplication, removal and keyboard-operable move buttons. Duplicated rows have independent labels and values.
4. **Guardar rutina válida** validates the entire plan. Missing/invalid values stay in a separately labeled draft. **Volver a la lista conservando borrador** retains changes; the list offers named recovery buttons.
5. Edit saved plans, duplicate into a new draft, or archive/restore from the list. A duplicate becomes a saved plan only after explicit validation/save.
6. **Eliminar definitivamente [rutina]** presents an irreversible confirmation, separate from archive. Cancel without writing, or confirm to remove all revisions and matching routine editor drafts from both active and archived lists. Completed training sessions, frozen prescriptions, progress/corrections and actual-history PDFs remain available. Archived or deleted plans have no plan PDF.

For offline use, prepare resources in **Ajustes** until readiness is confirmed, before disconnecting. Routine creation, editing, saved illustrations and draft recovery then use local resources/storage. External attribution links still need connectivity.

## Data contracts

| Boundary | Contract |
|---|---|
| Draft vs. saved | Nullable incomplete targets belong to `RoutineContentDraft`. `savedContent()` rejects invalid names, empty weeks/days/exercises/sets, duplicate instance IDs, mismatched logging types and invalid numeric targets. |
| Repetitions | Positive integer minimum/maximum, minimum ≤ maximum. External load or assistance is optional, finite and nonnegative; zero and fractional kg are valid. Bodyweight has no external-load control. |
| Other targets | Duration requires positive seconds. Distance requires positive meters and optional positive seconds. Rest and repetition-based target RIR are optional, finite and nonnegative. No actual RPE field. |
| Compatibility | Existing logging normalization accepts hyphenated catalog/legacy and underscore custom identifiers. Existing personal stores and database version are retained. |
| Identity | Plan/week/day/exercise-instance/set IDs stay stable across revisions and reorder operations. Duplicating any level renews all descendant instance IDs; catalog exercise references stay unchanged. |
| Snapshots | The existing `exerciseSnapshot()` detaches instructions, logging type, equipment, ordered media, hashes, source/adaptation metadata and every frame's credits. Later custom/catalog changes cannot rewrite saved prescriptions. |
| Revisions | Save/archive/restore append a parent-linked revision. Head comparison, active persisted person/mode checks, revision insertion and matching-draft deletion share one transaction. Failed commits preserve the draft. |
| Draft ownership | Each editor captures its person once. Mode/person/route transitions flush registered editors before leaving; failed writes retain input and block transitions. Same-name people remain distinct by UUID. |
| Cross-tab conflicts | Draft writes compare the entire last durable payload, including equal-timestamp changes. Conflicts display local/current/durable values. Choosing current, keeping local values over the displayed revision, adopting a durable draft or retaining a new copy is explicit. A further concurrent change fails comparison again. |
| Permanent deletion | One owner-scoped transaction compares the expected head and deletes the selected plan's entire revision chain and editor drafts. Stale editors cannot save against a deleted head; saved training sessions and training drafts are untouched. No store/version or JSON format changes. |

Archive preserves history and existing drafts. Resolving an archived edit cannot implicitly restore the routine; restore it from the list or preserve the edit as a new copy. Copies leave the original routine/draft available.

## Implementation and checks

- `routines-page.ts` and `person-routines.ts`: person/mode-keyed composition, list, recovery and lifecycle actions.
- `routine-editor.ts/.html` and `routine-editor.store.ts`: form coordination, queued durable writes, validation and conflict decisions.
- `week-editor.ts`, `day-editor.ts`, `routine-exercise-editor.ts`, `set-editor.ts`, `row-actions.ts`: reusable nested controls with ID-based label targets.
- `routine-picker-dialog.ts` reuses the existing picker/detail; `routine-comparison.ts` displays prescriptions with readable units and expandable full snapshot metadata.
- `routine-planning.ts`, `routine.model.ts`, `routines.repository.ts`: pure planning operations and purpose-specific persistence.
- Three colocated spec files cover domain rules, transaction rollback/concurrency, recovery, transitions and component labels. `e2e/routines.spec.ts` verifies production-browser workflows, custom snapshot independence and actual offline operation.

Run full Angular tests and lint/build, then the built food/exercise validators and:

```bash
npx playwright test e2e/routines.spec.ts e2e/custom-exercises.spec.ts e2e/exercises.spec.ts --project=chromium-mobile --project=chromium-desktop
```

Rerun the focused tests and browser scenarios for current results; historical screenshots and session logs are internal.

## Work-unit boundary and continuation

Independent rollback: remove routine editor/list/repository/planning components and their tests together, restore the routine placeholder route and home/exercise availability copy, and revert the routine draft/model additions and these docs as one behavior boundary. Do not reset IndexedDB, delete saved revisions/drafts, or rewrite catalog/artwork bytes. No rollback was performed.

Actual session logging and progress now consume saved revisions through **Entrenar [routine]** and **Registrar entrenamiento / continuar borrador**. See [training/history contracts](training-history.md) for frozen snapshots and separate actual sets/RPE. Selected routine-file exchange is available at [Compartir planes](transfers.md); progress sharing, full backups and PDFs remain later work. WebKit offline internal reload errors and real-device installation are outside this verification boundary.
