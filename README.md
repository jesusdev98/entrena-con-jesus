# Entrena con Jesús

A Spanish-language, local-first Angular application for trainers and clients. **Available:** local profiles, mode switching, client management, durable drafts, offline food/exercise catalogs, person-scoped custom foods/exercises, multiweek routine and meal planning, actual workout and food logging, weekly history, daily activity/energy/macro targets and intake charts, reviewed manual plan/progress file exchange, full-device personal-data backups/restoration and local PDFs for saved routines, meal plans, dated intake and actual workouts.

Public deployment: **https://entrena-con-jesus.vercel.app/**. Vercel serves the application; profiles, plans and progress stay in the browser's local storage. Export a full backup before clearing site data or changing devices.

## Run locally

From the checked-out project directory, use Node 24.19.0 (see `.nvmrc`) and npm 11.17.x:

```bash
npm ci
npm start
```

Open `http://localhost:4200`. Choose **Entrenador** or **Cliente**, enter your name and create your personal workspace. In Trainer mode, **Gestionar personas** creates and edits independent client profiles. The active selector always includes an identity suffix; full UUIDs appear in profiles. **Ajustes** switches modes without deleting people or history. Archiving clients is reversible.

If using WSL, run these commands inside Linux with its Node/npm installation rather than Windows-mounted npm.

## Browse and customize foods

1. Open **Alimentación** from the shared navigation or home page. Search 235 USDA foods by Spanish name, aliases or original description, with accent-insensitive matching. Filter by food group, preparation and origin.
2. Open **Ver detalles** for per-100-g energy/macros, preparation, source version, original description and FDC citation. The gram field is a preview only: it does not record intake. Source calories are preserved, not recalculated from macros.
3. Select the intended person, then **Añadir alimento personalizado**. Enter a name and all four finite, nonnegative per-100-g values; explicit zero and fractional values are supported. An optional reference records where you obtained the values. These foods are labeled as user-provided, without USDA verification.
4. Edit through the food details. **Archivar alimento** is reversible through **Origen → Archivados de esta persona → Restaurar alimento**. Closing an unfinished form retains its draft; reopen the new-food button or the same food's editor to recover it.

Custom foods and drafts belong to stable person IDs, including same-name clients. Mode/person changes flush pending drafts; failed writes stay visible and block draft-losing transitions. Concurrent food edits require a comparison choice. The bundled USDA catalog is shared and read-only. See [food catalog contracts](docs/food-catalog.md).

For offline use, first open **Ajustes** online and wait for **Recursos de esta entrega disponibles sin conexión.** The initial download includes the application's currently bundled resources. Chromium mobile/desktop tests verify first-ever catalog navigation and custom-food save/reload offline at root and subpath. External FDC citation pages still require a connection.

## Browse and customize exercises

Open **Ejercicios** from home or **Rutinas → Explorar ejercicios**. Search 250 Spanish entries by name/alias without accents, combine category/muscle/equipment filters, and open **Ver detalles** for instructions and two ordered illustrated references. Static and partial sequences retain their reviewed labels; each image has its own creator, CC BY-SA license and expandable source/adaptation credits. White artwork is displayed on a dark panel.

1. Select the intended person, then **Añadir ejercicio personalizado**. Name, category and logging type are required: weight/repetitions, bodyweight/repetitions, assistance/repetitions, duration, or distance/duration. Instructions, notes and comma-separated equipment are optional.
2. Custom details show user-provided source labeling and an explicit no-illustration placeholder. Open **Editar ejercicio** to change a saved entry. The shared 250-entry illustrated catalog stays read-only.
3. **Archivar ejercicio** removes it from normal results. Recover it through **Origen → Archivados de esta persona → Restaurar ejercicio**. Custom equipment participates in the existing equipment filter; no muscle metadata is inferred.
4. Close an unfinished form to retain its draft. Reopen the new-exercise button or that exercise's editor to recover it. Switching people/modes flushes drafts to their original owner. Concurrent edits require **Conservar mi borrador** or **Usar versión guardada** after comparison; failed saves retain the draft.

