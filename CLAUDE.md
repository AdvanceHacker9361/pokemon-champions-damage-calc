# Pokemon Champions Damage Calculator — CLAUDE.md

## プロジェクト概要

ポケモンチャンピオンズ向けダメージ計算機（React + TypeScript + Vite）。  
GitHub Pages でホスティング、PWA 対応。現在バージョン: **3.0.0**

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

### 5. 体重依存技の修正（けたぐり・くさむすび・ヘビーボンバー）

#### 5-1. 体重境界の比較演算子修正
- `SpecialMoveCalc.ts` の `getWeightPower` で `weight <= maxWeight` → `weight < maxWeight` に変更
- Showdown 準拠の `>= N` 形式と等価に（境界値での判定が正しくなる）
- 例: 100.0kg のポケモンは従来パワー 80 → 正しくはパワー 100
  - フシギバナ(100.0)・メガガルーラ(100.0)・メガラグラージ(102.0) など

#### 5-2. メガシンカ時の体重更新
- `pokemon-mega.json` に全 74 件の `weight` フィールドを追加
- `MegaPokemonRecord` 型にも `weight?: number` を追加（`schemas/types.ts`）
- `pokemonStore.ts` の `setPokemon` / `setMega` / `setMegaForm` でメガ時に体重を切り替え
- 主要な体重変化（パワー帯をまたぐもの）
  - メガガルーラ: 80 → 100（80 → 100）
  - メガガブリアス: 95 → 130（80 → 100）
  - メガヤドラン: 78.5 → 120（80 → 100）
  - メガミュウツーY: 122 → 33（100 → 60、大幅減量）
  - メガヤミラミ: 11 → 161.2（40 → 100、大幅増量）
  - メガピジョット: 39.5 → 50.5（60 → 80）
  - メガラティアス: 40 → 52（60 → 80）

#### 5-3. ヘビーボンバーの正しい実装
- 変更前: `special: "low-kick"`（防御側体重のみ）で誤計算
- 変更後: 新 `heavy-slam` タグを追加し、攻撃側/防御側の体重比で威力決定
  - 比 ≥ 5 → 120 / ≥ 4 → 100 / ≥ 3 → 80 / ≥ 2 → 60 / それ未満 → 40
- `SpecialMoveContext` に `attackerWeight?` を追加、`DamageCalculator.resolvePower` から渡す
- `Move.ts` の `SpecialMoveTag` に `'heavy-slam'` を追加

### 6. 技データスキーマ拡張（V2.1 追加分）

#### 6-1. 複数ステータス変化 `selfStatDrops`
- 単一の `selfStatDrop` に加え、複数ステータスを同時変化させる `selfStatDrops: { stat, stages }[]` を追加
- 例: アーマーキャノン・むねんのつるぎ（使用後 def -1 かつ spd -1）
- `schemas/types.ts` と `domain/models/Move.ts` の両方に定義
- `DamageResultRow.tsx` のボタン表示は両フィールドに対応（単一 + 複数両方）
- 自ステータス上昇（stages > 0）もサポート

#### 6-2. 確定急所技 `alwaysCrit`
- `alwaysCrit?: boolean` フィールドを追加（トリックフラワー等）
- 計算時は常に急所補正で評価される（急所トグル不要）

#### 6-3. 段階威力型連続技 `MultiHitData: { type: 'escalating' }`
- 連続技の発ごとに威力が変化するタイプ（例: トリプルアクセル = 20→40→60）
- 既存の `fixed` / `variable` に加え `escalating: { powers: number[] }` を新設
- `MoveResult` に `perHitResults`・`critPerHitResults` を追加し、発ごと個別結果を保持（ばけのかわ処理に使用）

### 7. バグ修正・技仕様追加（V2.1 追加分）

#### 7-1. ギルガルド攻守交代バグ修正
- `Calculator.tsx` の `swapStores()` で `pick` 関数に不足フィールドを追加
  - 追加: `isBlade`, `availableMegas`, `megaKey`, `abilityActivated`, `proteanType`, `proteanStab`, `movePowers`, `supremeOverlordBoost`
