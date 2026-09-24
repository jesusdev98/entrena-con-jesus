# Reproduce and validate the offline food catalog

The food-only part of work unit 3 ships **235 generic food/preparation identities**: 213 USDA Foundation records and 22 targeted SR Legacy supplements. The compact catalog is **112,132 bytes**, with 17 source food groups and 26 explicitly cooked entries. App builds and use need no USDA API or raw dataset. Regeneration and exact-source validation need separately obtained, pinned archives in `.catalog-cache/`; those archives are not in a public clone.

## Quick path

Run from the checked-out project directory with its supported Node/npm versions:

```sh
npm ci
npm run catalogs:foods
npm run test:foods
npm run validate:foods
```

`catalogs:foods` writes only `public/catalogs/foods.es.json`. It reads the existing pipe-delimited `scripts/catalogs/foods.es.tsv` overlay and verifies the SHA256 of both ZIPs before parsing them in memory. It never downloads missing inputs: absent or corrupt cache files fail explicitly. `validate:foods` checks the schema and requires byte-for-byte equality with regeneration from the pinned archives and overlay.

After `npm run build`, run `npm run validate:foods -- --built` to compare the shipped catalog/notice bytes and verify their readiness-manifest entries, prefetch membership and service-worker hashes. This also checks the built output for raw dataset leakage; it is static packaging evidence, not browser offline proof.

`validate:catalogs` runs the food validator, then deliberately exits **1** because exercise/assets and MET validation remain pending. The earlier combined `scripts/catalogs/build.mjs` is unfinished and is not the supported food command; it writes exercise assets and emits an older food schema.

## Source and selection review

| Source | Local cache | Release | Selection |
|---|---|---|---|
| USDA Foundation JSON | `.catalog-cache/foundation.zip` | 2026-04-30 | 213 |
| USDA SR Legacy CSV | `.catalog-cache/sr-legacy.zip` | 2018-04 | 22 |