Prepare offline resources in **Ajustes** before disconnecting. Targeted mobile/desktop Chromium tests verify custom save/reload offline at `/` and `/entrena/`, same-name client/mode isolation, archive/restore and 320px forms. Routine planning and actual sessions preserve detached exercise snapshots. See [exercise catalog contracts](docs/exercise-catalog.md).

## Plan routines

Open **Rutinas** for the selected person, then **Crear rutina / recuperar nueva**. Name and organize weeks/days, pick catalog or person-custom exercises, and enter each set's planned repetitions, load/assistance, RIR, rest, duration or distance as appropriate. Every level supports independent duplication and keyboard move controls. **Guardar rutina válida** validates the full plan; incomplete changes remain explicitly labeled drafts with recovery buttons in the list.

Saved routines support edit, duplicate, archive and restore. Revisions retain logical IDs and detached exercise/media credits; duplicates get new instance IDs. Cross-tab changes require explicit comparison, and person/mode changes flush owner-bound drafts. Prepare resources in **Ajustes** for offline create/edit/reload. See [routine planning contracts and recovery](docs/routine-planning.md).

**Descargar PDF de [rutina]** on a saved routine exports that person's selected saved revision as a read-only A4 illustrated handout. It labels all sets as planned, preserves ordered pose references and per-frame credits, and shows a truthful placeholder for custom exercises without images. Use **Abrir o compartir último PDF** if your browser supports sharing/opening it. Wait for the complete offline readiness message in **Ajustes** before downloading offline. See [PDF use, credits and recovery](docs/pdf-exports.md).

## Plan weekly meals

Select a person and open **Planes de comidas** from **Inicio** or the food catalog. Name the plan, organize weeks and days, rename/add breakfast, lunch, dinner or snack groups, then search USDA and person-custom foods by preparation and enter grams. Preview totals scale each food's captured published kcal and macros per 100 g. Every level supports duplication, removal and keyboard move buttons. Incomplete plans remain drafts; saved plans support editing, independent duplication, archive and restore. Cross-tab conflicts require an explicit recovery choice. Prepare offline resources in **Ajustes** before editing offline. **Planning never records consumption** until a meal is marked in **Diario alimentario**. See [meal-plan contracts](docs/meal-plans.md).

## Record actual food and compare targets

Open **Diario alimentario** for the selected person/date. Search a USDA or personal food, enter actual grams and a meal group; incomplete manual entries recover on reload. Alternatively, choose a saved plan's week/day/meal and change actual grams before marking it consumed. Repeated taps do not log it twice. Edit, delete or confirm undo of actual portions without modifying the plan. Each actual entry captures its own source per-100-g values, so later food edits cannot rewrite history.

Four labeled rings show actual calories/protein/carbohydrates/fat against that date's **saved** target, including remaining amounts or excess. Expenditure and goal adjustment are separate, explicitly estimated/manual and provisional as applicable; adding food never recalculates the target. Without a saved daily target the diary displays actual totals and says the target is missing. A Monday–Sunday table compares actual kcal with saved daily targets. **Descargar PDF del consumo real** exports only saved entries on the selected date, with that date's saved target if present. Prepare **Ajustes** resources before working offline. See [food diary contracts](docs/food-diary.md).

## Record actual training and review progress

