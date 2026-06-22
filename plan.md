# Damage Progression UI/UX Plan

## Context

- Project: Pokemon Champions Damage Calculator.
- Current app version: V3.14.1.
- Current focus: critical-hit defense rank handling fix after V3.14.0 progression updates.
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

## 2026-06-18 Ordered HP Corrections And Electro Shot

### User Request

- Confirm the notebook-side implementation state and integrate the useful parts only.
- Add timeline-aware constant damage/recovery handling so background-style effects can be inserted between attack events in the actual operation order.
- Add `エレクトロビーム` / `Electro Shot`.

### Implemented Scope

- Added ordered HP correction events to the attack/defense progression timeline:
  - defender constant damage
  - defender recovery
  - attacker constant damage
  - attacker recovery
- Added quick insert controls after attack and incoming-attack events so constant damage/recovery can be placed exactly between attacks.
- Extended `progressionStore` and sequence calculation to preserve event ordering for manual HP corrections.
- Added `エレクトロビーム` / `Electro Shot`:
  - Type: Electric
  - Category: Special
  - Power: 130
  - Accuracy: 100
  - PP: 12
  - Self effect represented as a manual `C+1` button through `selfStatDrop: { stat: "spa", stages: 1 }`.
- Added Japanese i18n entry for `electro shot`.

### Deployment Notes

- Production `main` already includes this work.
- Commit on `main`: `d21872c Add Electro Shot and ordered HP corrections`.
- This commit was kept as the base for the subsequent V3.14.0 cleanup instead of duplicating the same notebook-side work.

## 2026-06-18 V3.14.0 Progression Effect Cleanup

### User Decision

- Adopt the following MECE structure for damage/recovery modifiers:
  - `イベント時系列`: the only ordered input that affects actual calculation.
  - `背景効果欄`: presets for common effects such as leftovers, poison, bad poison, and sand-style constants.
  - `HP補正`: arbitrary manual timeline event.
  - `きのみ条件回復`: a special HP-threshold auto rule.
  - `最終HP補正`: abolished.
- Reasoning:
  - Final corrections no longer had a clear role once the timeline became the single source of ordered calculation truth.
  - Keeping final correction would create duplicate concepts and make HP movement harder to audit.

### Implemented Scope

- Removed final HP correction from the application:
  - Removed final direct correction UI from `DamageProgressionPanel`.
  - Removed final correction state from `progressionStore`.
  - Removed snapshot/restore plumbing for final correction fields.
  - Removed final correction application from accumulated and sequence damage calculations.
  - Removed final correction text from accumulated export output.
- Reorganized background effects into presets:
  - Background panel is now `背景効果プリセット`.
  - Preset values do not affect calculation directly.
  - Pressing `イベントへ移動` converts preset values into ordered timeline events and clears the preset input.
  - Background-origin events carry metadata such as `source: "background"` and show a `背景` badge.
- Preserved berry conditional recovery as a special threshold rule:
  - `オボンのみ`
  - confusion berries
  - `はんすう`
  - `しゅうかく` / `ものひろい`
- Updated progression store tests for the removed final correction fields and new event-centered behavior.

### Validation

- `npm run typecheck`
- `npm run lint`
- `npm test -- --run` (182 tests passed)
- `npm run build`

### Deployment

- Version updated to `3.14.0`.
- Commit on `main`: `2cf14a8 Release V3.14.0 progression effect cleanup`.
- Pushed to `origin/main`.
- GitHub Actions results:
  - CI run `27752133250`: success
  - GitHub Pages deploy run `27752133211`: success
- Production URL:
  - `https://advancehacker9361.github.io/pokemon-champions-damage-calc/`

### Current Working Tree Notes

- Local branch:
  - `codex/electro-shot-progression-hp`
- Current HEAD:
  - `2cf14a8 Release V3.14.0 progression effect cleanup`
