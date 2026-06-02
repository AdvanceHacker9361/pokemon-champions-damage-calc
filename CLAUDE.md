# Pokemon Champions Damage Calculator — CLAUDE.md

## プロジェクト概要

ポケモンチャンピオンズ向けダメージ計算機（React + TypeScript + Vite）。  
GitHub Pages でホスティング、PWA 対応。現在バージョン: **3.6.1**

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
| `useSessionStore` | タブ（複数計算状態）管理。各タブが攻撃側/防御側/フィールド/累積のスナップショットを保持し、切替時にライブストアへ復元（V3.3.0） |

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
- 16 段階ロール（85〜100%）を縦棒グラフで可視化（赤=確定KO・橙=2発圏・黄=3発圏・グレー=安全）
- KO閾値を破線で表示、右上に「確定1発: X/15」「2発圏: X/15」を表示
- X 軸ラベル: 85% / 92% / 100%

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

### V3.0: 総合累積の耐久調整（HP投資最適化）

#### AccumDurabilityPanel
- `DamageSummaryHeader` 下部のトグル（`▼ 耐久調整（HP投資）`）で展開
- **HP SP のみを探索**: 加算リストの技は個別に再計算できない（エントリが攻撃側コンテキストを保持しない）ため、B/D 最適化は行わず H 投資のみ最適化
- もうどく累計は HP に比例するため、spH ごとに再計算（10ターン積みなど極端な場合は「HP増で総被ダメも増える」逆転現象も正しく扱える）
- 表示: 現在の判定 / 必要最小 H SP（緑ハイライト）/ 一定間隔の H 投資量での比較テーブル
- `findOptimalAccumDurability()` ユースケースで列挙
- 備考: B/D 最適化は従来通り個別技の耐久調整パネルを使用

### バグ修正（V3.0 以降）

#### マルチスケイル/ファントムガードのデフォルト自動ON
- `pokemonStore.ts` の `defaultAbilityActivated()` ヘルパーを追加
- HP満タン条件の特性（マルチスケイル・ファントムガード・ばけのかわ）は、計算機が
  「防御側HP満タン前提」のため、ポケモン・特性・メガ進化セット時に `abilityActivated` を
  自動で `true` にする（以前は手動トグルが必要で、半減が適用されないバグがあった）

#### 累積ダメージにおけるマルチスケイル無効化の正確な適用
- `AccumEntry` に `rawRolls/rawMin/rawMax`（素ダメ）と `hadMultiscale` フラグを追加
- 加算時に HP満タン特性が発動中なら `rawRolls = rolls × 2` で素ダメを近似
- `useAccumulatedDamage` で「最初のエントリの最初の1撃のみ半減、2発目以降は素ダメ」に変更
  - 以前は全攻撃が半減されてしまい、総合累積が過小評価されるバグがあった

#### 多段技のマルチスケイル無効化（単一技内の2発目以降）
- `useDamageCalc.ts` の `calcEscalating`: 段階威力型（トリプルアクセル等）で
  2発目以降の `executeDamageCalculation` 呼び出しに `abilityActivated: false` を渡し
  マルチスケイルを無効化
- `useDamageCalc.ts` の通常パス: マルチスケイル発動中なら素ダメ版 `rawResult/rawCritResult` を
  同時計算して `MoveResult` に含める
- `VariableMultiHitPanel`: 変動連続技（つららばり・スケイルショット等）の 2〜5 ヒット表示で
  `hitMin = rolls[0] + rawRolls[0] × (hits - 1)` と「1発目半減 + 2発目以降素ダメ」で計算
- 加算ボタン: `rawResult` を使えるときはそれを素ダメとして採用（×2 近似よりも正確）

#### 固定連続技・おやこあいのマルチスケイル対応
- **固定連続技**（ドラゴンアロー・ダブルウイング 等 `multiHit.type === 'fixed'`）
  - メイン行の表示を **per-hit → 合計ダメージ** に変更
  - `effectiveRolls = rolls[i] + rawRolls[i] × (count - 1)`
  - マルチスケイル発動時は 1発目のみ半減、残りは素ダメで合算
- **おやこあい**（メガガルーラ等）
  - 子ダメ算出元を `rolls`（半減）→ `rawRolls`（素ダメ）に変更
  - 親=1発目半減、子=2発目素ダメの25% で正確に表現
  - `ParentalBondTable` も外から `childRolls` を受け取る形に変更

### V3.1: 総合累積に「急所込み撃破率」を追加

#### 概要
- `DamageSummaryHeader` の総合累積欄に、通常 KO 確率の横に「急所込み X%」を併記
- 各エントリの急所率（1/16 or 1/8）を使って、通常ロールと急所ロールを確率的に混合した KO 確率を算出
- 値が通常と変わらない場合（確定急所エントリのみ・構成により差が出ない等）は非表示

#### データモデル拡張（`AccumEntry`）
- `critRolls` / `rawCritRolls` — 急所ロール（ばけのかわ・おやこあい・固定多段 反映済み / マルチスケイル無効版）
- `critMin/Max` / `rawCritMin/Max` — 急所ロールの上下端
- `critChance` — そのエントリの急所率（0.0625 / 0.125 / 1.0）
- `isForcedCrit` — 急所モードで加算 or 確定急所技（`alwaysCrit`）。急所込み計算で再混合せず `rolls` をそのまま使う

#### 新規計算関数（`KoProbabilityCalc.ts`）
- `AttackRollsWithCrit` 型と `calcCombinedDamageDistributionWithCrit` / `calcCombinedKoProbabilityWithCrit`
- 各攻撃スロットで `(1 - critChance) × 通常ロール分布 + critChance × 急所ロール分布` を畳み込む

#### 実効ロール計算の関数化（`DamageResultRow.tsx`）
- `computeEffectiveRolls()` ヘルパー新設：`rolls/rawRolls` からばけのかわ・おやこあい・固定多段合計を統一適用
- 通常と急所の両方で使うようリファクタ
- `handleAddToAccum` で両者を計算して `AccumEntry` に保存

### 急所ランクシステム（V3.0 以降）