1. Select the intended person. From **Rutinas**, choose **Entrenar [routine]** or **Registrar entrenamiento / continuar borrador**. Choose the saved revision, plan week/day and local date, then **Iniciar sesión**. The session freezes that prescription and its instructions, illustrations and credits.
2. Enter each set's actual kg/repetitions, assistance, seconds or meters as applicable. Actual values start blank. **Completar serie** requires RPE from 1–10 in half-point steps; repetition exercises also accept optional nonnegative RIR. The original targets stay visible separately.
3. Mark unperformed sets **No realizada** to finish a partial workout without inventing zero values. Incomplete sessions autosave as owner-bound drafts; **Volver conservando borrador** and **Continuar** recover them after navigation or reload. Optional total session minutes are entered manually, including rests.
4. **Finalizar y guardar sesión** commits the session and removes its draft atomically. **Progreso** shows Monday–Sunday weeks, an independent comparison week, exercise and optional exact-date filters, and planned/actual values in readable text. Drafts do not enter history; skipped sets do not count as completed performance.
5. **Corregir sesión** reopens actual values for intentional correction. **Guardar corrección intencional** retains the session identity and original prescription. Cross-tab conflicts show local/durable values and require explicit recovery before saving. Later routine or catalog edits do not rewrite history.

Prepare resources in **Ajustes** before going offline. Training uses the existing local database and cached UI/media; it does not estimate calories or write activity records. See [training and history contracts](docs/training-history.md).

On **Progreso**, choose a week and optionally a date or exercise, then download **PDF de entrenamientos reales**. It compares frozen targets to saved performance and labels skipped sets as not performed. On **Planes de comidas**, download a selected saved plan revision as **PDF del plan**; planned portions are never described as consumed. An optional saved target date is a separate reference only. All four PDF types download locally, including offline after complete resource preparation. See [PDF exports and recovery](docs/pdf-exports.md).

## Track daily activity and targets

1. Complete age, formula sex, height and weight in **Completar perfil**, or select **Gasto diario manual** if the estimate is unavailable. Open **Actividad diaria y objetivos** for the active person and choose a local date. Reload retains the chosen date.
2. Enter total steps, work and training blocks with their own included step counts. Select a sourced, age-compatible MET and duration for each block, or supply a documented manual *net* expenditure. A completed workout can be linked to a training block for the same person/date; select its activity explicitly. An actual group replaces its entire forecast, including explicit zero activity. Extra steps use an editable walking cadence or declared duration.
3. Choose deficit, maintenance or surplus; enter any nonnegative adjustment in kcal and percentages totaling 100. The summary shows daily expenditure, signed adjustment, target and macro grams. Forecast/cadence estimates remain labeled provisional. **Guardar actividad y objetivo** atomically publishes the captured inputs and calculation; incomplete entries remain drafts.
4. Historical dates keep their captured profile, MET sources and calculation even after a profile edit. **Actualizar contexto desde el perfil actual** requires explicit confirmation for an old day. Today's/future drafts adopt a changed profile on reopen; stale commits require refresh. Failed saves and cross-tab conflicts retain recoverable drafts.

Prepare **Ajustes** resources before offline editing. The saved target is compared with actual food in **Diario alimentario**, without changing the original estimate. See [daily activity contracts](docs/daily-activity.md).

## Exchange plans and actual progress by file

For a complete device copy, open **Ajustes → Abrir intercambio y copias completas** and download the JSON. It contains private health and nutrition details for all people and must be protected. On another device, choose the file, review names, stable IDs and counts, then explicitly confirm **replace all local personal data**. Cancellation or a failed transaction leaves existing records untouched. Static catalogs and images are not in the file. See [backup and restore instructions](docs/backups.md).

Select the intended person and open **Compartir planes** from Inicio or Ajustes. Download a selected saved plan as JSON and share it manually. On the receiving device, select the destination person, choose the file, inspect the IDs, versions and added/removed/changed fields, then confirm **accept**, **keep** or **save copy**. Local edits to an imported plan can be exported back for review without matching names or overwriting workout/food records. Plan files contain only the selected plan and referenced personal exercises/foods; bundled catalogs and pictures remain local. Prepare offline resources on both devices first. This is not authenticated identity or a backup. See [plan transfer contracts](docs/transfers.md).

