# Damage Progression UI/UX Plan

## Context

- Project: Pokemon Champions Damage Calculator.
- Current production version: V3.13.0.
- Current focus: Reg.M-B Mega Pokemon / ability support shipped as V3.13.0.
- The user found the `イベント追加` -> `即時HP` group hard to use.
- Desired direction: move one-off HP adjustment affordances into `背景効果`, support both attacker and defender, and make regeneration recovery presets easier to access.

## Design Direction

- Keep `イベント時系列` focused on actions where order matters:
  - attack entries from `+ 加算`
  - incoming damage
  - pain split
  - berry re-arm
  - leech seed ticks
- Move broad one-off HP adjustment into `背景効果`.
- Rename `即時HP` to a clearer concept: `HP直接補正`.
- Add side-specific background controls:
  - attacker damage/recovery
  - defender damage/recovery
- Add `再生回復` presets for both sides:
  - `1/3`
  - `1/2`
  - `2/3`

## Implementation Notes

- Preserve existing defender-only background fields for compatibility:
  - `constDmg`
  - `constRec`
  - `constRecBerry`
  - `poisonTurns`
- Add new explicit HP adjustment fields rather than repurposing existing passive/berry fields.
- Update tab snapshot persistence so new fields survive tab switching and reload.
- Update battle sequence calculation so attacker-side HP adjustment enables sequence output.
- Update accumulated damage calculation so defender-side direct HP adjustment affects defender KO summary.
- Keep old timeline event kinds renderable for saved states, but remove their primary add buttons from `イベント追加`.

## Verification

- Run TypeScript typecheck.
- Run lint.
- Run targeted tests, then full tests if time permits.
- Use the in-app Browser to inspect the damage progression panel after changes.

## Current Status

- Added side-specific `HP直接補正` controls under `背景効果`.
- Added `再生回復` preset buttons for `1/3`, `1/2`, and `2/3` recovery.
- Removed the primary `即時HP` add buttons from `イベント追加`.
- Kept old direct HP timeline event rendering for saved session compatibility.
- Added store fields, tab snapshot persistence, accumulated damage integration, battle sequence integration, and export text support.
- Added focused progression store tests for direct HP adjustments and snapshot restore behavior.
- Renamed turn progression `被ダメ` UI labels to `攻撃側被ダメ`.
- Fixed a post-V3.12.1 battle sequence output issue where attacker-only faint outcomes were tracked internally but missing from the final summary display.

## 2026-06-16 UI/UX Polish Follow-Up

### User Request

- Implement the previously deferred next candidates:
  - tab operation improvements
  - Pokemon search improvements
  - SP cap warning feedback
  - move metadata chips
- Merge the completed work to production.

### Implemented Scope

- Session tabs:
  - Added proper `tablist` / `tab` semantics.
  - Added keyboard navigation: ArrowLeft/ArrowRight, Home/End, Enter/Space, F2, Delete/Backspace, ContextMenu/Shift+F10.
  - Added focus restoration after create, duplicate, close, and switch operations.
  - Added per-tab `...` menu for touch users.
  - Added menu actions for rename, duplicate, move left, move right, and close.
  - Preserved existing drag-and-drop reorder behavior.
- Pokemon search:
  - Added debounce-aware `isSearching` and `searchedQuery` state to avoid stale no-results flicker.
  - Added loading and no-results rows.
  - Added Escape handling even when no results are shown.
  - Added IME-safe Enter handling.
  - Added query clear behavior.
  - Added non-destructive selected Pokemon clear via `clearPokemonSelection`, instead of full panel `reset`.
- SP feedback:
  - Kept existing store validation as the source of truth: `setSp` still rejects totals over `SP_MAX_TOTAL`.
  - Added UI feedback when an attempted SP increase is blocked by the total cap.
  - Added `残0` / remaining-increment hints and a short warning message.
  - Improved defensive over-cap wording in the SP total row.
- Move chips:
  - Added `MoveMetaChips`.
  - Displayed type, category, power, and multi-hit metadata in move search results and selected move slots.
  - Supports power options (`60/120`), escalating powers (`20→40→60`), fixed hits, and variable hits.

### Changed Files

