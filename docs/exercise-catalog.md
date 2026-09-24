# Exercise v1: 250 illustrated entries from a pinned local source

**Ejercicios** is available from home and **Rutinas → Explorar ejercicios**, at the lazy `/exercises` route. It combines the read-only **250 Spanish entries and 500 reviewed SVG frames** with the current person's custom exercises. The user approved excluding **47 blocked + 5 unresolved** records from the 302-record Workout Guide snapshot, with expansion deferred. Custom editing and the detached snapshot helper are implemented; [routine planning](routine-planning.md) now consumes them. Actual logs and MET integration remain pending.

## Browse the catalog

1. Search Spanish names/aliases without needing accents. Combine category, muscle and equipment filters; clear them from the empty state if nothing matches.
2. Open **Ver detalles** by touch or keyboard. The dialog shows Spanish instructions/equipment and two ordered references on dark panels, with the supplied static/partial/setup labels. Escape closes it and restores focus to the trigger.
3. Expand **Créditos de esta imagen** for each frame's immutable source, direct adaptation where present, qualified collection credit and exact declared changes. Creator/CC BY-SA links remain visible beside each image. External credit destinations require connectivity; the local license notice is bundled.
4. For first-visit offline browsing, first open **Ajustes** online and wait for **Recursos de esta entrega disponibles sin conexión.** Loading/schema failures offer an explicit retry; missing images keep their labels and credits visible.

The shared catalog does not write personal data. Its page reuses the food feature's Signals/loading, Reactive Forms and CDK dialog patterns. `ExercisePicker` emits a choice; `ExerciseDetail` and `ExercisePosePair` render inputs for later routine-builder reuse. Cards remain compact; the detail renders the full reviewed pair and credits. The person-scoped composition supplies catalog and custom choices without modifying the static catalog count or JSON.

## Custom exercises and detached snapshots

- **Añadir ejercicio personalizado** requires a name, category and one of `weight_reps`, `bodyweight_reps`, `assisted_bodyweight`, `duration`, `distance_duration`. Instructions/notes are optional (up to 1,000 characters each); equipment is optional comma-separated text (up to 500 characters), stored as a deduplicated array. Names allow up to 160 characters. Custom details have an explicit no-illustration placeholder and user-provided source labeling.
- **Editar ejercicio**, **Archivar ejercicio** and **Origen → Archivados de esta persona → Restaurar ejercicio** preserve the UUID. Archives are excluded by the reusable picker unless recovery is explicitly enabled. Equipment participates in filters; custom muscle metadata is not inferred.
- `CustomExercisesRepository` uses the existing `[personId, id]` keys. Save/archive transactions check persisted active ownership and the base timestamp; save validates the stored draft identity/payload and atomically deletes only that draft with the record write. Failures roll back both. No schema version change or destructive reset.
- Editors capture their owner and are recreated by person UUID and mode. Pending writes flush before transitions; failed draft writes block them. Concurrent edits require explicit comparison, with no silent overwrite. Closing/reopening or reloading recovers the person's draft through the same new/edit entry point.
- `exerciseSnapshot(choice)` is pure and deeply detached: reviewed frame order, numbers, labels, hashes, mode/semantics, review metadata, exercise source and **each frame's distinct credits** survive. Custom snapshots retain notes/equipment and `media: null`. Later edits/archive cannot mutate a snapshot. The old start/finish/single-credit media union and hyphenated logging identifiers remain readable; custom editing normalizes the latter without rewriting built-ins or historical snapshots.
- Routine planning now persists these detached snapshots in validated revisions. Actual-session consumers remain pending. No remote images, uploaded media or generated exercise illustrations are offered.

### Browse verification

`npm test -- --no-watch`: **81 tests pass**, including 13 new exercise schema/search/filter/loading/retry/timeout/pose/credit regressions. `npx playwright test e2e/exercises.spec.ts --project=chromium-mobile`: **1 targeted smoke passes** at `/entrena/`, 320px, with keyboard dialog/focus, alias and accent-insensitive search, combined filters, reviewed 3→1/2→3 order, static/partial labels, image decoding and route reload offline. It disconnects only after asserting actual successful cache responses for every required resource and activated service-worker control. The route and details were not opened before disconnect.

Those are the original browse-subunit results. Earlier custom-continuation checks passed **110 Angular tests**, **25 food-data tests**, **29 exercise-data tests**, lint/build and both built validators. `npx playwright test e2e/custom-exercises.spec.ts e2e/exercises.spec.ts --project=chromium-mobile --project=chromium-desktop` covered **10 scenarios**: custom lifecycle/320px, same-name/mode draft isolation, custom save/reload offline at both root/subpath, plus the existing browse smoke in both Chromium projects. Real-device and WebKit custom flows remain unverified.

## Reproduce and verify

Run from the checked-out project directory with its supported Node/npm versions:

