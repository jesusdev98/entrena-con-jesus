# Download read-only PDFs

Select the intended person before downloading. Three additional exports are available alongside the illustrated saved-routine handout:

| Open | Download | What it represents |
|---|---|---|
| **Planes de comidas** | **Descargar PDF del plan [nombre]** on a saved plan card | The selected saved revision's *planned* weeks, days, meal groups, grams, published kcal and macronutrients. An optional date supplies an independent saved-target reference; it never assigns the plan to a consumption date. |
| **Diario alimentario** | **Descargar PDF del consumo real de [fecha]** | Actual saved food entries on the selected local date, captured source kcal/macros per 100 g scaled by actual grams. If a daily target was saved for that person/date, shows target, remaining or excess and estimated/manual expenditure separately; otherwise states that no target exists. |
| **Progreso** | **Descargar PDF de entrenamientos reales de la semana** | Completed sessions in the selected Monday–Sunday week, with optional exact date and exercise filter, frozen prescription versus recorded sets, RPE/RIR, duration and distance; skipped sets are explicitly *not performed*. |

Each screen shows preparation, download success or a visible error. Only saved records are exported: empty actual selections cannot be downloaded. The **Abrir o compartir último PDF** button offers file sharing where supported, then open/download fallback for the current selection. These three files have text tables without exercise illustrations, so no media credits are necessary. An A4 branded layout uses bundled Roboto, a faint watermark, approximately 15 mm margins and page numbers; long tables repeat contextual headings across pages and retain whole rows. Published food kcal can differ from 4/4/9-derived macro targets. Files contain personal details and are not editable exchange files.

## Illustrated routine handout

Select the intended person, open **Rutinas**, save the plan, then choose **Descargar PDF de [nombre]** on its saved card. The file is generated on your device, including the selected revision's exercise snapshots, two ordered local poses where available, prescriptions, week/day labels and an attribution section. **Abrir o compartir último PDF** offers native file sharing when supported, otherwise opens the PDF or downloads it again.

## Reading the PDF

| Area | Meaning |
|---|---|
| Plan previsto | Repetition ranges, rest and target RIR are goals. No completed sets or weights are inferred. |
| Pose pair | Frame numbers and phase labels retain their original reviewed order and semantics; white original SVG drawings appear over graphite panels. |
| Custom exercise | Explicitly says when no illustration exists. |
| Créditos | Only frames actually used by the plan appear, with file source, creator, CC BY-SA 4.0 license/link, local changes, collection-level base and direct adaptation details **only where supplied**. The brand watermark is separate. |

The PDF uses A4, roughly 15 mm margins, bundled Roboto fonts with Spanish glyphs, a low-opacity watermark and numbered pages. Blocks keep each pose pair together; long notes and sets can continue onto subsequent pages. If the embedded SVG renderer cannot handle a published frame, the browser renders that same local SVG to a dark-backed PNG for the PDF and reports the conversion in the success message. Text remains selectable. The file contains personal names and training details; share it deliberately.

## Offline and recovery

Before disconnecting, open **Ajustes** and wait for **Recursos de esta entrega disponibles sin conexión.** The service worker prefetches the lazy pdfmake and bundled-font chunks, catalog and selected illustrations at root and subpath. Export reads the saved person-owned revision again and only requests hash-matched, allowlisted published SVG files; unsupported imported paths and modified assets fail visibly without issuing remote media requests. A missing resource or generation error leaves the routine untouched. The downloaded filename excludes untrusted path characters.

PDF creation does not write any personal database store. JSON plan/progress transfer remains the editable exchange format; all PDFs are read-only handouts. Prepare offline resources in **Ajustes** before disconnecting, then generate any of the four PDF types from saved data. Person and selected date/filter are checked before and after asynchronous generation.

## Verify and rollback

Run `npm test -- --no-watch`, `npm run lint`, `npm run build`, `npm run validate:catalogs -- --built`, then `npx playwright test e2e/routine-pdf.spec.ts --project=chromium-mobile --workers=1` (and `chromium-desktop`). The browser suite downloads a real file offline after active-worker and complete-cache proof at both `/` and `/entrena/` and checks the PDF header, page objects and embedded fonts. Its long-plan case checks a real multipage PDF; a PDF reader was also used to inspect rendered pages, glyphs, attribution and unbroken image pairs. Native-device sharing and the local raster fallback were not exercised in those runs.

Unit 7a owns `src/app/features/pdf/routine-document.ts`, `pdf-export.ts` and the routine export/share controls and browser spec. The three exports below depend on its shared local PDF renderer; preserve those files when rolling back only 7b. Retain the 13 stores, saved routines, pinned catalog and original SVG files; no database migration or catalog regeneration is involved.

The independent 7b rollback boundary is `document-style.ts`, `meal-document.ts`, `nutrition-document.ts`, `training-document.ts`, `progress-export.ts`, `progress-documents.spec.ts` under `src/app/features/pdf/`; controls in `src/app/features/nutrition/meal-plans/person-meal-plans.ts`, `src/app/features/nutrition/diary/person-diary.ts` and `.html`, `src/app/features/progress/person-progress.ts` and `.html`, the updated settings copy, `e2e/progress-pdf.spec.ts` and related documentation. Keep unit 7a `routine-document.ts`, `pdf-export.ts`, its SVGs/credits and saved records. Run `npx playwright test e2e/progress-pdf.spec.ts --project=chromium-mobile --workers=1`, then the desktop project, after the full Angular/lint/build/built-catalog checks.