#### CritRank.ts
- `src/domain/calculators/CritRank.ts` を新規作成
- `calcCritChance({ moveCritBonus, attackerAbility, attackerItem, focusEnergyActive })` で急所率を統合計算
- ランクテーブル（Pokemon Champions = Gen 7+ 仕様）: **0→1/24**, +1→1/8, +2→1/2, +3→確定
  - Gen 6 までは 1/16 だったが Gen 7 以降 1/24 に引き下げられた仕様に追従
- ランク加算要素:
  - 高急所技（`move.critChance >= 1`）: +1
  - 特性「きょううん」: +1
  - ピントレンズ / するどいツメ: +1
  - きあいだめ状態（`focusEnergyActive`）: +2
- これらは累積（例: 高急所技 + きあいだめ = ランク3 = 確定急所）

#### pokemonStore に focusEnergyActive 追加
- `focusEnergyActive: boolean`（攻撃側のみ）をストアに追加
- `setFocusEnergyActive(v: boolean)` アクション
- `setPokemon` / `reset` 時に `false` にリセット

#### アイテムデータ追加
- `items.json` に「ピントレンズ」(`scope-lens`) と「するどいツメ」(`razor-claw`) を追加

#### UI
- `PokemonPanel.tsx` の攻撃側に「急所ランク」トグルボタン（きあいだめ +2）を追加
- `DamageResultRow.tsx` のハードコード `1/16` or `1/8` を `calcCritChance()` に置き換え
- 期待ダメージの `critRate` も `calcCritChance()` ベースに統一
- 急所率バッジ: 1/8→黄色「急所1/8」、1/2→橙「急所1/2」、確定→赤「確定急所」

### バグ修正（V3.1 以降）

#### ギルガルド バトルスイッチ: 防御側でフォルム切替時にダメージ計算が更新されないバグ
- `useDamageCalc` の `useEffect` 依存配列に `baseStats` / `types` / `weight` が含まれていなかった
- `setBlade` は `baseStats` を入れ替えるが `effectiveAbility` は `'バトルスイッチ'` のまま変わらないため、旧依存配列ではどのキーも変化せず useEffect が再実行されなかった
- 攻守交代後に防御側でシールド⇔ブレード切替をすると計算が古い baseStats のままになっていた
- 修正: 攻撃側/防御側それぞれに `baseStats` / `types` / `weight` を deps に追加

#### おやこあい: 急所込みKO確率の親・子独立スロット化
- **変更前**: 親+子の合算ロールを1スロットとして急所混合していたため、「片方だけ急所」(約11.7%) が未考慮
- **変更後**: `AccumEntry` に `pbParentRolls/pbParentCritRolls/pbParentRawRolls/pbParentRawCritRolls/pbChildRolls/pbChildCritRolls` を追加
  - `handleAddToAccum` (isParentalBond && !isDisguiseIntact 時) で親・子の単体ロールを個別保存
  - `useAccumulatedDamage` で `pbChildRolls` が存在する場合に2スロット（親・子）へ展開
  - 通常KO確率・ダメージ分布は合算ロール（`e.rolls`）のまま変更なし
- 急所率が高い（きあいだめ等）場合ほど補正効果が大きい

#### スキルリンク特性 + いかさまダイス（準備）
- `KoProbabilityCalc.ts` に新分布定数を追加:
  - `VARIABLE_MULTI_HIT_DIST_SKILL_LINK`: 確定5発（確率1.0）
  - `VARIABLE_MULTI_HIT_DIST_LOADED_DICE`: 4発50% / 5発50%
- `getVariableMultiHitDist(attackerAbility, attackerItem)` helper を追加
  - スキルリンク → 確定5発分布、いかさまダイス → 4/5発分布、それ以外 → 通常2〜5発分布
- `calcVariableMultiHitKo` に `dist` パラメータを追加（デフォルト: 通常分布）
  - `minDmg/maxDmg` を分布の最小・最大ヒット数から動的に算出
- `VariableMultiHitPanel` が `dist` prop を受け取り列数を動的に変更（1/2/4列）
- 技名バッジ: スキルリンク→「確定5回」、いかさまダイス→「4〜5回」
- 加算ボタンのデフォルト回数: 変動連続技は分布の最大ヒット数（スキルリンク=5）
- `items.json` に「いかさまダイス」（`loaded-dice`）を追加
- 急所込みKO確率: `usages` 分だけ独立スロットを生成する既存ロジックで正しく処理される（スキルリンク5発=5スロット独立急所判定）

#### エアスラッシュの critChance 誤設定を修正
- エアスラッシュは高怯み技（30%怯み）であり高急所技ではないため `critChance: 1` を削除
- 飛行タイプ高急所技はエアカッターが正しい（設定済み）

#### ハラバリー特性の和訳化
- `abilities.json` / `pokemon.json` の `Electromorphosis` → `でんきにかえる` に変更

#### じゅうでん状態の手動トグル
- 攻撃側パネルに「じゅうでん (×2)」トグルボタンを追加（攻撃側のみ表示）
- `pokemonStore.chargeActive: boolean` / `setChargeActive(v)` を追加
- `DamageCalculator.resolvePower` で `attackerChargeActive && moveType === 'でんき'` のとき威力を 2 倍化
  - エレキスキンによるノーマル→でんき変換後の技にも対応（`resolveMoveType()` 経由で判定）
- `CalculateDamageUseCase` / `FindOptimalSpUseCase` / `DurabilityPanel` / `useDamageCalc` / 攻守交代 `swapStores` すべてに `chargeActive` を伝搬

#### ダメージ乱数を 15 段階 (86〜100%) → 16 段階 (85〜100%) に変更
- 最新パッチで過去作通りの 16 段階乱数へ修正された仕様に追従
- `DamageCalculator.calculateDamage`: ロール生成ループを `r=86..100` → `r=85..100` に変更
- `DamageResult.rolls` のタプル型を 15 要素 → 16 要素に更新
- `useDamageCalc` の段階威力型合算で `summedRolls[14]` → `summedRolls[15]`
- `DamageCalculator` の `max = effectiveRolls[14]` → `effectiveRolls[15]`
- ゼロロール配列（無効タイプ・威力0）を 15 → 16 要素に拡張
- 検証テスト・ラベル・コメントをすべて 16 段階仕様に更新