- バトルスイッチでブレードフォルムにした後に攻守交代すると種族値が逆転する不具合を解消

#### 7-2. アシストパワー・つけあがるの威力計算実装
- `stored-power` タグの実装が未完だったため修正
- `SpecialMoveContext` に `attackerRankModifiers?` を追加
- `resolveSpecialMove` の `stored-power` ケースで `20 + 20 × Σ(正のランク補正)` を計算
- `DamageCalculator.resolvePower` から `attackerRankModifiers` を渡すよう修正
- `moves.json` の「つけあがる」に `special: "stored-power"` を設定（アシストパワーは設定済みだった）

#### 7-3. しっぺがえしの可変威力対応
- `moves.json` の「しっぺがえし」に `powerOptions: [50, 100]` を追加
- 後攻時の威力2倍（50→100）を UI から選択できるようにした

#### 7-4. たたりめの可変威力対応
- `hex` 特殊ケースは `SpecialMoveContext` に `defenderStatus` がなく常に130を返すバグがあった
- `special: "hex"` → `special: null` に変更し、`powerOptions: [65, 130]` を追加
- 相手の状態異常時の威力2倍（65→130）を UI から手動選択できるようにした

### 8. UI 追加（デスクトップ PC 作業分）

- **技名横のタイプバッジ**: `DamageResultRow.tsx` にタイプ色付きバッジを表示
- **自ステータス上昇ボタン**: `selfStatDrops` と同ロジックで正方向（+1/+2）にも対応
- **新技の実装**: トリックフラワー（確定急所）・アクアステップ・フレアソング・アーマーキャノン・むねんのつるぎ・ジェットパンチ・アクセルロック・ルミナコリジョン・アイスハンマー 等
- **新ポケモン**: アローラキュウコン・ガラルヤドキング（特性「きみょうなくすり」）

---

## V2.2〜V2.5 で実装した主要機能

### V2.2: HPバー可視化 + 最上部サマリーパネル

#### DamageBar の 2 トーン化
- `DamageBar.tsx` に `percentMin` prop を追加
- 淡色（0→percentMax）= 乱数帯、濃色（0→percentMin）= 確定ダメージ帯を重ねて描画
- `getSolidColor()` / `getLightColor()` ヘルパーで KO 状況に応じた色分け

#### 最上部サマリーパネル（DamageSummaryHeader）
- `src/presentation/components/results/DamageSummaryHeader.tsx` を新規作成
- `Calculator.tsx` の 3 カラムグリッド上部に常時表示
- 全技中で `result.max` が最大の技を自動選択して表示
- レイアウト: `攻撃側名 A/C{stat} ── 技名 ──▶ 防御側名 B/D{stat} / HP{hp}`
- DamageBar・残HP範囲・KO ラベルを表示

### V2.3: 乱数ヒストグラム + 実数値視認性向上

#### 乱数ヒストグラム（RollHistogram）
- `DamageResultRow.tsx` 内の `▼乱数` 展開セクションに `RollHistogram` コンポーネントを追加
- 15 段階ロールを縦棒グラフで可視化（赤=確定KO・橙=2発圏・黄=3発圏・グレー=安全）
- KO閾値を破線で表示、右上に「確定1発: X/15」「2発圏: X/15」を表示
- X 軸ラベル: 86% / 92% / 100%

#### SpSlider 実数値の視認性向上
- `SpSlider.tsx` の実数値表示を `text-xs w-9` → `text-sm w-10 font-semibold` に変更

### V2.4: 耐久調整（逆算）機能

#### FindOptimalSpUseCase
- `src/application/usecases/FindOptimalSpUseCase.ts` を新規作成
- H + B（物理）または H + D（特殊）の SP 最適配分を全列挙する
- アルゴリズム: spDef(0〜32) × defNature(0.9/1.0/1.1) の全組み合わせをイテレート
  - `calculateDamage(HP=9999)` で最大ダメージを算出
  - 二分探索で「HP > maxDmg × hitsToSurvive」を満たす最小 spH を算出
  - `spH + spDef ≤ budget`（budget = 66 − 他ステのSP合計）を満たすものだけ採用
