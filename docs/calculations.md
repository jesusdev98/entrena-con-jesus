# Pure daily energy and macro calculations

**Unit 5a supplies tested calculation functions and a sourced, offline MET catalog.** The calculation payload is detached and immutable, ready for a later activity editor and daily-snapshot repository. No activity/meal UI, food-log writer or daily-snapshot writer is connected yet; the existing 13 stores are unchanged.

## Quick integration path

1. Load `catalogs/activity-mets.json` and pass it through `parseMetCatalog()`.
2. Build an `EnergyInput` from `features/activity/energy-input.ts`. Supply actual or forecast total steps and complete work/training groups, including their allocated steps. Empty groups and zero steps are intentional values.
3. Call `calculateDailyTargets({ energy, signedAdjustmentKcal, macroPercentages }, catalog)`. Catch `CalculationError` by its stable `code`; `message` is Spanish runtime copy.
4. Render rounded numbers only at the display boundary. Keep the returned inputs, formula versions, source references and full-precision results together when the later repository saves a day.

The functions use no Angular, storage, network, PDF or third-party runtime dependency. Static JSON is imported only by tests; production callers will load the bundled catalog through a future feature adapter.

## Calculation method

### 1. Resting estimate and eligibility

`harrisBenedict(profile)` implements revised Harris–Benedict / Roza–Shizgal (1984), identified as `revised-harris-benedict-1984`:

```text
male:   88.362 + 13.397 × W + 4.799 × H − 5.677 × A
female: 447.593 +  9.247 × W + 3.098 × H − 4.330 × A
W = kg; H = cm; A = years; result = kcal/day
```

All profile numbers must be finite and positive; missing fields are not zero. The formula sex is an explicit equation input. This product's combined estimation path starts at age 19: adult METs apply before 60, and only older-adult entries apply from 60 onward. This eligibility rule does not establish individual clinical validity. Profiles outside the estimation scope can explicitly set `estimationScope: 'manual-only'`; incomplete or unsupported profiles receive a manual-expenditure path. There is no body-fat estimate.