For actual progress, the client selects a range of up to 31 calendar days (both endpoints included) in **Compartir planes** and downloads **progreso JSON**. This includes only saved completed sessions and actual food logs, with no unfinished drafts, prescriptions or daily targets. Choose the intended recipient deliberately: the file may contain health/meal details. The trainer selects the local client first, reviews the file's opaque source IDs, dates and actual metrics, explicitly keeps or replaces each conflict, then confirms import. Unchanged repeats do not duplicate records or overwrite the trainer's plan. Imported progress appears in **Progreso** and **Diario alimentario**; a target is shown only if saved locally for that person/date. Manual exchange works after both devices prepare offline resources; no public upload occurs. See [progress exchange and recovery contracts](docs/transfers.md#return-actual-progress-to-the-trainer).

## Production preview

```bash
npm ci
npm run build
npm run preview
```

Open `http://127.0.0.1:4173/` or `http://127.0.0.1:4173/entrena/`. Stop preview with Ctrl+C. The server only serves static build files; it is not an application backend. Vercel builds with `npm ci` and `npm run build`, then serves `dist/entrena-con-jesus/browser/`. Hash routes and relative resources avoid server route rewrites. The build also includes dependency license notices in `licenses/third-party-code.txt`.

Use `npm run build`, rather than bare `ng build`, to include dependency notices, generate the expected-resource manifest and finalize service-worker hashes. PWA plumbing prefetches current lazy chunks and local assets. The first download can take several minutes on a hosted connection; Ajustes shows how many required resources have been cached and continues while progress is made. Do not disconnect until it reports that all resources are available offline. Readiness checks pass at root and subpath in Chromium and WebKit; Chromium also completes offline reload/edit workflows locally. **WebKit offline reload remains unresolved:** both paths produce `page.reload: WebKit encountered an internal error` after disconnecting. Offline reload on iOS is not guaranteed; real-device installation remains unverified. Development mode does not enable the service worker.

## Check the current delivery

```bash
npm run lint
npm test -- --no-watch --coverage
npm run build
npm run verify:static
npm run test:e2e:chromium
```

| Command | Purpose |
|---|---|
| `npm run lint` | Angular/TypeScript/template accessibility lint |
| `npm test -- --no-watch --coverage` | IndexedDB migrations, identity isolation, rollback, drafts and forms using Vitest/fake-indexeddb |
| `npm run verify:static` | Root/subpath resources, MIME types and generated manifests; starts/stops its own preview |
| `npm run test:e2e:chromium` | Production mobile/desktop browser scenarios; requires functioning local Playwright browsers |
| `npm run test:e2e:chromium -- e2e/foods.spec.ts` | Focused food search, custom-food lifecycle/isolation and offline scenarios |
| `npx playwright test e2e/exercises.spec.ts --project=chromium-mobile` | One targeted exercise browse/keyboard/320px/offline-first subpath smoke |
| `npx playwright test e2e/custom-exercises.spec.ts e2e/exercises.spec.ts --project=chromium-mobile --project=chromium-desktop` | Custom lifecycle, same-name/mode drafts, offline saves at both paths and existing browse smoke; 10 scenarios |
| `npx playwright test e2e/routines.spec.ts --project=chromium-mobile --project=chromium-desktop` | Mixed multiweek editing, duplication, custom snapshots, person/draft isolation, cross-tab comparison and offline create/edit at both paths |
| `npx playwright test e2e/training.spec.ts e2e/routines.spec.ts --project=chromium-mobile --project=chromium-desktop` | Actual metrics, partial completion, corrections, frozen history, person isolation and real offline logging at root/subpath plus routine regressions |
| `npx playwright test e2e/activity.spec.ts --project=chromium-mobile --project=chromium-desktop` | Signed target calculation, completed-session links, historical context, 320px labels and offline save/reload at both paths |
| `npx playwright test e2e/meal-plans.spec.ts --project=chromium-mobile --project=chromium-desktop` | Weekly plan lifecycle, source snapshots, same-name isolation, 320px and offline create/edit at both paths |
| `npx playwright test e2e/transfers.spec.ts --project=chromium-mobile --project=chromium-desktop --workers=1` | Plan and actual-progress round-trips in isolated trainer/client contexts, per-record review, 320px and offline file exchange after each cache is ready |
| `npm run test:e2e` | Includes WebKit; its offline reload still fails at root/subpath with an internal error after cache readiness. Do not treat the complete cross-browser suite as passing |
| `npm run test:foods` | 25 food source-extraction/schema regressions |
| `npm run validate:foods -- --built` | Exact food/source validation plus production catalog/notice bytes and readiness/prefetch hashes; run after build |
| `npm run catalogs:exercises` | Reproduce 250 illustrated exercise entries/500 SVGs from cached pinned sources, preserving food bytes |
| `npm run test:exercises` | Exercise curation, exclusions, SVG safety, provenance, cleanup and cache validation regressions |
| `npm run validate:exercises -- --built` | Exact exercise source/review partition and selected public/built bytes, readiness and worker hashes |
| `npm run icons` | Regenerates original PNG brand icons with Node only |
| `npm run catalogs:mets` | Reproduce 31 unchanged MET values from eight pinned official pages, preserving food/exercise bytes |
| `npm run test:mets` | 21 MET extraction, provenance, value and built-cache regressions |
| `npm run validate:mets -- --built` | Exact primary-source regeneration and built MET catalog/notice/readiness/prefetch hashes |
| `npm run validate:catalogs -- --built` | Complete food, exercise and MET validation; all three gates must pass |

Building and using the bundled catalogs on a clean clone requires only the checked-in `public/` assets. Reproducing or validating the USDA food catalog against original source archives additionally requires locally obtained, hash-pinned files in `.catalog-cache/`; those raw archives are not part of the repository or the Vercel build.

Earlier integrated check on one production build: **327 Angular tests, 21 MET tests, 25 food tests, 29 exercise tests, 1,956 static checks and 110 Chromium scenarios** (55 mobile, 55 desktop) passed with one browser worker. Lint returned exit code 0; the three built catalogs validated. The initial bundle was **357.88 kB raw** (96.57 kB estimated transfer), with **569 required offline resources**. These are historical results before publication packaging changes, not clean-clone verification. They establish Chromium behavior, not WebKit or real-device installation. WebKit still produces an internal error on its first offline reload at both root and subpath, after cache checks pass; the cause is unknown. A previous two-worker activity/training run encountered cache-preparation failures, while a smaller concurrent smoke passed; that discrepancy is unresolved. See [calculation contracts](docs/calculations.md) for the estimate's assumptions.

## Local data and recovery

Profiles and drafts are stored in IndexedDB under the browser origin, not in a remote account. Client mode is a navigation choice, not authentication. Each person and record has a stable identity; names are never used to merge people. Saved profiles get historical revisions. Forms save drafts separately; failures remain visible, and failed drafts block navigation/update reload until a retry succeeds. Concurrent profile edits require an explicit choice instead of silently overwriting a newer version.

Keep the same browser and origin to retain access to local data. Before clearing site data, changing devices or relying on a new deployment origin, [export a full backup](docs/backups.md) and store it safely; the JSON contains private health and nutrition information. Clearing browser site data removes local records. Storage persistence can be requested in Settings, but the browser decides whether to grant it. Plan and progress files are selective exchanges and do not restore the full workspace.

## Continue development

Start with [architecture](docs/architecture.md), [training/history](docs/training-history.md), [calculation contracts](docs/calculations.md), [daily activity](docs/daily-activity.md), [meal planning](docs/meal-plans.md), [file exchange](docs/transfers.md), [full backups](docs/backups.md) and [PDF exports](docs/pdf-exports.md). `src/app/features/training/` supplies actual validation, owner-bound drafts, frozen prescriptions and atomic session corrections; `src/app/features/progress/` derives local-calendar history from saved records. Preserve the existing pure calculations and food/exercise catalogs when extending the app. Keep identifiers, comments and developer documentation in English; user-facing UI and PDF content in Spanish.
