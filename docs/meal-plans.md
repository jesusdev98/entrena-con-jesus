# Plan weekly meals without recording intake

The **Planes de comidas** page builds named, person-owned plans with ordered weeks, days, meal groups and portions. Saved plans contain planned amounts only: creating or changing one does not write `foodLogs` or contribute to daily intake charts. A separate [food diary](food-diary.md) can copy a saved meal into actual intake once, without mutating this plan.

## Use the editor

1. Select the intended person, then open **Planes de comidas** from **Inicio** or **Planificar comidas semanales** from **Alimentación**.
2. Create a plan; rename or add weeks, days and meal groups. Each new day starts with breakfast, lunch, dinner and snacks. Search the bundled or current person's custom foods, choose the intended preparation and enter grams. Preview energy uses the food's **published kcal per 100 g**, independently of its macro values.
3. Duplicate or reorder any level with the labeled move buttons. Save a complete plan; unfinished grams or missing labels remain recoverable drafts. From the list, edit, duplicate to an independent plan, archive or restore. Reopen drafts by their named recovery buttons.
4. To remove a plan permanently, choose **Eliminar definitivamente [plan]**, read the irreversible warning and confirm. Cancellation makes no changes. Archive is reversible; permanent deletion removes all revisions and matching editor drafts from both lists. Saved real intake, receipt undo and actual-history PDFs still work. The deleted or archived plan has no plan PDF. A former source ID in a receipt is retained as provenance, not a live plan; only an explicit new import can create another linked plan.

## Persistence and conflicts

| Boundary | Behavior |
|---|---|
| Identity | Person and plan UUIDs, never display names. The active person/mode is checked inside writes. |
| Saved revisions | Append-only `mealPlanRevisions` retain the same plan ID and a parent revision ID. Stale/divergent/incomplete heads require review; archive and restore are revisions. |
| Food values | Each planned portion retains a detached `FoodSnapshot` with source identity and per-100-g values. Later custom food edits do not rewrite an existing plan; deep duplication gives every week/day/meal/portion a new ID. |
| Incomplete edits | `drafts` persist nullable grams. Full-payload compare-and-swap detects another tab's changes even within the same clock tick. Draft deletion and revision addition share one transaction; failed writes retain the draft. |
| Actual consumption | This plan editor writes no `foodLogs` or `mealConsumptions`. The diary transfers a meal as an independent, dated actual record with an idempotent receipt. |
| Permanent deletion | A single owner-scoped transaction checks the expected head, removes all revisions and matching plan editor drafts, and leaves actual logs, receipts and daily snapshots intact. A stale editor cannot save against a deleted head. No database migration or JSON format change. |

## Verify and rollback

Run `npm test -- --no-watch`, `npm run lint`, `npm run build`, `npm run validate:catalogs -- --built`, and targeted `npx playwright test e2e/meal-plans.spec.ts --project=chromium-mobile --project=chromium-desktop` after loading the local NVM environment. Production offline tests wait for an activated controlling worker and successful cache checks before disconnecting.

Independent behavior rollback removes `src/app/features/nutrition/meal-plans/`, its `DraftPayload` variant, the `/meal-plans` route, home/food-catalog links, its E2E test and matching docs. Preserve the existing typed stores and all personal records; removal of UI does not require a database reset or erase saved plans. Selected plan exchange is described in [transfers](transfers.md); progress exchange, full backups and PDF exports remain pending.
