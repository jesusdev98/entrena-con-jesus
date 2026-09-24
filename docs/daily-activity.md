# Daily activity and target snapshots

**The daily editor publishes one owner/date-bound energy and macro target using the existing pure calculator.** Open **Actividad diaria y objetivos**, complete the profile or choose a manual daily expenditure, enter a local date and save. The selected date stays in the route URL for reload. The [food diary](food-diary.md) reads the saved result without recalculating it when food is logged.

## Editing a day

| Input | Behavior |
|---|---|
| Steps | Manual total includes steps already counted in work/training. The remainder uses the selected walking code and cadence (100 steps/min initially), or declared walking duration. Negative residuals are rejected. |
| Work/training | Each group has an optional full-day forecast and actual value; actual, including explicit zero, replaces its forecast. Include steps and duration for each distinct block. MET codes come from the bundled adult/older-adult source table, or enter a sourced manual **net** block. |
| Completed session | Link only a completed workout on this person/date, once per selected training group. Its stable `session.id` survives corrections. A recorded total duration can seed minutes; select the real activity yourself. No calorie inference from sets or RPE. |
| Goal/macros | Loss subtracts the chosen nonnegative kcal amount, gain adds it and maintenance uses zero. Protein/carbohydrate/fat percentages must sum to 100; grams use 4/4/9 kcal per gram. |
| Manual total | A positive, reasoned full-day expenditure bypasses the profile and MET estimator; it already includes any thermic allowance. |

The summary labels forecasts or cadence-only walking as provisional, even when other inputs are actual. The estimated path uses the captured revised Harris–Benedict profile, sourced table-specific oxygen references and fixed thermic approximation described in [calculation contracts](calculations.md). Duration-only blocks assume separate periods; no measured overlap is claimed.

## Saved-day boundary

`activity-editor.store.ts` owns the displayed local draft and serializes draft writes; `daily-target.repository.ts` checks the active owner, entire durable draft and saved base in one IndexedDB transaction. Saving validates completed-session links, writes the new version of the unique `dailySnapshots` person/date entry and removes only this draft atomically. Failure retains the draft; cross-tab changes require comparison and explicit recovery. The diary reads this saved snapshot by person/date for its intake comparison; diary edits never write `dailySnapshots`.

Each snapshot detaches the editable activity, captured profile revision and MET catalog, engine request and full-precision result. Past dates retain the original calculation context on open and explicit correction; the user can confirm a context refresh for just one historical day. Today's and future drafts adopt a changed profile on reopen, retaining actual inputs and day-specific overrides. A stale current-day/future profile cannot be committed without refresh. Profile changes never silently republish an existing target. Existing personal stores and saved training sessions remain intact.

## Verify and rollback

Focused tests: `npm test -- --no-watch --include src/app/features/activity/daily-target.spec.ts --include src/app/features/activity/daily-target.repository.spec.ts --include src/app/features/activity/activity-editor.spec.ts`. Production browser path: `npx playwright test e2e/activity.spec.ts --project=chromium-mobile --project=chromium-desktop` after `npm run build`; the offline cases check an activated controlling worker and every cached required resource before disconnecting.

Independent rollback boundary: remove the unit5b daily editor, page, models, repository, store, components, fixtures and tests under `features/activity/` (retain `energy-input.ts`, `met-catalog.ts` and legacy `activity.model.ts` from earlier units); remove its route/home link, shared nullable number adapter if unused, E2E scenario and unit5b documentation. Preserve all 13 stores, historical saved data and unit5a pure calculations/catalog; no rollback or database reset was performed.