- `src/presentation/components/session/SessionTabsBar.tsx`
- `src/presentation/components/pokemon/PokemonSearch.tsx`
- `src/presentation/hooks/usePokemonSearch.ts`
- `src/presentation/store/pokemonStore.ts`
- `src/presentation/components/pokemon/PokemonPanel.tsx`
- `src/presentation/components/pokemon/SpSlider.tsx`
- `src/presentation/components/pokemon/SpDistribution.tsx`
- `src/presentation/components/moves/MoveMetaChips.tsx`
- `src/presentation/components/moves/MoveSelect.tsx`
- `src/presentation/components/moves/MoveSlots.tsx`

### Validation

- Local checks:
  - `npm run build`
  - `npm run lint`
  - `npm test -- --run` (164 tests passed)
- Browser QA:
  - Local URL: `http://127.0.0.1:5174/pokemon-champions-damage-calc/`
  - Verified tab create/focus, keyboard tab navigation, tab menu, duplicate action.
  - Verified Pokemon search no-results and query clear.
  - Verified selected Pokemon clear does not full-reset the panel.
  - Verified SP cap warning appears when an over-cap increase is attempted.
  - Verified move chips render in selected move slots.
  - Verified 390px mobile width has no full-page horizontal overflow and the tab menu stays within the viewport.

### GitHub / Production

- Work branch: `codex/ui-polish-tabs-search-sp-moves`
- Local commit: `d332419 Improve tabs search SP feedback and move chips`
- PR: `https://github.com/AdvanceHacker9361/pokemon-champions-damage-calc/pull/62`
- Merge method: squash merge
- main merge commit: `fe6df45aafcb93d7abfee83cd1eb54a922d7872a`
- Merged at: `2026-06-16T08:39:28Z`
- GitHub Actions after merge:
  - `CI`: success
  - `Deploy to GitHub Pages`: success
- Production URL remains:
  - `https://advancehacker9361.github.io/pokemon-champions-damage-calc/`

### Notes For Next Session

- The app version was bumped to `v3.12.3` after the UI polish pass.
- GitHub Actions emitted Node.js 20 deprecation warnings for GitHub-hosted actions, but checks and Pages deployment succeeded.
- Local branch after merge remained `codex/ui-polish-tabs-search-sp-moves`.
- Untracked local files were intentionally left untouched:
  - `.codex-remote-attachments/`
  - `.codex/`
  - `AGENTS.md`
  - `pokemon-champions-data-completeness-strategy.md`
  - `src/data/raw/`
  - `乱数幅の変更（Champions固有仕様）.md`

## 2026-06-17 Reg.M-B Metronome Item Support

### User Request

- Reg.M-B leak/update context indicates `メトロノーム` is likely relevant for implementation.
- Confirm the item behavior and implement it as a manual damage multiplier.
- When the held item is `メトロノーム`, show `×1.0`, `×1.2`, `×1.4`, `×1.6`, `×1.8`, and `×2.0` buttons below the `持ち物` / `状態異常` area.
- Deploy the completed update to production.

### Confirmed Spec

- Metronome held item boosts the power of a move used consecutively by the holder.
- From Generation V onward, each previous consecutive successful use adds 20% power, capped at +100%.
- Manual calculator states map to:
  - first use: `×1.0`
  - second use: `×1.2`
  - third use: `×1.4`
  - fourth use: `×1.6`
  - fifth use: `×1.8`
  - sixth and later use: `×2.0`

### Implemented Scope

- Added `metronomeMultiplier` to `PokemonStore`, defaulting to `1`.
- Reset `metronomeMultiplier` to `1` when the held item is changed away from `メトロノーム`.
- Added `setMetronomeMultiplier`, clamped to the safe range `1.0` through `2.0`.
- Added conditional UI in `PokemonPanel`:
  - shown only when `store.itemName === 'メトロノーム'`
  - placed directly below `状態異常`
  - uses the existing compact segmented-button visual language.
- Passed the multiplier through:
  - `CalculateDamageUseCase`
  - `CalculateMoveResultsUseCase`
  - `useDamageCalc`
  - `useBattleSequence`
  - tab snapshots via `sessionSnapshot`
  - attack/defense swapping via `Calculator.swapStores`
- Applied the multiplier in `DamageCalculator.resolvePower` only when `attackerItem === 'メトロノーム'`.
- Added regression tests verifying:
  - `メトロノーム` with `×2.0` equals doubled base power.
  - the multiplier is ignored when the held item is not `メトロノーム`.

### Validation