### V3.3.0: 複数計算状態を保持できるタブバー機能 + データ追加・修正

#### タブバー方式のセッション管理
- ブラウザの複数タブで「計算結果を保持しながら別の計算もする」運用を、アプリ内で完結できるようにした
- 画面上部にブラウザ風のタブバーを表示し、タブをクリックすると計算状態全体
  （攻撃側・防御側・フィールド・累積ダメージ）をまるごと切り替える
  - `＋` で新規タブ（デフォルト盤面）、`×` でタブを閉じる、タブ名をダブルクリックでリネーム
  - メモリ上のみで保持（ページ再読込でリセット = 従来のブラウザタブ運用と同じ挙動）

##### 設計（既存ストアを「ライブ状態」に保つスナップショット方式）
- 既存の `useAttackerStore` / `useDefenderStore` / `useFieldStore` / `useAccumStore` を
  「ライブ（作業中）状態」として維持したまま、タブ切替時に **スナップショット保存 → 復元** する
  - 各コンポーネントは従来どおり同じストアを直接購読するため、UI側の改修は不要
  - `useResultStore` は派生（`useDamageCalc` が自動再計算）のため復元不要
- `src/presentation/store/sessionSnapshot.ts`（新規）
  - `snapshotLiveState()`: ライブストアからスナップショットを取得。配列・オブジェクト
    （`sp`/`ranks`/`statNatures`/`moves`/`movePowers`/`baseStats`/`types`/`entries` の各ロール配列等）
    をすべて深くコピーし、ライブストアと参照を共有させない
  - `restoreState(snap)`: `setState`（マージ）で各ストアへ復元。アクション関数は保持される。
    復元時も再複製しタブ側スナップショットを汚さない
  - `cloneSnapshot()` / `cloneAccumEntry()` で `structuredClone` を使わずフィールド単位で複製
    （`tsconfig` の lib が ES2020 のため）
- `src/presentation/store/sessionStore.ts`（新規）
  - `Tab { id, name, snapshot }` の配列と `activeTabId` を管理
  - `initFirstTab` / `createTab` / `duplicateTab` / `switchTab` / `renameTab` / `closeTab`
  - 切替・新規・複製・クローズ時は必ず現アクティブタブへライブ状態をスナップショット保存してから遷移
  - 新規タブ（`＋`）は追加直前に表示されていたタブの計算状態を複製して開く（計算の継続性）
  - クローズ: 最終1タブは閉じない（×非表示）、アクティブタブを閉じたら左隣へ切替
- `src/presentation/components/session/SessionTabsBar.tsx`（新規）
  - タブUI（クリック切替・ダブルクリックでインラインリネーム・×でクローズ・＋で新規）
  - `Calculator.tsx` の最上部（`DamageSummaryHeader` の上）に配置
- `Calculator.tsx`: 初回マウントの `useEffect` で `initDefaults()` 後に `initFirstTab('タブ 1')` を実行
  （`tabs.length > 0` ガードで StrictMode の二重実行を防止）

#### 攻守交代バグ修正（きあいだめ状態の欠落）
- `Calculator.tsx` の `swapStores` の `pick` に `focusEnergyActive` が欠落しており、
  攻守交代するときあいだめ状態が失われていたのを修正
- 同フィールドはタブのスナップショット対象にも含める

#### データ追加・修正（V3.3.0）
- **技「ダメおし」（Assurance）** に `powerOptions: [60, 120]` を追加
  （相手が既にダメージを受けている場合に威力60→120。しっぺがえし [50,100] と同様の手動選択方式）
- **技「ナイトバースト」（Night Daze）** の威力を 85 → 90 に修正
- **技「うらみつらみ」** を `moves.json` に追加（ゴースト/特殊/威力75/命中100/PP12/非接触）
- **特性「すいほう」をダメージ計算に実装**
  - `abilities.json` には登録済みだったが `DamageCalculator` 側で未処理だった
  - 攻撃側がすいほう → みず技 ×2、防御側がすいほう → ほのお技 ×0.5
    （やけど無効化はダメージ計算外のためスコープ外）
- **ヒスイゾロアーク** を `pokemon.json` に追加
  （ノーマル/ゴースト、特性イリュージョン、H55/A100/B60/C125/D60/S110、体重73.0kg、id=10504）
- **ヌメルゴン** のタイプ誤りを修正（ドラゴン/フェアリー → ドラゴン単タイプ）

### V3.2.0: 急所率修正 + KoProbabilityCalc 拡張

#### ランク0急所率を 1/16 → 1/24 に修正（Gen 7+ 仕様）
- `CritRank.ts` の `CRIT_RANK_TABLE[0]` を `1/16` → `1/24` に変更
- Gen 7（SM）以降の仕様に追従（Pokemon Champions は Gen 9 ベース）
- 関連するコメント・スキーマ定義・UI ツールチップを同時に更新:
  - `src/domain/models/Move.ts`: `critChance` フィールドコメント
  - `src/data/schemas/types.ts`: `critChance` フィールドコメント
  - `src/presentation/store/accumStore.ts`: `critChance` フィールドコメント
  - `src/presentation/components/results/DamageSummaryHeader.tsx`: tooltip 文言

#### KoProbabilityCalc 拡張（将来の変動連続技対応基盤）
- `calcCombinedDamageDistribution` / `calcCombinedKoProbability` のスロット型を
  `number[]` から `number[] | Map<number, number>` に拡張（事前計算済み分布を直接渡せる）
- `AttackSlot` 型を追加（`AttackRollsWithCrit | { precomputed: Map<number, number> }`）
- `calcCombinedDamageDistributionWithCrit` が `AttackSlot[]` を受け付けるよう拡張
- `calcVariableHitsSingleUsageDist(rolls, dist, rawRolls?)` を追加
  - 変動連続技 1 使用分のダメージ分布をヒット数確率で重み付けして計算