```bash
npm ci
npm run catalogs:exercises
npm run test:exercises
npm run validate:exercises
npm run validate:foods
npm run lint
npm run build
npm run validate:exercises -- --built
npm run validate:foods -- --built
npm run verify:static
npm run validate:catalogs -- --built
```

The last command validates foods and exercises, then deliberately exits **1** with an explicit pending-MET message. Normal Angular builds consume the checked-in public files; they do not download or regenerate catalogs. Regeneration requires the existing ignored `.catalog-cache/` intake. Missing or hash-mismatched source files fail locally; no network fallback exists. Do not run the unfinished combined `scripts/catalogs/build.mjs`: it writes an obsolete food schema.

## Counts and download footprint

| Accepted category | Count |
|---|---:|
| Strength | 217 |
| Cardio | 18 |
| Mobility | 5 |
| Stretching | 9 |
| Other (farmer carry) | 1 |
| **Total** | **250** |

- Presentation: **194 position pairs, 38 partial/cyclic sequences, 18 static/setup-to-hold pairs**.
- SVGs: **12,826,826 bytes** for 500 files, preserved byte-for-byte from source.
- Compact catalog JSON: **818,815 bytes**.
- Entire public exercise payload including four notices: **13,648,908 bytes (13.02 MiB)**, before HTTP compression; separate from application/food resources. Selecting two frames per accepted record omits 406 source frames. No lossy geometry processing was introduced.
- Foods remain **235 entries / 112,132 bytes**. The generation checkpoint SHA256 is `4f61cafa56ad04033605fdb6051de2d224cf8e5141318f1a5ef37e6dc5da492b`.

## Source, review and exclusion contract

| File | Authority |
|---|---|
| `scripts/catalogs/exercise-source-lock.json` | Revision `aac599224bb9780305239607ef98540b7e0ce389`; SHA256 of the manifest, all 906 SVGs and original notices |
| `exercises.es.tsv` | Complete 302-row Spanish name/instruction overlay, ordered reviewed pairs and presentation mode; excluded rows remain for future curation |
| `exercise-review-notes.json` | Existing contact-sheet/source-pair notes and detailed labels; semantic review only |
| `exercise-review-policy.json` | Explicit v1 decision and user-supplied final 110 review: pair exceptions, static/cyclic rules, labels and limitations |
| `media-blockers.json` / `exercise-unresolved.json` | 47 blocked and 5 unresolved slugs, disjoint and each carrying an explicit reason |
| `exercise-aliases.es.json` / `exercise-equipment.json` | Existing Spanish aliases and illustrated equipment/support supplements |
| `exercise-inventory.json` | Reproducibly generated source-level inventory of all 302 IDs: accepted/excluded status, reasons, all source frame hashes, selected pair and review provenance; input hashes detect stale derivation |

Paths in this table after the first row are relative to `scripts/catalogs/`. The source manifest itself stays in `.catalog-cache/workout-manifest.json`; source originals and the 26 contact sheets remain ignored and outside `public/`.

Positions 1–192 retain the earlier curated overlay and source-pair notes. Positions 193–302 use the supplied completed read-only review. This continuation did not repeat the full visual review. Three old overlay pairs were corrected: explosive push-up **2→3**, flutter kick **1→2**, seated forward fold **3→2**. Focused checks of existing sheets 193 and 277 informed support-specific wording (low parallettes, suspended ladder variant and agility ladder).

The five unresolved records are `scapular-push-up`, `scapular-pull-up`, `banded-hip-thrust`, `banded-pallof-press`, and `sprawl`. They have no published entries or images. “Unresolved” is not an invented anatomical defect or clinical judgment.

## Published schema and future consumers

`public/catalogs/exercises.es.json` uses `version: 1`, `language: es`, pinned `source`, `licenseNotice` and `entries`:

- Stable upstream `id` (`exercise-<slug>`) and `slug`; Spanish `name`, `aliases`, specific `instruction`, translated `muscles`, equipment **array**, category and existing domain-compatible logging type.
- `source.originalName` and `source.originalEquipment` retain source terminology. An empty alias array means no additional Spanish alias was curated. Bodyweight logging does **not** mean equipment-free; benches, bars, parallettes, rails, anchors and ladders remain explicit.
- `media.frames` contains exactly two **ordered** local paths, original frame numbers, labels, hashes and per-frame attribution. Frame numbers do not imply movement order.
- `media.mode`, `semantics` and Spanish `description` describe how to present the pair. Preserve the labels rather than substituting universal “start/finish” labels. `partial-sequence` explicitly omits the full cycle; `static-references` does not assert a repetition, visible activation or increased range; `setup-to-hold` distinguishes entry from a held posture.
- `media.review` records the source position, evidence kind, ignored contact-sheet name and technical note. Sheet names are provenance references, not runtime URLs.