- 結果は totalSp 昇順・remainHp 降順でソート

#### DurabilityPanel
- `src/presentation/components/results/DurabilityPanel.tsx` を新規作成
- `DamageResultRow` の `▼耐久` ボタンで展開
- 1発耐え / 2発耐えトグル
- 現在設定の HP・最大被ダメ・耐え判定（✓/✗）を表示
- 結果テーブル: 計SP・H SP・B/D SP・性格・HP実数・B/D実数・被ダメ・残HP（上位 20 件、最上位を緑ハイライト）

### V2.5: 期待ダメージ表示 + 高急所技データ

#### critChance フィールド追加
- `src/domain/models/Move.ts` と `src/data/schemas/types.ts` に `critChance?: number` を追加
  - 0（省略）= 通常急所 1/16, 1 = 高急所 1/8
- `moves.json` に `critChance: 1` を付与した高急所技 15 件:
  - アクアカッター・エアカッター・エアスラッシュ・クラブハンマー・クロスポイズン
  - ドリルライナー・つじぎり・サイコカッター・はっぱカッター・リーフブレード
  - シャドークロー・ストーンエッジ・あくうせつだん・れんぞくぎり・ブレイズキック

#### 期待ダメージ表示（DamageResultRow）
- DamageBar 直下に「期待: XX.X」行を常時表示
- 命中率 × 急所率加重平均: `hitRate × (critRate × avgCrit + (1−critRate) × avgNormal)`
- 命中 < 100% の場合: 「XX%命中」を右側に表示
- 高急所技の場合: 「急所1/8」バッジ（黄色）を表示
- 変動連続技パネル（VariableMultiHitPanel）の期待ダメ・KO確率にも命中率を反映

### V2.6: 加算パネルのHPバー統合 + ダメージ分布ヒストグラム

#### 総合累積エリアの刷新
- `DamageAccumPanel.tsx` の独自赤バー → `DamageBar` コンポーネントに置き換え
  - KO 状況に応じた 2 トーン配色（`accumKoResult` を `combinedProb` から構築）
- バー直下に残HP行を追加（個別結果行と同じスタイル）

#### 累積ダメージ分布ヒストグラム（AccumHistogram）
- `DamageAccumPanel.tsx` 内に `AccumHistogram` コンポーネントを新設
- 30 bin で確率密度を可視化
  - HP閾値を赤い破線で表示し、超過 bin は赤、境界 bin は橙、それ以下はグレーで着色
  - 上部に「耐え XX.X%」「KO XX.X%」のサマリ
  - X 軸ラベル: `totalMin` / `HP{value}`（閾値位置）/ `totalMax`
- `totalMin === totalMax`（変動なし）の場合はヒストグラム非表示

#### 新規ドメイン関数
- `KoProbabilityCalc.calcCombinedDamageDistribution(rollSets, offset)` を追加
  - DP で累積ダメージの完全分布を算出し `Map<number, number>` で返す
  - `offset` に定数ダメージ（毒・砂嵐・残飯等の相殺済み値）を渡せる

### V2.7: 総合累積をサマリーヘッダーに統合 + ヒストグラム修正

#### 総合累積の表示位置を移設
- `DamageAccumPanel` の「総合累積」セクション（HPバー・残HP・ヒストグラム）を
  `DamageSummaryHeader` に統合
- 加算パネル側は入力UI（加算リスト・定数ダメ/回復・もうどく）専用に
- サマリーヘッダー内の構造: 総合累積バー + ヒストグラムのみ
  - 最大ダメ技・技名情報・ポケモン名は表示しない
  - 加算がない初期状態では「加算されると結果が表示されます」プレースホルダーを表示

#### ヒストグラムの整数 bin 化（バグ修正）
- 旧実装: `binSize = range / 30`（小数）→ range=14 のような離散分布では
  bin が 0.47 幅になり、15個の値が飛び飛びで 15/30 の空 bin が出て描画が崩れる
- 新実装: `binSize = max(1, round(range / 40))` で整数化
  - range=14 → binSize=1, 15 bins（各値が独自の bin）
  - range=140 → binSize=4, 36 bins
  - range=600 → binSize=15, 41 bins