- `calcVariableHitsSingleUsageDistWithCrit(rolls, critRolls, critChance, dist, ...)` を追加
  - 同・急所込み版（各発で独立に急所判定）
- `AccumEntry` に `variableHitDist?: { hits: number; prob: number }[]` を追加（オプション）
- 累積パネルの `×N` はヒット数の意味を維持（個別に発数指定可能）

### V3.1.5 以降: pkdx クロスチェック

#### pkdx クロスチェックで発見・修正したバグ

**バグ1: フィールド補正が乱数より後に適用されていた**
- 修正前: `applyOtherModifiers` 内で各ロールに `pokeRound(d * 1.3)` を適用（乱数 r=89/90/91/95/97/99 で 1 ダメージ低く出る）
- 修正後: `applyFieldModifier()` を新設し、乱数より前に damage_base へ round5(5325) で適用
- 修正により Gen8+ / Showdown の canonical 挙動と一致
- 影響: エレキ/グラス/サイコ（+30%）と グラス×じしん/サイコ×ドラゴン/ミスト×ドラゴン（-50%）

**バグ2: はたきおとすの`special: "knock-off"`が未実装**
- `SpecialMoveCalc.ts` に `'knock-off'` ケースが存在せず、`powerOptions` も未設定
- 修正: `special` タグを `null` に戻し、`powerOptions: [65, 97]` を追加
- 相手の持ち物有無に応じてユーザーが手動で選択できるように

**バグ3: やけっぱち / アクロバットで条件付き威力が UI から選択不可**
- やけっぱち: HP半分以下で威力2倍 → `powerOptions: [75, 150]` を追加
- アクロバット: 持ち物なしで威力2倍 → `powerOptions: [55, 110]` を追加

**バグ4: ハードプレスの威力が `null` で計算に乗っていなかった**
- HP満タンの相手で威力100、相手のHP割合に応じて減少する鋼タイプ技
- `power: 100`（デフォルト = 満タン基準）に修正し、`powerOptions: [25, 50, 75, 100]` を追加

#### pkdx クロスチェックテスト
- `tests/domain/pkdxCrossCheck.test.ts` を新設
- pkdx v0.4.12 の e2e_scenarios_test.mbt に記載された golden 値を
  このプロジェクトの `calculateDamage()` に通した結果と比較
- ウェザーボール in はれ: min=114 / max=135（pkdx と完全一致）
- エレキフィールド中のでんき技: 16 ロール全てが pkdx と一致
- STAB / タイプ相性 / 急所 / 壁 / いろめがね もすべて一致

#### pkdx との既知の差分
- **つけあがる の基準**: pkdx は `def_rank_up_count`（相手のランク）、
  このプロジェクトは `attackerRankModifiers`（自分のランク）で計算
  → このプロジェクト側が canonical（Stored Power / Power Trip は Gen7+ で「自分のランク上昇数」基準）

#### データ修正（V3.1.5 以降）
- **メガキラフロル** を `pokemon-mega.json` に追加（いわ/どく、特性てきおうりょく、H83/A90/B105/C150/D96/S101、体重45.0kg）
- **メガチリーン** を `pokemon-mega.json` に追加（エスパー/はがね、特性ふゆう、H75/A50/B110/C135/D120/S65、体重8.0kg）
- **ジジーロン** を `pokemon.json` に追加（ノーマル/ドラゴン、特性ぎゃくじょう/そうしょく/ノーてんき、H78/A60/B85/C135/D91/S36、体重185.0kg、id=780）
- **ダダリン**（id:781）の日本語名が「ジジーロン」と誤記されていたのを修正
- **メガジジーロン** を `pokemon-mega.json` に追加（特性ぎゃくじょう、H78/A85/B110/C160/D116/S36、体重240.5kg）
- **メガエアームド** を `pokemon-mega.json` に追加（はがね/ひこう、特性すじがねいり、H65/A140/B110/C40/D100/S110、体重40.4kg）
- **メガウツボット** を `pokemon-mega.json` に追加（くさ/どく、特性とびだすなかみ、H80/A125/B85/C135/D95/S70、体重125.5kg）
- **メガルチャブル** を `pokemon-mega.json` に追加（かくとう/ひこう、特性ノーガード、H78/A137/B100/C74/D93/S118、体重25.0kg）
- **特性「ぎゃくじょう」「とびだすなかみ」** を `abilities.json` に追加
- **ドゲザン** を `moves.json` に追加（あく物理・威力85・必中・切る属性）
- **ひけん・ちえなみ** を `moves.json` に追加（あく物理・威力65・命中90・PP16・接触/切る属性、ヒスイダイケンキの専用技。まきびし設置効果はダメージ計算外）
- **はめつのひかり** を `moves.json` に追加（フェアリー特殊・威力140・命中90・PP8、反動フラグあり）
- **英語表記の特性を日本語化**: `Stamina` → `じきゅうりょく`、`Stalwart` → `すじがねいり`、`Toxic Debris` → `どくげしょう`、`Zero to Hero` → `マイティチェンジ`
  - 影響ポケモン: ブリジュラス・ドンカラス・バンバドロ・ジュラルドン・キラフロル
  - `abilities.json` の `name` フィールドと `pokemon.json` の `abilities` 配列の両方を修正
- **特性「あついしぼう」をダメージ計算に実装**
  - `abilities.json` には登録済みだったが `DamageCalculator` 側で未処理のため計算結果に反映されていなかった
  - 防御側があついしぼうのとき、ほのお/こおり技を 0.5 倍（もふもふの直後にロジック追加）
- **ヒスイダイケンキ** を `pokemon.json` に追加（みず/あく、特性げきりゅう/きれあじ、H90/A108/B80/C100/D65/S85、体重58.2kg、id=10503）
- **ヒスイバクフーン** を `pokemon.json` に追加（ほのお/ゴースト、特性もうか/おみとおし、H73/A84/B78/C119/D85/S95、体重69.8kg、id=10502）
- **ひゃっきやこう** の威力修正: 60→65、`special: "hex"` → `null`、`powerOptions: [65, 130]` を追加（たたりめと同様の手動選択方式で相手の状態異常時2倍に対応）
- **特性「きれあじ」をダメージ計算に実装**
  - `abilities.json` には登録済みだったが `DamageCalculator` 側で未処理のため計算結果に反映されていなかった
  - 攻撃側がきれあじのとき、切る属性技（`flags.slice`）の威力を 1.5 倍