Examples: negative pull-up **3→1 descends**; bridge march **2→1** shows both feet then one raised foot, not opposite legs; crab-walk drawing orientation is not proof of forward travel; inchworm **2→3** avoids a composite image; arm-circles frame **1** retains its direction arrows. The active-hang pair uses neutral suspension references instead of claiming visible muscle activation.

`ExerciseSnapshot` supports reviewed media and legacy start/finish records. The detached helper is tested and consumed by routine revisions. Future actual-log/PDF consumers must preserve per-frame credits and presentation semantics rather than flattening them silently. The browse UI displays the original white SVGs on a dark surface without filtering or modifying the artwork; no storage migration is part of this UI subunit.

## Attribution and licenses

Every published frame retains Bryl Lim's exact upstream credit and CC BY-SA 4.0 link, an immutable source URL, qualified Everkinetic collection credit and explicit local changes. Direct Everkinetic adaptation URLs/changes are preserved **only where the source attaches them to that frame**; additional Bryl Lim frames are not falsely described as direct traced originals. The catalog also retains exercise-level source attribution.

Public notices: `licenses/exercises-notice.txt`, `workout-guide-LICENSE-ASSETS.txt`, `workout-guide-LICENSES.md.txt`, and `workout-guide-ATTRIBUTION.md.txt`. The latter three are hash-verified source copies. Keep appropriate credits and license links with artwork in future app views/PDFs, and distribute artwork adaptations under CC BY-SA 4.0. The app brand does not replace attribution.

## Validation and cleanup boundary

`exercise-data.mjs` loads only cached sources and validates before publication. Output regeneration is deterministic. Validators compare all public bytes with regenerated expected bytes and check the 302-record partition, 250 unique accepted IDs, 52 reasons, 500 selected frames, reviewed order/labels, complete overlay, equipment/logging fields, provenance and licenses.

SVG validation parses XML and permits only passive SVG drawing elements. It rejects scripts, event handlers, styles, external resources, DTD/entities, foreign namespaces, CSS escapes/comments, animation and unresolved local references. All selected SVG hashes must match the source lock.

Cleanup is confined to `public/exercises/`: both filename and content hash must match the pinned source before an obsolete file can be removed. Unknown, modified, nested or symlink entries fail before publication and remain untouched. Initial cleanup removed **29 stale owned SVG files**. The publisher never removes unrelated files. A before/after byte guard surrounds generation/publication, and an independent food validator proves unchanged source-derived food bytes.

`--built` verifies all 505 public exercise files (catalog, 500 SVGs, four notices), exact readiness membership, prefetch membership and SHA1 worker hashes. Exercise-file sets in disk, readiness and worker manifests must match the selected set exactly. `verify:static` requests the portable build at `/` and `/entrena/`, checks SVG MIME types and requires **all 406 unselected frame URLs** to return 404 at both paths.

Data/assets checkpoint: **29 exercise tests pass**; the data-only build had **531 required resources** and static delivery passed **1,880 checks** at root/subpath. The browse build had **532 resources**; the custom-exercise build has **534**, with the 29 data tests and both built-catalog validators rerun successfully. Data tests include independent pair/semantic fixtures, exclusion/identity mutations, attribution loss, malicious SVGs, source-hash changes, ownership-safe cleanup, byte preservation, idempotent publication and cache-manifest failures. Browser evidence is separately scoped above. Clinical/biomechanical certification, complete technique instruction, MET estimation and real-device cache timing are not claimed.

## Independent work-unit rollback

The rollback boundary is the exercise-only generator/validator/tests and package commands, review policy/unresolved/equipment supplements, generated inventory, public exercise catalog/500 SVGs/four notices, exercise-specific static assertions, and this documentation. Restore prior overlay/review/SVG-validator edits together if rolling back their behavior. The full gate must then explicitly mark exercises pending again. Preserve `foods.es.json`, USDA notice/scripts/UI, source lock/cache, original review evidence and every personal IndexedDB store. No rollback has been performed.

The browse UI has an independent rollback boundary: remove `exercise-catalog-page.ts`, its route/home/routine links, its two specs/fixtures and `e2e/exercises.spec.ts`, and restore the picker/dialog UI adaptations with the matching documentation. Preserve prior model/store/detail/pose scaffolding, public catalog/assets, data tooling, food behavior and all IndexedDB stores. No rollback has been performed.

Custom editing has its own rollback boundary: `custom-exercise-editor.ts/.html/.spec.ts`, `custom-exercises.repository.ts/.spec.ts`, `custom-exercise.spec.ts`, `person-exercise-catalog.ts`, `e2e/custom-exercises.spec.ts`, and their integration changes in the existing page/picker/detail/dialog/models/component tests/docs. Restore the prior read-only composition when removing these behaviors, preserving every personal store, catalog and food file. No rollback has been performed.

Routine planning, MET mappings and actual-log/PDF snapshots are now available. WebKit offline reload remains unverified; see the README for the current limitation.