- ヒストグラムのラベルに「有効 bin 数 / 全 bin 数」を表示

#### ヒストグラム視認性の大幅改善
- コンテナ高さ 48px → 80px
- 線形スケール → **√スケーリング**（小確率 bin も視認可能に）
  - `heightPct = sqrt(prob / maxProb) * 100`
  - ダイナミックレンジが大きい分布（ピーク7% / エッジ0.4% など）でも全 bin が見える
- KO ゾーン背景を淡赤、耐えゾーン背景を淡青で着色（視覚的に境界を即時判別）
- HP閾値線: 破線 → **実線2px + ラベルバッジ** に強化
- **累積KO確率曲線 P(damage ≥ X)** をSVG実線でオーバーレイ
  - 任意の damage 以上となる確率が一目で読める（競プロ向け）
  - 右に進むほど単調減少、HP閾値で KO確率に一致
- バー色: 耐えゾーンを slate → sky に変更（青=耐え、赤=KO で統一）
- 凡例: 色スウォッチ付きで明示

#### 状態管理のリファクタ
- `accumStore` に `constDmg`/`constRec`/`poisonTurns` を追加（以前は DamageAccumPanel のローカル state）
- `useAccumulatedDamage(defenderMaxHp)` フックを新設
  - totals（min/max/pct）/ distribution / combinedProb / accumKoResult を一元計算
  - `DamageSummaryHeader` と `DamageAccumPanel` の両方から利用可能に
- `AccumHistogram.tsx` を独立ファイル化

---

## 重要なファイルと役割

| ファイル | 役割 |
|----------|------|
| `src/domain/calculators/DamageCalculator.ts` | コアダメージ計算（タイプ相性・STAB・特性等） |
| `src/domain/models/Move.ts` | Move 型定義、`selfStatDrop` / `selfStatDrops` / `alwaysCrit` / `critChance` / `escalating` フィールドを含む |
| `src/data/schemas/types.ts` | JSON スキーマ型定義（MoveRecord に上記フィールドすべてあり） |
| `src/data/json/moves.json` | 技データ（日本語名・英語名・威力・命中・特殊フラグ・`critChance` 等） |
| `src/presentation/hooks/useDamageCalc.ts` | 計算実行、`result` と `critResult` を返す |
| `src/presentation/store/resultStore.ts` | `MoveResult` 型（`result`, `critResult` の両方を保持） |
| `src/presentation/store/accumStore.ts` | 累積計算、entries + `constDmg`/`constRec`/`poisonTurns` 状態 |
| `src/presentation/hooks/useAccumulatedDamage.ts` | 累積ダメージの totals/分布/KO確率を一元計算するフック |
| `src/presentation/components/results/DamageResultArea.tsx` | 結果行 + FieldStateBar + DamageAccumPanel の配置 |
| `src/presentation/components/results/DamageResultRow.tsx` | 急所トグル・自己デバフボタン・加算ボタン・期待ダメ表示・耐久調整トグル |
| `src/presentation/components/results/DamageSummaryHeader.tsx` | 最上部サマリーパネル（総合累積バー＋ヒストグラムのみ。加算なし時はプレースホルダー表示） |
| `src/presentation/components/results/DurabilityPanel.tsx` | 耐久調整パネル（H+B/D最適SP配分テーブル） |
| `src/presentation/components/results/DamageAccumPanel.tsx` | 加算リスト・定数ダメ/回復・もうどく入力 UI |
| `src/presentation/components/results/AccumHistogram.tsx` | 累積ダメージ分布ヒストグラム（整数 bin 化で離散分布対応） |
| `src/application/usecases/FindOptimalSpUseCase.ts` | 耐久調整ロジック（二分探索 + 全組み合わせ列挙） |
| `src/infrastructure/version.ts` | `__APP_VERSION__`（Vite が package.json から注入） |
| `src/domain/calculators/SpecialMoveCalc.ts` | 特殊技の威力解決（体重依存・ジャイロボール・ヘビーボンバー等） |
| `src/data/json/pokemon-mega.json` | メガポケモンデータ（`weight` フィールド含む全 74 件） |

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