- **特性「メガランチャー」を実装・日本語化**
  - `abilities.json` の `name` が英語表記のままだった（"Mega Launcher" → "メガランチャー"）
  - `pokemon.json` のクラブ系列も同様に修正
  - 攻撃側がメガランチャーのとき、はどう属性技（`flags.pulse`）の威力を 1.5 倍
- **特性「きもったま」をダメージ計算に実装**
  - `abilities.json` には登録済みだったが `DamageCalculator` 側で未処理のため、ゴーストタイプにノーマル/かくとう技が当たらないままだった
  - 攻撃側がきもったまでノーマル/かくとう技を使うとき、`effectiveDefenderTypes` からゴーストを除外してタイプ相性を計算
- **半減実（タイプ半減きのみ）の大規模修正**
  - `items.json` の日本語名と英語名の対応が大半で誤っていた
    - 例: ヤチェのみ（こおり半減）が `リリバのみ` と誤記、ヨプのみ（かくとう半減）が `チイラのみ` と誤記、など計 11 件
  - `DamageCalculator.ts` の `halfBerries` マップも同じ誤対応を踏襲しており、半減効果が誤った日本語名でしかトリガーされなかった
  - **カシブのみ（ゴースト半減）** が完全に欠落していたため追加
  - **ホズのみ（ノーマル半減）** はノーマル技に対し「効果抜群でなくても」発動するため、判定に専用分岐を追加
  - 対応 18 種（Pokémon Champions の名称体系に準拠）: オッカ(ほのお)/イトケ(みず)/ソクノ(でんき)/リンド(くさ)/ヤチェ(こおり)/ヨプ(かくとう)/ビアー(どく)/シュカ(じめん)/バコウ(ひこう)/ウタン(エスパー)/タンガ(むし)/ヨロギ(いわ)/カシブ(ゴースト)/ハバン(ドラゴン)/ナモ(あく)/リリバ(はがね)/ロゼル(フェアリー)/ホズ(ノーマル)
    - **注**: 本家ポケモン本編とは一部の日本語名・タイプ対応が異なる（例: 本編「ヨアギ→ヨロギ」「ホズのみははがね→ノーマル」「ジャポのみ→ホズのみに置換」）

#### 半減実の消費仕様（連続技・おやこあい対応）
- **仕様**: 半減実は1発目のヒット時に発動・消費 → 2発目以降は無効
- **修正前**: `applyOtherModifiers` が呼ばれるたびに半減実を適用するため、おやこあい・連続技・累積使用すべてで半減効果が継続するバグ
- **修正後**:
  - `DamageCalcInput` に `skipHalfBerry?: boolean` フラグを追加。`true` のとき半減実をスキップ
  - `wouldHalfBerryActivate(item, moveType, typeEff)` ヘルパーを export し、`useDamageCalc` から発動有無を判定
  - `useDamageCalc.ts` で 半減実発動時 OR マルチスケイル発動時 に「2発目以降」用の `rawResult` を生成（`skipHalfBerry: true` + `abilityActivated: false`）
  - `DamageResultRow.tsx` の `hadMultiscale` フラグを「1発目限定効果が発動中」に意味拡張（HP満タン特性 OR 半減実）
  - 既存の `rawRolls` パスを介して、固定/変動/段階威力連続技・おやこあいの子・累積2発目以降 すべてに正しく適用される
- 既知の制限: 累積で「2番目以降のエントリで初めて半減実が発動するシナリオ」は未対応（マルチスケイルの既存制限と同様）

#### タイプ強化アイテム
- **シルクのスカーフ** (silk-scarf, ノーマル+20%) を `items.json` に追加し、`DamageCalculator` の `typeBoostItems` にも登録
- 既存バグ修正: `typeBoostItems` の みずタイプ強化キーが `'しんかいのキバ'` になっていたが、`items.json` には `しんぴのしずく` しか登録されていないため、みず強化アイテムの効果が常時不発だった → `'しんぴのしずく': 'みず'` に修正

#### くだけるよろい: 連続技・おやこあいの Bランク累積低下対応
- **仕様**: 物理技が当たるたびに防御側 B ランクが -1（最大 -6 まで）
- **escalating 連続技**（トリプルアクセル等）: `useDamageCalc` の `calcEscalating` 内で
  `withWeakArmorDrop(hitInput, idx)` を適用（idx発目にBランクをidx段階下げる）
- **fixed 連続技**（ドラゴンアロー等）: `useDamageCalc` が各発個別結果 `weakArmorPerHitResults` /
  `weakArmorCritPerHitResults` を計算して `MoveResult` に格納
  - `DamageResultRow.tsx` の `computeEffectiveRolls` でこれを優先使用して合算
  - KO確率も合算ロールから `calcKoProbability` で再計算
- **variable 連続技**（つららばり・スケイルショット・ロックブラスト等）:
  最大5発の各発で B-0 / B-1 / B-2 / B-3 / B-4 と段階的にランク低下を反映
  - `useDamageCalc` が `rawResult`（B-1）に加え `weakArmorVariableRawResults`（B-2, B-3, B-4）
    を追加計算して `MoveResult` に格納
  - `KoProbabilityCalc.calcKoProbabilityForNHits` と `calcVariableMultiHitKo` の `rawRolls` を
    `number[] | number[][]` に拡張し、per-hit ロールを受け取れるよう改修
  - `VariableMultiHitPanel` が `weakArmorRawRollsByHit` を受け取り、ヒット数別ダメージ範囲・
    KO確率・期待ダメをすべて段階低下込みで再計算
  - **急所込み加重平均**: `calcVariableMultiHitKoWithCrit` を新設し、各発で独立に
    `critChance` で通常/急所ロールを加重混合 → ヒット数分布で加重平均。
    `VariableMultiHitPanel` が `critRolls` / `rawCritRolls` / `weakArmorRawCritRollsByHit` /
    `critChance` を受け取り、急所率が `0 < critChance < 1` のとき
    「期待KO確率（急所込み）」行を追加表示する
