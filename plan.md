# Damage Progression UI/UX Plan

## Context

- Project: Pokemon Champions Damage Calculator.
- Current production version: V3.12.2.
- Current focus: Damage progression attacker-faint output fix shipped as V3.12.2.
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
