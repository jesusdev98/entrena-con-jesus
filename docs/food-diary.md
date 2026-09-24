# Record actual food intake

**Diario alimentario** (`/diary`) records dated, person-owned food consumption separately from planned meals. The four rings compare **actual** published-food kcal and macros with the **saved** activity target for that same person and date. Missing targets remain explicitly missing.

## Quick path

1. Select the person and date. Search a USDA or this person's custom food, choose its origin, enter positive grams and a meal label, then **Registrar alimento consumido**. Unfinished manual entries and actual-entry corrections are saved as person/date-bound drafts.
2. To transfer a plan, choose its saved week/day/meal; adjust each actual gram amount and mark consumed. The meal's detached snapshot and source IDs go into actual logs. Repeating the action returns the existing receipt, even after a plan revision; undo removes its linked actual entries but retains the receipt to prevent an accidental second transfer. Add a manual entry if another serving was eaten.
3. Edit or delete an actual portion, or confirm undo for a transferred meal. None of these actions edits the plan. A daily target appears only after **Actividad diaria y objetivos** is explicitly saved for this date.

## Reading the summary

| Value | Meaning |
|---|---|
| Consumed | Sum of dated `foodLogs`, using each captured food's **published kcal per 100 g** independently of its protein/carbohydrate/fat. |
| Target | Saved `dailySnapshots` energy and 4/4/9-derived gram targets; never recalculated when logging food. Missing and a zero macro target differ. |
| Expenditure | Separate estimated or user-entered daily expenditure, with provisional/assumption labeling inherited from the saved snapshot. Not a measured burn. |
| Remaining/excess | Signed target minus consumed; negative values are shown as **Exceso**, including zero targets and ring values above 100%. SVG rings cap their painted arc at 100%, while numeric labels retain the full excess. |
| Weekly table | Monday–Sunday actual kcal and each date's saved kcal target; missing daily targets are shown individually. An optional selected plan week appears as a **reference by day position** only. Plans are undated templates; no calendar-day assignment is inferred from weekday names. |

## Durability and recovery

`diary.repository.ts` checks the active UUID/mode in every write transaction. Manual and correction draft compare-and-swap and actual-row full-base comparisons reject stale tabs. Manual add consumes its draft in the **same transaction** as its log insert; correcting an actual log clears its edit draft in the same transaction while preserving any unfinished manual portion. A meal transfer validates the current saved plan revision and adds the receipt and each portion in one transaction; its stable plan/meal identity is checked across revisions. Undo retains the receipt and removes only its linked actual logs. Failed/quota-exceeded transactions roll back together. Custom/catalog edits do not modify captured food snapshots; historical daily targets remain detached. No schema migration or plan/activity writer is required.

## Verify and rollback

From the checkout, run `npm test -- --no-watch`, `npm run lint`, `npm run build`, `npm run validate:catalogs -- --built` and the targeted Chromium diary and meal-plan scenarios. Offline scenarios require an activated controlling worker and verified cached resources before disconnecting.

Independent behavior rollback removes `src/app/features/nutrition/diary/`, its `DraftPayload` variant, the `/diary` route and home/food/meal-plan links, its browser scenario and this documentation. Preserve all 13 stores and existing personal data: deleting a UI must never clear actual logs or receipts. Transfers/backups and PDFs remain separate units.