- **おやこあい** (おやこあい): `rawResult`（子ヒット用素ダメ）を
  `withWeakArmorDrop(subsequentInput, 1)` で計算 → 子ロールが自動的に Bランク-1 を反映
- **単発技**: 変化なし（1発目はランク低下前のBで計算するのが正しい仕様）
- **abilityActivated トグルは不要**: くだけるよろいはHP条件がないため、特性名の一致と
  `move.category === '物理'` のみで発動判定する
- 実装ファイル: `useDamageCalc.ts`、`resultStore.ts`、`DamageResultRow.tsx`、
  `DamageResultArea.tsx`、`KoProbabilityCalc.ts`

#### じきゅうりょく: 連続技・おやこあいの Bランク累積上昇対応
- **仕様**: 攻撃を受けるたびに防御側 B ランクが +1（最大 +6 まで）
- Defランク上昇は物理ダメージにのみ影響するため、ダメージ計算には**物理技のみ**反映
  （特殊技でも本来の特性は発動するが、ダメージは変わらない）
- くだけるよろいと同じ多段技対応経路（escalating / fixed / variable / おやこあい）に**符号反転**で乗せる
  - `defenderStamina = effectiveAbility === 'じきゅうりょく' && category === '物理'`
  - 共通フラグ `hasPerHitDefShift = defenderWeakArmor || defenderStamina`
  - 共通ヘルパー `withPerHitDefShift(input, drops)` が `defender.ranks.def` に
    `defenderWeakArmor → -drops`、`defenderStamina → +drops` を加算
- **escalating**（トリプルアクセル等）: 1発目=B+0, 2発目=B+1, 3発目=B+2 で
  威力上昇とランク上昇が同時進行 → 後発の威力増加が部分的にランク上昇で打ち消される
- **fixed**（ドラゴンアロー: 3発）: 各発 B+0 / +1 / +2 で計算し合算
- **variable**（スケイルショット 等）: B+0 〜 B+4 までの per-hit 結果を生成
  - 既存の `weakArmorVariableRawResults` 配列に B+2/+3/+4 が入る形で再利用
- **おやこあい**: 子ヒットは `withPerHitDefShift(subsequentInput, 1)` 経由で B+1 反映
- **abilityActivated トグルは不要**: HP条件がないため特性名一致と物理判定だけで発動
- リファクタ: 元の `withWeakArmorDrop` を `withPerHitDefShift` にリネーム。
  `MoveResult` 側の `weakArmorPerHitResults` 等のフィールド名は両特性共用のまま据え置き
  （内部実装が両ケースを生成）

#### 固定多段技の加算バグ修正（ドラゴンアロー等）
- **バグ**: `handleAddToAccum` が `effectiveRolls`（N発合算）を `usages=1` で加算していたため、
  累積DPが「合算ダメージ1回分」として扱い、分布が不正確だった
- **修正**: `multiHit.type === 'fixed' && count > 1 && !isDisguiseIntact` を検出し、
  - `rolls`（1発分の per-hit ロール）を加算エントリの `rolls` として使用
  - `usages = multiHit.count`（ヒット数）を設定（ドラゴンアローなら2）
  - じきゅうりょく/くだけるよろい発動時: `activeRawResult.rolls`（B±1の2発目ロール）を
    `rawRolls` として保存し、`hadMultiscale=true` でDPに伝達
    → 1発目はB±0、2発目はB±1で各スロットを独立計算
  - ばけのかわ発動時は従来通り合算（効果なし発を除いた残発分）で保存

#### イルカマン マイティチェンジ対応
- **バグ**: 特性名が英語表記 `Zero to Hero` のままで、フォルム変更後の種族値が反映されていなかった
- **修正**:
  - `abilities.json` / `pokemon.json` の特性名を `マイティチェンジ` に和訳
  - `pokemonStore.ts` に `isMighty: boolean` と `setMighty(enable: boolean)` を追加
    （`setBlade` と同じパターン）
  - ナイーブ → マイティ切替時に `baseStats` を `{hp:100, atk:160, def:97, spa:106, spd:87, spe:100}` に上書き
  - マイティ → ナイーブ切替時は `PokemonRepository.findById(pokemonId)` から元の種族値を復元
  - `setPokemon` / `reset` で `isMighty: false` にリセット
  - `Calculator.tsx` の `swapStores` の `pick` に `isMighty` を追加
  - `PokemonPanel.tsx` で `effectiveAbility === 'マイティチェンジ'` 時にフォルム切替ボタンを表示

### V3.5.0: 累積に「痛み分け（Pain Split）」挟みを実装（2セグメント分割DP）

#### 概要
- 攻撃側が複数回技を撃つ間に防御側が痛み分けを挟むケースを累積パネルで再現可能に
- 痛み分け = 攻撃側現在HPと防御側現在HPの合計を2で割って両者をその値にする
- 加算リストの各エントリ右側に **「+痛み分け」ボタン** を追加。クリックでそのエントリ直後に痛み分けカード（攻撃側HP入力欄＋削除ボタン）が出現
- 同じエントリに複数回挿入可・複数の異なるエントリに挿入可
- エントリ削除時は連動する痛み分けも自動削除
- タブ間のスナップショットにも `painSplits` を含めて保持

#### 実装アプローチ：2セグメント分割DP
- 痛み分け挿入位置で DP を N+1 セグメントに分割
- 各セグメント末尾で残HP分布を `floor((attackerHp + remainHp) / 2)` で変換し、次セグメントの初期分布として渡す
- 通常 KO 確率・急所込み KO 確率の両方に対応

