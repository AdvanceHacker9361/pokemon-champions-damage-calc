# Pokemon Champions Damage Calculator — CLAUDE.md

## プロジェクト概要

ポケモンチャンピオンズ向けダメージ計算機（React + TypeScript + Vite）。  
GitHub Pages でホスティング、PWA 対応。現在バージョン: **2.1.0**

- 本番 URL: `https://advancehacker9361.github.io/pokemon-champions-damage-calc/`
- リポジトリ: `advancehacker9361/pokemon-champions-damage-calc`
- デフォルトブランチ: `main`（GitHub Actions で Pages 自動デプロイ）

---

## アーキテクチャ

クリーンアーキテクチャ 5 層構成。`tsconfig.json` に `@/domain`, `@/application`, `@/data`, `@/presentation`, `@/infrastructure` のパスエイリアスが設定されている。

```
src/
├── domain/          # ビジネスロジック（計算、モデル、定数）
├── application/     # ユースケース（CalculateDamageUseCase 等）
├── data/            # リポジトリ + JSON データ（外部 API なし）
├── presentation/    # React コンポーネント + Zustand ストア + hooks
│   ├── components/
│   │   ├── pokemon/    # PokemonPanel（攻撃側・防御側）
│   │   ├── moves/      # MoveSelect, MoveSlots
│   │   ├── field/      # FieldStateBar（天候/フィールド/壁）
│   │   └── results/    # DamageResultArea, DamageResultRow, DamageAccumPanel
│   ├── store/          # Zustand ストア
│   ├── hooks/          # useDamageCalc 等
│   └── pages/          # Calculator.tsx（メインページ）
└── infrastructure/  # version.ts（__APP_VERSION__ を Vite から注入）
```

---

## Zustand ストア

| ストア | 役割 |
|--------|------|
| `useAttackerStore` | 攻撃側ポケモン設定（種族・努力値・性格・技・特性・持ち物・メガ・ランク補正等） |
| `useDefenderStore` | 防御側ポケモン設定（同構造） |
| `useFieldStore` | 天候・フィールド・壁（リフレク・ひかりのかべ・オーロラベール） |
| `useResultStore` | ダメージ計算結果（MoveResult の配列、`result` と `critResult` を持つ） |
| `useAccumStore` | 累積ダメージ（エントリーリスト、使用回数 1–9） |

---

## V2.1 で実装した主要機能（設計の経緯）

### 1. 加算パネルの統合（単一 "+ 加算" ボタン）

- **変更前**: ダメージ結果行の 1–5 回ボタン ＋ DamageCalcPanel の重複 UI
- **変更後**: 各行に "+ 加算" ボタン1つ、DamageAccumPanel に `[−] ×N [+]` 調整 UI
- `DamageCalcPanel.tsx` は削除し `DamageAccumPanel.tsx` に統合
- 異なる攻撃側/防御側の組み合わせを横断した累積ダメージが可能

### 2. FieldStateBar の位置変更

- 天候/フィールド/壁パネルをページ上部から「結果行 ↓ FieldStateBar ↓ 加算パネル」の間に移動
- `DamageResultArea.tsx` 内で `<FieldStateBar />` を差し込み
- `Calculator.tsx` から `<FieldStateBar />` を削除

### 3. 急所（クリティカルヒット）トグル

- 各ダメージ結果行に「急所」ボタンを追加（黄色）
- `useDamageCalc.ts` で通常ダメージと急所ダメージを両方計算し `critResult` として保持
- 急所時は壁無効・1.5× 補正・ランク補正の扱いが変わる
- 急所モードで "+ 加算" すると急所ダメージが加算される

### 4. 自己デバフ技の簡易ランク低下ボタン

- りゅうせいぐん・オーバーヒート・リーフストームなどで使用後に C ランクを簡単に下げられるボタン
- `moves.json` に `selfStatDrop: { stat: "spa", stages: -2 }` を追加
- `DamageResultRow.tsx` でボタンとして描画、現在ランクが既に -6 の場合は disabled
- **自動適用ではなく手動ボタン**（意図しない変更を防ぐため）

---

## 重要なファイルと役割

| ファイル | 役割 |
|----------|------|
| `src/domain/calculators/DamageCalculator.ts` | コアダメージ計算（タイプ相性・STAB・特性等） |
| `src/domain/models/Move.ts` | Move 型定義、`selfStatDrop` フィールドを含む |
| `src/data/schemas/types.ts` | JSON スキーマ型定義（MoveRecord に `selfStatDrop` あり） |
| `src/data/json/moves.json` | 技データ（日本語名・英語名・威力・命中・特殊フラグ等） |
| `src/presentation/hooks/useDamageCalc.ts` | 計算実行、`result` と `critResult` を返す |
| `src/presentation/store/resultStore.ts` | `MoveResult` 型（`result`, `critResult` の両方を保持） |
| `src/presentation/store/accumStore.ts` | 累積計算、`setEntryUsages` アクション |
| `src/presentation/components/results/DamageResultArea.tsx` | 結果行 + FieldStateBar + DamageAccumPanel の配置 |
| `src/presentation/components/results/DamageResultRow.tsx` | 急所トグル・自己デバフボタン・加算ボタン |
| `src/presentation/components/results/DamageAccumPanel.tsx` | 累積ダメージ計算・KO 確率表示 |
| `src/infrastructure/version.ts` | `__APP_VERSION__`（Vite が package.json から注入） |

---

## 開発コマンド

```bash
npm run dev          # 開発サーバー起動
npm run build        # 本番ビルド（tsc -b && vite build）
npm run typecheck    # 型チェックのみ
npm run lint         # ESLint
npm run test         # Vitest（一回実行）
npm run test:watch   # Vitest（ウォッチモード）
```

---

## デプロイフロー

1. feature ブランチで開発 → main にマージ
2. GitHub Actions (`.github/workflows/deploy.yml`) が自動で型チェック・テスト・ビルド・GitHub Pages デプロイ
3. デプロイ完了まで数分かかる場合がある

---

## 注意事項

- **ブランチ**: 開発は `claude/debug-pokemon-damage-calc-Rd6jZ` または新規 feature ブランチで行い、完了後 main へマージ
- **バージョン管理**: `package.json` の `version` フィールドを更新すれば `APP_VERSION` に反映される
- **テスト**: ドメイン層のユニットテストが `tests/domain/` にある。新機能追加時は対応テストを追加すること
- **型**: TypeScript strict モード。`any` は使わない
- **スタイル**: TailwindCSS。ダークモード対応（`dark:` プレフィックス）
- **日本語**: ひらがな↔カタカナ変換は `src/utils/japanese.ts` を使用