- `origin/main` is also at `2cf14a8`, so production is current through V3.14.0.
- The local feature branch is ahead/behind its own remote branch because the production-ready history was rebased and pushed to `main`.
- Local untracked files were intentionally left untouched:
  - `.codex-remote-attachments/`
  - `.codex/`
  - `AGENTS.md`
  - `pokemon-champions-data-completeness-strategy.md`
  - `src/data/raw/`
  - `乱数幅の変更（Champions固有仕様）.md`

## 2026-06-21 Setup Turn Events For Battle Progression

### User Request

- Add a turn branch for non-damaging support/setup moves in the attack-defense simulation.
- Current issue:
  - When ranks are changed in advance to represent setup moves, the simulator has no explicit turn for that setup action.
  - As a result, the damage change can appear within the same sequence step instead of after a consumed setup turn.

### Implemented Scope

- Added a new timeline event:
  - `setupTurn`
  - `side: "attacker" | "defender"`
  - optional free-text `label`
- `setupTurn` represents a non-damaging support/setup move turn:
  - It does not change attacker or defender HP.
  - It is recorded as a normal battle-sequence step.
  - It counts as a turn boundary for turn-end mechanics.
- Battle sequence engine changes:
  - `BattleSequenceCalc.SeqEvent` now supports `setupTurn`.
  - `runBattleSequence()` passes HP through unchanged for setup turns.
  - `はんすう` and `しゅうかく/ものひろい` turn-end processing now advances after both `attack` and `setupTurn` events.
- UI changes in `DamageProgressionPanel`:
  - Added `＋攻撃側補助`.
  - Added `＋防御側補助`.
  - Setup rows include a text input for an optional move name such as a boosting move.
  - Attack rows can insert `＋防補助` immediately after the attack.
  - Incoming-damage rows can insert `＋攻補助` immediately after the incoming attack.
- Hook/export integration:
  - `useBattleSequence()` converts progression setup events to sequence setup events.
  - `useAccumulatedDamage()` preserves setup turns so berry turn progression remains consistent.
  - `AccumExportButton` includes setup turns in copied text.
- Store integration:
  - `progressionStore.ProgressionEvent` includes `setupTurn`.
  - `hasSequenceImpact()` returns true when setup turns are present.

### Validation

- `npm run typecheck`
- `npm run lint`
- `npm test -- --run` (186 tests passed)
- `npm run build`

### Deployment

- Commit on `main`: `d307f43 Add setup turn events to battle progression`.
- Pushed to `origin/main`.
- GitHub Actions results:
  - CI run `27905778915`: success
  - GitHub Pages deploy run `27905778933`: success
- Production URL:
  - `https://advancehacker9361.github.io/pokemon-champions-damage-calc/`

### Working Tree Notes

- `plan.md` remains modified locally because this context update was requested after production deployment.
- Local untracked files remain intentionally untouched:
  - `.codex-remote-attachments/`
  - `.codex/`
  - `AGENTS.md`
  - `pokemon-champions-data-completeness-strategy.md`
  - `src/data/raw/`
  - `乱数幅の変更（Champions固有仕様）.md`

## 2026-06-21 Recoil Damage And Mega Timing For Battle Progression

### User Request

- Apply recoil damage from moves such as `ブレイブバード` and `フレアドライブ` to the attack-defense simulation.
- Keep `てっていこうせん` out of proportional recoil handling because it is a fixed self-damage rule based on original/max HP, not half of dealt damage.
- Add Mega Evolution timing to the attack-defense simulation:
  - Instead of forcing the entire simulation into either pre-Mega or post-Mega state, a side should use Mega stats only from the Mega Evolution event onward.

### Implemented Scope

- Move data/model:
  - Added `recoil?: number` to the move domain model and JSON schema.
  - Added proportional recoil rates to recoil moves:
    - `ウェーブタックル`: 1/3
    - `ウッドハンマー`: 1/3
    - `すてみタックル`: 1/3
    - `とっしん`: 1/4
    - `はめつのひかり`: 1/2
    - `フレアドライブ`: 1/3
    - `ブレイブバード`: 1/3
    - `ボルテッカー`: 1/3
    - `もろはのずつき`: 1/2
    - `ワイルドボルト`: 1/3
  - Added data-integrity checks so recoil flags and recoil rates cannot drift.