#### 新規/拡張関数（`KoProbabilityCalc.ts`）
- `applyPainSplitToDmgDist(dmgDist, defenderMaxHp, attackerCurrentHp)`：累積ダメージ分布を痛み分けで変換
- `calcCombinedDamageDistribution(rollSets, init)` / `calcCombinedDamageDistributionWithCrit(attacks, init)`：第2引数の `offset: number` を `init: number | Map<number, number>` に拡張（後方互換維持）。セグメント連結時は前セグメント終端の分布をそのまま初期分布として渡せる

#### データモデル拡張（`accumStore.ts`）
- 新しい `PainSplit { id, afterEntryId, attackerHp }` 型
- `painSplits: PainSplit[]` フィールド
- アクション: `addPainSplit / removePainSplit / setPainSplitAttackerHp`
- `removeEntry` で `painSplits.filter(p => p.afterEntryId !== id)` も連動
- `clearEntries` で `painSplits` も初期化

#### フック改修（`useAccumulatedDamage.ts`）
- エントリ走査時、`painSplitsByEntryId` Map を引いて該当エントリ末尾でセグメントを切る
- セグメント順次 DP 実行 → 末尾で `applyPainSplitToDmgDist` 適用 → 次セグメントへ
- `totalMin/Max` は最終分布の key 範囲から取得（旧: `moveMin + totalConst` は痛み分けで残HPが変動するため使えない）

#### UI（`DamageAccumPanel.tsx`）
- 攻撃側ストアから `calculateHP(baseStats.hp, sp.hp)` で攻撃側最大HPを算出 → 痛み分け挿入時のデフォルト値・「最大{HP}」表示に使用
- 痛み分けカードは accent 色のボーダー・背景で視覚的にエントリと区別

#### スナップショット（`sessionSnapshot.ts`）
- `AccumSnapshot.painSplits: PainSplit[]` を追加
- `cloneAccumSnapshot` で深いコピー、`snapshotLiveState` / `restoreState` も対応

#### テスト（`KoProbabilityCalc.test.ts`）
- 7件追加：
  - 単一ダメージ点 / 攻撃側HP<残HPで追加ダメ / 複数点の分布変換
  - newRemain が defenderMaxHp で上限クランプ
  - 既に瀕死キー (dmg≥defenderMaxHp) は残HP=0扱い
  - 2セグメント分割で「攻撃→痛み分け→攻撃」が機能する end-to-end
  - 初期分布として Map を受け取る `calcCombinedDamageDistribution`

### V3.6.0: バトルシーケンス（2D同時分布シミュレーション）

#### 概要
- 攻撃側が複数ターン技を撃つ間に、防御側の反撃（被ダメ）・痛み分け・定数ダメ/回復を挟む多ターンシナリオを、**(攻撃側HP, 防御側HP) の同時確率分布**を時系列で変換してシミュレートする
- 例: 控目CSメガゲンガー vs 腕白HD特化カバルドン
  - T1: 鬼火（防御側火傷）→ カバルドンの地震を耐える（被ダメ）
  - T2: 痛み分け（両HP平均化で回復＆与ダメ）→ さらに地震を耐える
  - T3: 祟り目（威力130）でカバルドンを撃破できるか？
- 出力: **防御側撃破確率 / 攻撃側生存確率 / 両者生存確率** と、各ステップ後の攻守残HP範囲

#### コアエンジン（`src/domain/calculators/BattleSequenceCalc.ts`）
- `runBattleSequence(events, attackerMaxHp, defenderMaxHp, opts)` が 2D DP を実行
- 状態 = `Map<number, number>`（key = `aHP * (defenderMaxHp+1) + dHP`、両者HP>0 のマスのみ live）
- 防御側0以下 → `koProb`（吸収）、攻撃側0以下 → `faintProb`（吸収）。move 順で各イベントが一方向のため同時瀕死は起きず、`koProb + faintProb + bothAlive = 1` が常に成立
- イベント種別: `attack`（与ダメ）/`incoming`（被ダメ）/`painSplit`/`defenderConst`/`attackerConst`/`defenderRecover`/`attackerRecover`
- 痛み分け: 各マスで `floor((aHP + dHP) / 2)` に両者を均す（同時分布なので正確）
- `DmgDist = number[] | Map<number, number>`（一様ロール or 事前計算分布）

#### 被ダメの自動計算（攻守入替）
- `useBattleSequence` フック（`src/presentation/hooks/useBattleSequence.ts`）
  - `attack` ステップ: `resultStore` の既存計算結果（powerOptions・特性等反映済み）からロール取得
  - `incoming` ステップ: 攻撃側↔防御側を入れ替えて `executeDamageCalculation` を呼び、防御側の技による被ダメロールを算出（**防御側の火傷による物理半減も自然に反映**）
  - 防御側の `powerOptions`（たたりめ等）・確定急所も解決
- 各ステップ後の周辺HP分布・累積撃破/瀕死確率を返す

#### データモデル（`src/presentation/store/battleSequenceStore.ts`）
- `SeqStep { id, kind, moveName?, crit?, amount? }` の順序付きリスト
- `enabled` / `attackerStartHp` / `defenderStartHp`（null = 最大HP）
- アクション: `addStep / removeStep / updateStep / moveStep(±1) / clear / setStartHp`

#### UI（`src/presentation/components/results/BattleSequencePanel.tsx`）
- `Calculator.tsx` の中央カラム（`DamageResultArea` の下）に配置
- 有効トグル・開始HP入力・ステップ並べ替え（↑↓）・追加ボタン群
- 結果: 撃破/生存/両者生存の確率サマリ + ステップ別の攻守残HP範囲・累積確率テーブル

#### スナップショット（`sessionSnapshot.ts`）
- `BattleSequenceSnapshot` を `SessionSnapshot` に追加し、タブ切替・複製で保持

#### テスト（`tests/domain/BattleSequenceCalc.test.ts`）
- 9件: 単発KO・乱数半分KO・被ダメ生存・痛み分けの回復/減衰・定数ダメ・攻守同時確率分離・確率分割整合性（`ko+faint+bothAlive=1`）

### V3.6.1: 吸収技（ドレイン）のバトルシーケンス対応