Exact URLs and SHA256 pins are in `food-data.mjs`, the generated catalog's `sources`, and [`public/licenses/usda-fooddata-central.txt`](../public/licenses/usda-fooddata-central.txt). USDA's [official licensing statement](https://fdc.nal.usda.gov/) publishes its data under **CC0 1.0**. The local notice preserves the citation and explains project translations/selection. It is an attribution notice, not a copy of the CC0 legal instrument.

The Foundation selection covers vegetables, fruit, dairy/eggs, cereals, legumes, nuts/seeds, meat, fish, fats and common prepared foods. Useful cultivar, fat-content and preparation differences remain explicit; research samples and multiple analytically equivalent variants are not used to pad the count. SR Legacy fills missing cooked rice, quinoa, pasta, boiled legumes/vegetables, cooked eggs, roasted chicken, dry-heat salmon, olive oil and whole-wheat bread coverage. These are distinct source records, never cooking conversions of raw Foundation values. Foundation alone exceeds 150 entries.

Review `foods.es.tsv` alongside each generated `source.originalDescription`: columns are `dataset|fdcId|Spanish name|preparation`, with no header. Spanish labels retain skin/bone, cultivar, fortification, salt, maturity, draining and cooking qualifications where supplied. `unsweetened` is translated as `sin endulzar`, not a sugar-free claim. USDA groups are translated, not scientifically reclassified (for example, peanuts remain under legumes). Original descriptions/groups are always retained verbatim. Names and normalized original descriptions must be unique.

## Version 1 schema and domain compatibility

| Field | Contract |
|---|---|
| `version`, `language` | Catalog schema `1`, `es` |
| `basis` | 100 grams edible portion; energy in kcal and macros in grams, including liquids |
| `sources[dataset]` | Release, archive filename, official URL and SHA256 |
| `energyPolicy` | Application-selected precedence, with published energy preserved |
| `licenseNotice` | Relative public path `licenses/usda-fooddata-central.txt` |
| `entries[].id`, `name`, `aliases` | Stable `fdc-<id>`, Spanish display label and currently empty alias array |
| `group`, `preparation` | Spanish group; `raw`, `cooked`, `prepared`, `dried`, `frozen` or `unspecified` |
| `per100g` | `{ kcal, protein, carbohydrate, fat }`, finite nonnegative numbers without rounding |
| `source` | String `fdcId`, `dataset`, `version` (`dataset/release`), original description/group, energy nutrient ID/method, water g/100 g or `null`, `CC0-1.0` |

`preparation` is a broad filter, not a complete scientific description. For example, frozen pasteurized raw eggs are `frozen` and retain `crudo` in their name; cooked frozen kale is `cooked`. `unspecified` means the source description did not establish a preparation, not a guess that it is raw. Use the display name and original description together when reviewing qualifications.

The existing `Nutrients` contract in `src/app/features/nutrition/nutrition.model.ts` uses **`carbohydrate` (singular)**. A later consumer can create a compatible `FoodSnapshot` without a schema/storage change:

```ts
const snapshot: FoodSnapshot = {
  foodId: entry.id,
  name: entry.name,
  per100g: { ...entry.per100g },
  source: { fdcId: entry.source.fdcId, version: entry.source.version },
};
```

The UI continuation implements this mapping in `foodSnapshot()` in `src/app/features/nutrition/foods/food.model.ts`. It returns detached nutrient values for later consumers; the diary and meal-plan consumers remain pending. FDC record links use `https://fdc.nal.usda.gov/food-details/<fdcId>/nutrients`; these are citations, not runtime fetch dependencies.

## Food UI and custom-food ownership

The `/nutrition` hash route is available from shared navigation and the home page. `FoodCatalogStore` reads the relative local JSON once, validates its version/basis/nutrients/source identities before publishing it, and exposes loading/error/retry states. The shared picker searches Spanish names, aliases and original descriptions accent-insensitively, with group/preparation/origin filters and an announced empty state. `FoodDetail` presents source energy, preparation, version, original source text and a gram preview. Display rounding never changes stored values or creates intake logs.

Custom foods use the existing `customFoods` store. Optional additive `source: { kind: 'user', note }` and `archived` fields preserve compatibility with existing local records; no migration/reset is needed. New entries require a trimmed name and four finite nonnegative nutrients, including explicit zeros. The source is always user-provided; no FDC identity is fabricated.

| Boundary | Implementation |
|---|---|
| Person identity | Compound `[personId, foodId]` keys; the page recreates its person view by UUID and mode, never by display name |
| Drafts | `custom-food:new` or `custom-food:<id>` under the same owner; incomplete nullable form values remain separate from saved foods |
| Commit | Check persisted active person/mode and owner, optimistic food timestamp, and matching draft in one transaction; write food and delete only its draft atomically |
| Failed saves | Retain the form/draft; draft flush failures block navigation, person/mode switches and update reloads until retry |
| Concurrent changes | Show the saved values and offer explicit keep-draft/use-saved comparison; another intervening change is checked again at commit |
| Archive | Reversible archive/restore through origin filters; values, identity and retained drafts survive |

Earlier mobile/desktop Chromium checks at 320px and both deployment paths covered search, keyboard detail focus, custom create/edit/reopen/archive/restore, same-name client/mode draft isolation, and first-ever catalog navigation plus custom save/reload while offline after real resource readiness. WebKit food flows and real-device installation are not verified.

## Extraction and validation rules

- Read only top-level `FoundationFoods[]`; skip its known `null` element. Never recurse into `inputFoods`, analytical samples or portion records. Re-read JSON from the hash-verified ZIP, rather than trusting a stale parsed-cache copy.
- Resolve nutrients by **`foodNutrients[].nutrient.id`**, not the row's `id`: protein 1003, fat 1004, carbohydrate-by-difference 1005. SR CSV joins use named columns and `nutrient_id`, with units from `nutrient.csv`.
- Select the first present energy nutrient **2048 → 2047 → 1008**: Atwater specific, Atwater general, legacy published energy. This ordering is application policy, not a USDA rule. A present-but-invalid preferred row fails; it is not silently replaced. Nutrient 1062 is kJ and cannot stand in for kcal.
- Require selected energy in kcal and macros in g (case-insensitive). No mg/g conversion, serving-weight scaling, ml-to-g assumption, yield conversion or 4/4/9 replacement occurs. Missing/null/blank/negative/nonfinite amounts and duplicate relevant nutrient rows fail; explicit zero remains valid.
- Exclude explicit `0% moisture`/dry-matter-basis research descriptions, even if another water value exists. Reject zero-water non-oils conservatively. Actual oil can legitimately have zero water: SR olive oil FDC 171413 does, and remains included. Missing water metadata stays `null`.
- Validate count ≥150, ≥12 groups, ≥15 cooked entries, unique IDs/names/descriptions, source identity/version, preparation, numeric values and energy metadata. Exact regeneration additionally verifies every selected ID, original description, nutrient value and unit against its pinned source. Translation quality is reviewed manually, not claimed as a language-detection test.
- Exclude archives/CSV/raw Foundation cache files from `public/`; `.catalog-cache/` remains ignored. Only the compact catalog and local notice are added to public resources. Existing prefetch patterns already include `/catalogs/**` and `/licenses/**`; no browser offline proof is claimed here.

The focused Node tests cover independent rice/chicken values, ID confusion, energy precedence, unit/basis scaling errors, missing and invalid values, duplicates, CSV quoting/joins/empty amounts, cooking claims, research exclusions, oil, schema mutations and checksum failure. Synthetic adversarial metadata in `food-fixtures.mjs` is labeled as such; it is never shipped as source nutrition.

## Remaining boundary and rollback

The food data and food UI/custom-food subunits are implemented. Exercise catalog/UI/custom exercises, MET mappings and units 4–8 remain pending. The original data-only subunit had no browser run; the later food UI runtime evidence is recorded above. Prior WebKit offline failures are unchanged.

Rollback this subunit by removing `food-data.mjs`, `build-foods.mjs`, `validate-foods.mjs`, `food-data.test.mjs`, `food-fixtures.mjs`, the generated food JSON, USDA notice and this guide; revert only this batch's food-label/CSV guard/package-script/full-validator/progress edits. Retain prior intake, overlays, combined builder, exercise artifacts and cached sources. No database or user-data migration is involved.

For the **UI-only rollback**, remove `src/app/features/nutrition/foods/` and `e2e/foods.spec.ts`, and revert its route/home wiring, custom-food model/draft additions and documentation. Preserve the generated catalog, source pipeline and all local IndexedDB records. The shared `NumberField` label-ID correction can remain independently; if reverting that fix, remove its regression assertion and `step="any"` support together with the food UI consumers. This documents a removable work unit; no rollback was performed.