- Battle sequence recoil behavior:
  - `BattleSequenceCalc.SeqEvent` now supports recoil on both player attack events and incoming attack events.
  - Recoil is calculated from actual HP damage dealt to the target, clamped by remaining HP.
  - Recoil damage uses `Math.round(actualDamage * recoil)` with a minimum of 1.
  - `いしあたま` and `マジックガード` suppress proportional recoil in the sequence hook.
  - If recoil KOs the acting side before later actions, later actions are not evaluated in that branch.
- Mega Evolution timing:
  - Added a new progression event kind: `megaEvolve`.
  - `megaEvolve` can target either `attacker` or `defender` and stores the selected `megaKey`.
  - `megaEvolve` is a HP pass-through event and does not advance turn-end recovery/damage counters.
  - If a side has a Mega Evolution event in the sequence, that side's initial sequence state is forced to the base form even when the live panel is currently Mega.
  - From the Mega Evolution event onward, dynamic sequence calculations use the selected Mega form's stats, type, ability, and weight.
  - Existing saved attack rolls remain fixed at the point they were added, so the intended workflow is:
    - add pre-Mega attacks before the Mega event
    - insert the Mega event
    - switch the panel to Mega and add post-Mega attacks after it
- UI/export integration:
  - Added `＋攻撃側メガ` and `＋防御側メガ` controls to the battle progression panel.
  - Added quick insert buttons for `+攻メガ` and `+防メガ`.
  - Mega rows support selecting a Mega form when multiple forms exist.
  - Export text now includes Mega Evolution events.
  - Accumulated damage ignores Mega Evolution as damage because saved attack rolls are already fixed.

### Validation

- `npm run typecheck`
- `npm run lint`
- `npm test -- --run` (194 tests passed)
- `npm run build`

### Deployment Plan

- Commit this implementation together with the `plan.md` context update.
- Push the resulting commit history to `main`.
- Confirm GitHub Actions CI and GitHub Pages deployment.

## 2026-06-22 V3.14.1 Critical Hit Defense Rank Fix

### User Request

- Fix a bug where critical hits did not correctly ignore the defender's positive Defense / Special Defense rank modifiers.
- Record the implementation context in `plan.md` and `debug.md`.
- Update app version information to `V3.14.1`.

### Implemented Scope

- Updated `src/application/usecases/CalculateDamageUseCase.ts`.
- Critical-hit handling now strips only the defender's positive `def` / `spd` rank stages before stat calculation:
  - `def +1..+6` and `spd +1..+6` are treated as rank 0 during an effective critical hit.
  - negative defender ranks are preserved, so defensive debuffs still increase critical-hit damage.
  - if the defender has `シェルアーマー` or `カブトアーマー`, the hit is not treated as an effective critical hit and positive defensive ranks remain active.
- The fix is implemented in the use-case layer because `calculateDamage()` receives already rank-adjusted computed stats.
- Updated app version from `3.14.0` to `3.14.1` in:
  - `package.json`
  - `package-lock.json`

### Tests Added

- Added regression coverage in `tests/application/CalculateDamageUseCase.test.ts` for:
  - critical hits ignoring defender `B+2` on physical damage.
  - critical hits ignoring defender `D+2` on special damage.
  - critical hits preserving defender `B-2`.
  - `シェルアーマー` preventing both the critical multiplier and the defensive-rank ignore behavior.

### Validation

- `npm run typecheck`
- `npm run lint`
- `npm run test -- --run tests/application/CalculateDamageUseCase.test.ts tests/domain/DamageCalculator.test.ts tests/domain/pkdxCrossCheck.test.ts`
  - 61 tests passed.
  - sandbox 内では esbuild の `spawn EPERM` が出たため、通常権限で再実行。
- `npm run build`
  - sandbox 内では esbuild の `spawn EPERM` が出たため、通常権限で再実行。

### Current Status

- Implementation and local validation are complete.
- Deployment has not been performed in this step.