#### 概要
- ドレインパンチ・ギガドレイン・きゅうけつ・ドレインキッス等の吸収技を、バトルシーケンスで「与ダメ＋回復」として同時シミュレート
- 2D同時分布DPの利点を活かし、攻撃イベントで**1ロールごとに防御側ダメージと攻撃側回復を同時適用**

#### データ拡張
- `Move.ts` / `schemas/types.ts` の `MoveRecord` に `drain?: number`（与ダメに対する回復率）を追加
- `moves.json` の吸収技8件に付与:
  - 0.5: すいとる・メガドレイン・ギガドレイン・ドレインパンチ・きゅうけつ・ウッドホーン・パラボラチャージ
  - 0.75: ドレインキッス

#### エンジン（`BattleSequenceCalc.ts`）
- `attack` / `incoming` イベントに `drain?: number` を追加
- `attack` + drain: 各ロールで `actual = min(roll, 防御側残HP)` → 攻撃側を `floor(actual × drain)`（最低1）回復（最大HPクランプ）
  - 防御側KO時は koProb 吸収（撃破済みのため回復不要）
- `incoming` + drain: 相手（防御側）が被ダメに応じて回復（相手が吸収技を使うケース）

#### フック（`useBattleSequence.ts`）
- `attack` / `incoming` ステップ解決時に `MoveRepository.findByName(moveName).drain` を読み取りイベントへ伝搬
- ラベルに「（吸収50%）」「（相手吸収75%）」を表示

#### テスト
- `BattleSequenceCalc.test.ts` に5件追加（回復・最大HPクランプ・実ダメージクランプ・相手吸収・回復で被ダメを耐える対照テスト）

---

## 重要なファイルと役割

| ファイル | 役割 |
|----------|------|
| `src/domain/calculators/CritRank.ts` | 急所ランク計算（技・特性・アイテム・きあいだめを統合して急所率を返す） |
| `src/domain/calculators/DamageCalculator.ts` | コアダメージ計算（タイプ相性・STAB・特性等） |
| `src/domain/models/Move.ts` | Move 型定義、`selfStatDrop` / `selfStatDrops` / `alwaysCrit` / `critChance` / `escalating` フィールドを含む |
| `src/data/schemas/types.ts` | JSON スキーマ型定義（MoveRecord に上記フィールドすべてあり） |
| `src/data/json/moves.json` | 技データ（日本語名・英語名・威力・命中・特殊フラグ・`critChance` 等） |
| `src/presentation/hooks/useDamageCalc.ts` | 計算実行、`result` と `critResult` を返す |
| `src/presentation/store/sessionStore.ts` | タブ管理（生成・切替・複製・リネーム・クローズ）。切替時に現タブ保存→対象タブ復元 |
| `src/presentation/store/sessionSnapshot.ts` | ライブストアのスナップショット取得・復元ヘルパー（深いコピーで参照共有を防止） |
| `src/presentation/components/session/SessionTabsBar.tsx` | タブバー UI（クリック切替・ダブルクリックでリネーム・×でクローズ・＋で新規） |
| `src/presentation/store/resultStore.ts` | `MoveResult` 型（`result`, `critResult` の両方を保持） |
| `src/presentation/store/accumStore.ts` | 累積計算、entries + `painSplits` + `constDmg`/`constRec`/`poisonTurns` 状態 |
| `src/presentation/hooks/useAccumulatedDamage.ts` | 累積ダメージの totals/分布/KO確率を一元計算するフック（痛み分けで分布をセグメント分割DP） |
| `src/domain/calculators/KoProbabilityCalc.ts` | 累積KO確率DP、`applyPainSplitToDmgDist`（痛み分けの残HP分布変換）、変動連続技分布 |
| `src/domain/calculators/BattleSequenceCalc.ts` | バトルシーケンス2D同時分布DP（攻守HP・被ダメ・痛み分け・定数の時系列変換） |
| `src/presentation/store/battleSequenceStore.ts` | バトルシーケンスのステップ列・開始HP・有効フラグ |
| `src/presentation/hooks/useBattleSequence.ts` | ステップ解決（与ダメ=resultStore / 被ダメ=攻守入替）→ runBattleSequence 実行 |
| `src/presentation/components/results/BattleSequencePanel.tsx` | バトルシーケンスUI（ステップ編集・撃破/生存確率・残HPテーブル） |
| `src/presentation/components/results/DamageResultArea.tsx` | 結果行 + FieldStateBar + DamageAccumPanel の配置 |
| `src/presentation/components/results/DamageResultRow.tsx` | 急所トグル・自己デバフボタン・加算ボタン・期待ダメ表示・耐久調整トグル |
| `src/presentation/components/results/DamageSummaryHeader.tsx` | 最上部サマリーパネル（総合累積バー＋ヒストグラムのみ。加算なし時はプレースホルダー表示） |
| `src/presentation/components/results/DurabilityPanel.tsx` | 耐久調整パネル（個別技・H+B/D最適SP配分テーブル） |
| `src/presentation/components/results/AccumDurabilityPanel.tsx` | 耐久調整パネル（総合累積・HP投資のみ最適化） |
| `src/application/usecases/FindOptimalAccumDurability.ts` | 総合累積用の耐久調整ロジック（HP のみ列挙、もうどく再計算込み） |
| `src/presentation/components/results/DamageAccumPanel.tsx` | 加算リスト・定数ダメ/回復・もうどく入力 UI |
| `src/presentation/components/results/AccumHistogram.tsx` | 累積ダメージ分布ヒストグラム（整数 bin 化で離散分布対応） |
| `src/application/usecases/FindOptimalSpUseCase.ts` | 耐久調整ロジック（二分探索 + 全組み合わせ列挙） |
| `src/infrastructure/version.ts` | `__APP_VERSION__`（Vite が package.json から注入） |
| `src/domain/calculators/SpecialMoveCalc.ts` | 特殊技の威力解決（体重依存・ジャイロボール・ヘビーボンバー等） |
| `src/data/json/pokemon-mega.json` | メガポケモンデータ（`weight` フィールド含む全 74 件） |
| `tests/domain/pkdxCrossCheck.test.ts` | pkdx v0.4.12 の damage engine との挙動一致テスト |

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
