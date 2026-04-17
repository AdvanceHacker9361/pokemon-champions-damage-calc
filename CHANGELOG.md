# Changelog

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

## [Unreleased]

## [2.1.0] - 2026-04-17

### Added
- **急所（クリティカルヒット）トグル**: 各ダメージ結果行に「急所」ボタンを追加
  - `useDamageCalc.ts` で通常・急所の両方を事前計算し `critResult` として保持
  - 急所時は壁無効・1.5× 補正・ランク補正の扱いを自動調整
  - 急所モードで "+ 加算" すると急所ダメージが累積される
- **自己デバフ技の簡易ランク低下ボタン**: りゅうせいぐん・オーバーヒート・リーフストーム等を使用後、攻撃側 C ランクを 2 段階下げるボタンを結果行に追加
  - `moves.json` に `selfStatDrop: { stat, stages }` フィールドを導入
  - 現在ランクが既に下限（-6）の場合は disabled
  - 誤適用防止のため自動ではなく手動ボタン
- **CLAUDE.md**: プロジェクト概要・アーキテクチャ・V2.1 設計経緯・主要ファイル一覧を追加

### Changed
- **加算パネルの統合**: 結果行の 1–5 回ボタンと `DamageCalcPanel` の重複 UI を単一 "+ 加算" ボタンに集約
  - `DamageAccumPanel` に `[−] ×N [+]` 調整 UI を統合（使用回数 1–9）
  - 異なる攻撃側/防御側の組み合わせを横断した累積ダメージが可能に
  - `DamageCalcPanel.tsx` を削除し `DamageAccumPanel.tsx` に一本化
  - `accumStore.ts` に `setEntryUsages` アクションを追加
- **FieldStateBar の位置変更**: 天候/フィールド/壁パネルをページ上部から「結果行 ↓ FieldStateBar ↓ 加算パネル」の間へ移動
  - `DamageResultArea.tsx` 内で `<FieldStateBar />` をレンダリング
  - `Calculator.tsx` から該当セクションを削除
- `MoveResult` 型に `critResult: DamageResult` を追加（`resultStore.ts`）

## [2.0.0] - 2026-04-16

### Added
- **データ完全性戦略の実装（全フェーズ）**
  - `scripts/fetch-showdown-data.ts`: Pokemon Showdown 公開データから全量自動取得
  - `scripts/filter-champions-data.ts`: Champions内定210体でフィルタリング
  - `scripts/fetch-japanese-names.ts`: PokeAPI 経由で日本語名を100%カバー
  - `scripts/build-final-data.ts`: フィルタ済みデータをJSONに統合
  - `src/data/champions-roster.ts`: 内定ポケモン210体のShowdown IDリスト
  - `src/data/i18n/ja.json`: 技・特性・アイテムの日本語名マッピング
  - `tests/data/data-integrity.test.ts`: 26項目のデータ整合性テスト

### Changed
- `moves.json`: 203技 → 562技（全内定ポケモン習得技を網羅、日本語名100%）
- `abilities.json`: 63特性 → 189特性（誤記5件修正含む）
- 乱数幅を Champions 固有仕様の15段階（86〜100）に変更（85は出現しない）
- KO確率計算: 「確定2発」誤表示 → 「乱数1発」を正しく判定するよう修正

### Added (UI)
- 加算計算パネルを4技結果行の下に統合（1箇所に集約）
- もうどく累積ダメージ計算機能（ターン数選択 → 定数ダメに自動合算）
- 定数ダメ・定数回復・もうどくを総合累積KO確率に自動加算
- 定数ダメプリセットに 1/32 を追加
- 連続技（2〜5回）の回数分布別KO確率パネル（つららばり・スケイルショット等）
- おやこあい 15×15 ダメージテーブル表示

### Fixed
- 乱数ロール配列のゼロ初期化が16要素だった型エラーを修正（→15要素）
- ガブリアスのデフォルト技4: ほのおのキバ → どくづき

## [1.0.0] - 2026-04-14

### Added
- Complete single-battle damage calculator for Pokemon Champions
- SP system (0–32 per stat, 66 total cap) replacing EV system
- Mega Evolution support (~60 forms) with pre-computed base stats
- Gen9 damage formula with exact modifier ordering: Weather→Critical→Random→STAB→Type→Burn→Other
- Special move handling: イカサマ, ボディプレス, ジャイロボール, くさむすび, etc.
- KO probability via dynamic programming over 16 RNG rolls
- Type chart (18×18) with full effectiveness calculation
- Weather/Terrain/Wall/Trick Room field state toggles
- Rank modifiers (±6 for all stats)
- Status condition effects (burn halves physical damage)
- Damage bar with color-coded KO indicators (1HKO=red, 2HKO=orange, 3HKO=yellow, 4+HKO=green)
- PWA support for offline use
- GitHub Actions CI/CD with GitHub Pages deployment
- 64 unit tests (domain + application layer)

### Test Cases Verified
- Garchomp (Jolly, A32/S32/H2): A=200 / S=154 / HP=184 ✓
- Mega Gengar (Timid, C32/S32): C=222 / S=200 ✓

## [0.1.0] - 2026-04-14

### Added
- Project initialization
- Domain models: StatPoints, Pokemon, Move, BattleField, DamageResult
- Domain calculators: StatCalculator, DamageCalculator, KoProbabilityCalc, SpecialMoveCalc
- Data layer: JSON databases (pokemon, mega, moves, abilities, items, natures, type-chart)
- Application use cases: CalculateDamage, CalculateStats, SearchPokemon, ApplyMegaEvolution
- Presentation layer: Zustand stores + React hooks + UI components
- PWA support (offline calculation)
- GitHub Actions CI/CD pipeline
- URL state sharing

### Test Cases Verified
- Garchomp (Jolly, A32/S32/H2): A=200 / S=154 / HP=184 ✓
- Mega Gengar (Timid, C32/S32/D2): C=222 / S=200 ✓
