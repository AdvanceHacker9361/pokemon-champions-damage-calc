# Damage Progression UI/UX Plan

## Context

- Project: Pokemon Champions Damage Calculator.
- Current production version: V3.12.3.
- Current focus: UI/UX polish shipped as V3.12.3.
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