The [MUMC equation explainer](https://nutritionalassessment.mumc.nl/en/calculating-energy-expenditure) confirms the coefficients, but its current legend labels height in metres despite the centimetre-scale coefficients. The implementation follows the approved **centimetre** contract and independent fixtures below. The resting/thermic combination is an explicit product approximation, not a claim to reproduce every clinical use of that explainer.

### 2. Forecasts, included steps and distinct time

| Input | Selection and validation |
|---|---|
| `{ forecast, actual }` | Non-null actual replaces the whole forecast, including group blocks and included steps. `0` and an empty group replace a nonzero forecast. `null`/`undefined` remain missing. Neither available is an error for total steps/work/training. |
| `includedSteps` | Separate totals for work and training. Positive allocation needs at least one positive-duration block in that group. All counts and durations are finite/nonnegative. |
| Residual steps | `total − work included − training included`; reject a negative result rather than clamp it. Work/training energy already accounts for their allocated steps. |
| Identity | Block IDs are unique. A nonempty `linkedTrainingSessionId` is allowed only on training and at most once, including zero-duration duplicates. Reject duplicates; never silently choose one. |
| Time budget | Sum selected work, training and residual-walking minutes; reject values above 1440. Zero-minute blocks are allowed but cannot justify included steps or positive manual energy. |
| Optional `interval` | Local-day minute offsets in `[0,1440]`; `end − start` must match minutes (floating-point tolerance `1e-9`). Supplied positive-duration intervals are checked across all kinds; touching boundaries are allowed, overlap is rejected. Cross-midnight blocks must be split by a future adapter. |

**Duration-only blocks assume distinct, non-overlapping periods.** A 1440-minute budget cannot detect two un-timestamped activities performed simultaneously. Results expose `timing.coverage` (`none`, `partial`, `complete`) and the number of checked positive-duration intervals. Partial coverage checks only the supplied intervals; it does not prove the entire day is non-overlapping. A caller must not infer real exercise intervals from session creation/completion timestamps.

### 3. Residual walking

The adult default is **100 steps/min** and **`adult:17170`, 3.0 MET**, representing walking at 2.5 mph on a firm, level surface. `residualSteps / stepsPerMinute` supplies minutes. Cadence must be positive and can be edited; changing cadence changes the duration, not the source MET.

An actual `WalkingInput` with `mode: 'duration'` replaces forecast/cadence minutes. Select a catalog walking code whose source description matches the reported pace and terrain; the code is the explicit pace/intensity override. There is no numerical speed interpolation or inferred MET. Residual steps and duration must agree on zero versus positive activity. If those steps were already counted in work/training, allocate them there instead of adding another walking block.

Older adults must explicitly choose an available older-adult walking code; the adult default is never substituted. Missing coverage offers a full manual TDEE. Cadence-based residual walking keeps the result `provisional`, even if the step total is actual. Otherwise provisional status follows the selected forecasts; all-actual groups plus actual walking duration (or no residual steps) remove that flag without turning an estimate into a measurement.

**Limitation:** manual daily steps are volume, not measured intensity. Applying one code/cadence to scattered daily movement is coarse. [Tudor-Locke et al., walking cadence review](https://bjsm.bmj.com/content/52/12/776) supports roughly 100 steps/min as a heuristic during sustained rhythmic walking, not a claim about every free-living step.

### 4. Gross, net and daily expenditure

```text
gross block kcal = MET × referenceMlO2PerKgMin × kg / 200 × minutes
resting block kcal = BMR / 1440 × minutes
net block kcal = max(0, gross block kcal − resting block kcal)
TDEE = (BMR + sum(net block kcal)) / 0.90
```

| Table namespace | Edition | Oxygen reference | Profile ages |
|---|---|---|---|
| `adult` | 2024 | **3.5 ml O₂/kg/min** | 19–59 |
| `older-adult` / MET60+ | 2024 | **2.7 ml O₂/kg/min** | 60+ |

The source MET is unchanged. Subtracting this person's estimated resting expenditure is a separate accounting operation, not a modification or “correction” of the source MET. There is no global activity multiplier and no derivation from RPE, RIR, tonnage, repetitions or lifted weight. Code `02054` is an explicitly selected activity description, not a calories-per-set rule; use distinct whole-block durations and avoid counting rests twice.

`revised-hb-1984-net-met-v1` retains the fixed `thermicFraction: 0.1`. Division by 0.90 approximates a thermic component equal to 10% of expenditure at energy balance. [Westerterp, Diet induced thermogenesis (2004)](https://pmc.ncbi.nlm.nih.gov/articles/PMC524030/) describes variability and nutrient dependence; v1 does not model either. Logged food never enters `dailyExpenditure()`, so another meal cannot raise the estimate.

### 5. Explicit manual expenditure

- **`manual-tdee`**: positive finite full-day `expenditureKcal` and a required reason/source. It works without profile fields, steps or MET catalog. It is already the total: `thermicFraction: 0`, with **no second division by 0.90**.
- **`manual-net` block**: nonnegative net activity addition *above resting expenditure*, required reason and duration. It fits an otherwise eligible estimated day when an activity is missing from the catalog. No resting subtraction is repeated; the day's usual fixed thermic approximation still applies. Gross wearable calories must not be passed as a net value.

Unsupported age, explicitly unsupported profile, incompatible table and unknown activity receive distinct Spanish errors/manual guidance. The bundled older-adult selection has sparse work coverage and no stretching entry; the adult stretching MET must not be silently reused. Wheelchair and youth tables are not bundled. Manual paths allow later logging without representing these models as validated for those groups.

### 6. Goals, macros and actual intake

`targetKcal = TDEE + signedAdjustmentKcal`: negative for deficit, zero for maintenance, positive for surplus. The amount is freely editable, including fractions. Reject a nonpositive result; do not silently impose a dietary floor.

`macroTargets()` requires finite nonnegative percentages totaling 100 (arithmetic tolerance `1e-9`; no normalization). Protein/carbohydrate grams are their allocated kcal divided by 4; fat grams use 9. Version: `energy-offset-percent-4-4-9-v1`. Zero-percent macros are valid; the daily kcal target itself must be positive. Calculations never round internally.

`targetProgress()` exposes signed remaining, nonnegative remaining and excess independently. Its ring fraction is bounded `[0,1]`; the uncapped ratio is `null` for zero targets or unrepresentable overflow. Zero-target excess remains visible. The future UI should display amounts as well as rings.

`sumFoodPortions()` scales each published per-100-g kcal/protein/carbohydrate/fat independently and retains source energy even when 4/4/9 differs. Empty/zero portions are valid; negative/nonfinite values and arithmetic overflow are rejected. The future diary adapter supplies **actual** portions only. Existing food-preview behavior is unchanged.

## MET catalog provenance and reproduction

The small catalog contains **31 entries: 23 adult and 8 older-adult**. Adult coverage includes common office/standing/cleaning/manual/driving work, walking, running, cycling, resistance and mild stretching. Older coverage includes typing, three walking paces, running, stationary cycling and two resistance activities. Labels are Spanish curation; original descriptions are retained with whitespace normalized. MPH source labels are intentionally retained rather than changing numeric pace ranges during translation.

Primary pages retrieved **2026-09-19**:

- [Occupation](https://pacompendium.com/occupation/), [walking](https://pacompendium.com/walking/), [conditioning exercise](https://pacompendium.com/conditioning-exercise/), [running](https://pacompendium.com/running/), [bicycling](https://pacompendium.com/bicycling/).
- [Adult applicability](https://pacompendium.com/adult-compendium/), [older-adult table and 2.7 baseline](https://pacompendium.com/older-adult-compendium/), [terms, 3.5 baseline and publication citations](https://pacompendium.com/).

The official terms expressly allow free commercial use with citation and request unchanged MET values/no combining different MET levels. This is source-specific permission, not a claimed Creative Commons license. `public/licenses/compendium.txt` includes the website and the Herrmann/Willis 2024 journal citations. Each entry preserves table+code identity, edition, exact MET, oxygen reference, source URL, source SHA256, retrieval date, description, citation and red-mark/estimated status.

| Pipeline boundary | Files and behavior |
|---|---|
| Sanitized evidence | `scripts/catalogs/met-sources/*.html`: eight retained primary-page snapshots; never served. The home snapshot's unrelated hidden form token is replaced by an inert marker; source tables and page text are preserved. |
| Source pins | `met-source-lock.json`: URLs, edition, date, SHA256. `intake-mets.mjs` is explicit initial intake and refuses an existing lock; source updates require deliberate review. |
| Selection | `mets.es.tsv`: table/page/code/category/Spanish label only. Numeric METs are extracted, not authored in the overlay. |
| Extract/build | `met-data.mjs`, `build-mets.mjs`: parse source table cells with existing development-only jsdom, reject malformed/duplicate rows, verify pins, and write only MET catalog/notice. Food/exercise catalog bytes are guarded. |
| Runtime boundary | `activity/met-catalog.ts`: dependency-free structural/identity/table/source checks and age-compatible resolution. Exact-source integrity is proven by the offline build validator, not claimed from a structural parser alone. |
| Validation | `validate-mets.mjs`: exact regeneration plus notices, raw-source exclusion and optional built-byte/readiness/prefetch/SHA1 proof. `validate:catalogs` now runs food, exercise and MET validators and succeeds only when all pass. |

The bounded sanitizer (`sanitize-met-sources.mjs`) accepts exactly one JWT-shaped candidate with a valid JSON header and payload in the designated hidden home-page field and updates only that snapshot and its SHA256 pin. Its classifier checks decoded JWT headers, so CSS strings with dots remain untouched. The marker is not a runtime credential; the original token's signature validity and credential status were not established.

Normal generation, tests, validation, build and app use need no network/API key:

```bash
npm ci
npm run catalogs:mets
npm run test:mets
npm run validate:mets
npm test -- --no-watch
npm run lint
npm run build
npm run validate:catalogs -- --built
```

The generated MET JSON is **22,055 bytes**. Build/readiness/worker hashes include it and its notice. These checks prove packaging; they are not a new browser offline-use claim. Never use the old combined `scripts/catalogs/build.mjs` for this work: it would overwrite unrelated food/exercise output schemas.

## Independent fixtures and verification

`energy.spec.ts` imports the actual bundled MET and food JSON. Expected values below were independently supplied before implementation; comparisons use absolute **1e-6** arithmetic tolerance, not clinical-accuracy claims.

| Fixture | Expected |
|---|---|
| Male, 80 kg / 180 cm / 30 y | BMR **1853.632** |
| Female, 60 kg / 165 cm / 40 y | BMR **1340.383** |
| Male; work 240 min `11115`/2.5; training 60 min `02054`/3.5; 7600−3000−600 residual steps | 4000 steps / 40 walking minutes; net **864.336888888889**; TDEE **3019.965432098765** |
| Above, adjustment −300 / +450 | Target **2719.965432098765 / 3469.965432098765** |
| Deficit target, 25/50/25 | P **169.997839506173**, C **339.995679012346**, F **75.554595336077 g** |
| Replace training forecast 60 min with actual 30 min | TDEE **2899.540246913580** |
| Male, explicit zero activity | TDEE **2059.591111111111** |
| Older `1717060`, 4.5 MET60+, 70 kg / 30 min | Gross **127.575**, not 165.375 kcal |
| Raw rice FDC 2512381, 37.5 g + raw chicken FDC 2646170, 175 g | **334.75 kcal**, P **42.015**, C **30.1125**, F **3.76375 g** |

Earlier unit5a checks passed **248 Angular tests (187 baseline + 61 calculation cases), 21 MET source tests, 25 food and 29 exercise data regressions**, lint, production build and the complete built-catalog validator. Source tests cover representative values, nested markup/entities, malformed/duplicate rows, metadata mutations, reproducibility and broken built-cache manifests. Domain cases cover replacement, zeros/missing values, unsupported/manual paths, deduplication, time/step errors, intervals, nonfinite values/overflow, immutability and excesses.

## Daily activity adapter and later diary boundary

1. **Daily editor (implemented):** actual/forecast groups are separate; actual replaces the selected group. Included steps, sourced MET table/edition/oxygen reference, cadence and provisional status are visible. Users choose a pinned code rather than entering a numeric MET.
2. **Session adapter (implemented):** links completed sessions by stable ID and the selected owner/date. Null duration stays missing; RPE, sets and lifted load never infer energy. Manual session duration seeds a block but the user selects its MET or supplies documented net energy.
3. **Snapshot repository (implemented):** person ID, local date, profile revision, source catalog, calculation version, detached input/result and record version are stored in `dailySnapshots`, atomically consuming the matching `drafts` entry. Today's/future context refreshes on reopen; old days retain the captured context unless explicitly refreshed. `activity.model.ts` contains legacy foundation declarations; the current payload is `daily-target.model.ts`. See [daily activity contracts](daily-activity.md).
4. **Meal/diary consumer:** use detached food snapshots; actual consumption alone feeds intake, remaining/excess and rings. Consumption must not alter expenditure. Plans and consumption receipts stay separate.

### Independent rollback boundary

Remove `features/nutrition/calculations/`, `activity/energy-input.ts`, `activity/met-catalog.ts`, MET-only scripts/source snapshots/lock/selection, and the generated MET catalog/notice together. Revert the added package commands, full-gate integration, spec-only JSON import setting and their docs. Rebuild generated `dist` output. This removes only unit5a behavior; retain the existing 13 stores, activity foundation declarations, training/routines/history, food/exercise catalogs and UI. No rollback was performed.

Browser/runtime UI harness for this boundary: **N/A — pure calculations and data only**. Historical Chromium evidence remains 54 distinct passing cases across recorded runs, not one all-green invocation; WebKit offline internal errors are outside this unit.