- `npm run typecheck`
- `npm run lint`
- `npm run test -- --run tests/domain/DamageCalculator.test.ts`
- `npm run build`

### Notes

- `items.json` already contained `メトロノーム`, so no item data addition was needed.
- The multiplier is modeled as manual state rather than automatic turn counting, matching the app's current approach for conditional battle context.

## 2026-06-17 Reg.M-B New Mega Pokemon And Ability Support

### User Request

- Reg.M-B formally started, so add newly unlocked Mega Pokemon data to the working implementation.
- First implementation pass should prioritize Japanese name, type, base stats, and weight.
- After that, confirmed new Mega abilities should be reflected where they affect the calculator.

### Implemented Pokemon Data

- Added or connected Reg.M-B Mega evolution data for:
  - `メガシビルドン`
  - `メガガメノデス`
  - `メガドラミドロ`
  - `メガタイレーツ`
- Added base Pokemon records / Mega evolution keys needed for lookup:
  - `ムシャーナ`
  - `ガメノデス`
  - `シビルドン`
  - `ドラミドロ`
  - `タイレーツ`
- Updated confirmed weights for newly listed Mega forms including:
  - `メガライチュウX`
  - `メガライチュウY`
  - `メガムクホーク`
  - `メガペンドラー`
  - `メガズルズキン`
  - `メガカエンジシ`
  - `メガカラマネロ`

### Implemented Ability Data

- `メガシビルドン`: `うなぎのぼり`
  - Added as a new ability record.
  - Treated as `ふゆう`-like Ground immunity for damage calculation.
  - Defense-side `うちおとす（接地）` toggle is shown for this ability.
  - The post-KO highest-stat boost is not automated because the calculator does not currently model KO-triggered turn progression.
- `メガガメノデス`: `かたいツメ`
  - Existing contact-move 1.3x damage logic applies automatically.
- `メガドラミドロ`: `さいせいりょく`
  - Data-only for now; switching recovery does not directly affect single-hit damage calculation.
- `メガタイレーツ`: `まけんき`
  - Data-only for now; stat drop reaction is represented by manual rank controls when needed.
- `メガカエンジシ`: `ほのおのたてがみ`
  - Added as a new ability record.
  - Implemented as Fire-type move damage 1.5x.
- Deployment integrity fix:
  - Normalized legacy `Forewarn` ability data to Japanese `よちむ`.
  - This keeps `スリープ`, `スリーパー`, and newly added `ムシャーナ` aligned with `abilities.json`.

### Changed Files

- `src/data/json/pokemon.json`
- `src/data/json/pokemon-mega.json`
- `src/data/json/abilities.json`
- `src/domain/calculators/DamageCalculator.ts`
- `src/presentation/components/pokemon/PokemonPanel.tsx`
- `tests/domain/DamageCalculator.test.ts`

### Validation

- `npm run typecheck`
- `npm test -- --run tests/domain/DamageCalculator.test.ts` (41 tests passed)
- `npm run build`

### Deployment Notes

- Include UTF-8 preservation files from the previous debug context:
  - `.editorconfig`
  - `.gitattributes`
  - `debug.md`
- Do not include local-only work artifacts:
  - `.codex-remote-attachments/`
  - `.codex/`
  - `src/data/raw/`
  - `pokemon-champions-data-completeness-strategy.md`
  - `乱数幅の変更（Champions固有仕様）.md`

## 2026-06-17 V3.13.0 Mega Scolipede Ability Fix

### User Request

- Correct `メガペンドラー`.
- Confirmed ability:
  - `シェルアーマー`
  - Opponent attacks cannot land critical hits.
- After the fix, bump app version to `V3.13.0` and deploy to production.

### Implemented Scope

- Updated `メガペンドラー` ability from `かそく` to `シェルアーマー`.
- Added critical-hit blocking in `DamageCalculator` for:
  - `シェルアーマー`
  - `カブトアーマー`
- Critical-hit blocking also keeps screen damage reduction active, because the attack is treated as non-critical.
- Added regression coverage verifying that `シェルアーマー` makes forced critical damage equal normal damage.
- Updated package version from `3.12.3` to `3.13.0`.

### Validation Plan

- JSON parse check for Pokemon / Mega / ability data.
- `npm run typecheck`
- `npm test -- --run tests/data/data-integrity.test.ts tests/domain/DamageCalculator.test.ts`
- `npm run build`
