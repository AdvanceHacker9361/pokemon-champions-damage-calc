# Debug Context

このファイルは、Pokemon Champions Damage Calculator のデバッグ時に得た文脈・判断・修正内容を蓄積するためのメモです。

## 記録ルール

- このファイルは UTF-8 で保存する。
- PowerShell で確認する場合は `Get-Content -Encoding UTF8 debug.md` を使う。
- 文字化けした出力を貼り付けず、読める日本語として追記する。

## 2026-06-16: M-A 持ち物候補の網羅と反映

### 依頼内容

- M-A で使える持ち物が全て反映されていない。
- 持ち物の英語併記は不要。
- 持ち物入力はタイピング入力中に候補表示する形にする。
- 修正後、本番デプロイまで実施。

### 調査結果

- `src/data/json/items.json` は当初 49 件のみだった。
- V3.11.7 相当の参照コミットは `512e385` だったが、その時点の `items.json` も現行と同じ 49 件で、単純な履歴復元では網羅性は増えなかった。
- ローカル tag は `v1.0.0` のみで、V3.11 系 tag は存在しなかった。
- 持ち物の計算反映は `calcTag` ではなく、日本語名の文字列判定に依存している。
  - 主な実装箇所: `src/domain/calculators/DamageCalculator.ts`
  - 急所系: `src/domain/calculators/CritRank.ts`
  - いかさまダイス: `src/domain/calculators/KoProbabilityCalc.ts`
- `ItemSelect` はもともとテキスト入力 + 候補表示の combobox 形式だったが、英語名も候補内に表示していた。

### 半減実の状態

半減実は実装済み。

- `HALF_BERRIES` に 18 タイプ分の半減実が定義されている。
- 通常の半減実は「対応タイプ + 効果抜群」のときダメージ 0.5 倍。
- `ホズのみ` はノーマル技に対して等倍でも発動する例外。
- 連続技・おやこあいの 2 発目以降は `skipHalfBerry` により消費済み扱い。
- テストは `tests/domain/DamageCalculator.test.ts` の「半減実の skipHalfBerry」で確認されている。

### 実施した修正

対象ファイル:

- `src/data/json/items.json`
- `src/domain/calculators/DamageCalculator.ts`
- `src/presentation/components/pokemon/ItemSelect.tsx`
- `tests/domain/DamageCalculator.test.ts`

変更内容:

- `items.json` を 49 件から 131 件へ拡張。
  - 火力/能力系: `ちからのハチマキ`, `ものしりメガネ`, `パンチグローブ`, `メトロノーム`, `じゃくてんほけん`, `きゅうこん`, `じゅうでんち`, `のどスプレー`, `ものまねハーブ`, `ブーストエナジー`
  - 防御/補助系: `しんかのきせき`, `ふうせん`, `ゴツゴツメット`, `ぼうじんゴーグル`, `クリアチャーム`, `おんみつマント`, `だっしゅつボタン`, `だっしゅつパック`, `レッドカード`
  - 回復/きのみ: `たべのこし`, `くろいヘドロ`, `オボンのみ`, 混乱実、状態異常回復実、能力上昇実
  - タイプ強化: 既存のタイプ強化アイテムに加え、おこう系、プレート全 17 種、ジュエル全 18 種
- `ItemSelect.tsx` の候補表示から英語名の 2 行目を削除。
- `ItemSelect.tsx` の候補表示数を 12 件から 20 件に増やした。
- `ItemSelect.tsx` の placeholder を `入力して持ち物検索...` に変更。
- `DamageCalculator.ts` に追加反映。
  - `ちからのハチマキ`: 物理技 1.1 倍
  - `ものしりメガネ`: 特殊技 1.1 倍
  - `パンチグローブ`: パンチ技 1.1 倍
  - `しんかのきせき`: 防御/特防 1.5 倍
  - `ふうせん`: 接地していない防御側へのじめん技を無効化
  - おこう/プレート: 対応タイプ 1.2 倍
  - ジュエル: 対応タイプ 1.3 倍
- `tests/domain/DamageCalculator.test.ts` に追加持ち物補正の回帰テストを追加。

### 検証

ローカルで実行済み:

- `npm run typecheck`
- `npm run test -- --run tests/domain/DamageCalculator.test.ts tests/data/data-integrity.test.ts`
- `npm run lint`
- `npm run test`
- `npm run build`

GitHub Actions:

- PR CI: success
- main CI: success
- Deploy to GitHub Pages: success

### デプロイ情報

- ブランチ: `codex/restore-ma-items`
- コミット: `f17bbed Restore held item coverage`
- PR: `https://github.com/AdvanceHacker9361/pokemon-champions-damage-calc/pull/64`
- Merge commit: `c6747b2`
- 本番 URL: `https://advancehacker9361.github.io/pokemon-champions-damage-calc/`

### 注意点・今後の論点

- `nameEn` は UI 表示からは削除したが、データ互換・既存テスト・英語検索のため `items.json` には残している。
- 持ち物効果は現在も日本語名の文字列判定に依存しているため、名称ゆれがバグになりやすい。
- `calcTag` はほぼ計算に使われていない。将来的には `calcTag` ベースの判定へ寄せると安全。
- `こだわりスカーフ`, `きあいのタスキ`, `ひかりのこな`, `メガストーン`, `ゴツゴツメット`, `たべのこし`, `オボンのみ` などは、ダメージ単発計算ではなく速度・命中・瀕死耐え・反動/接触・回復タイミングなどの別モデルが必要なため、選択肢にはあるが単発ダメージ式へ自動反映しないものがある。
- 回復系は既存のイベント時系列/背景効果 UI で手動表現する設計。
- GitHub Actions に Node.js 20 actions deprecated の warning が出ている。将来、workflow の action version または Node 24 対応確認が必要。

## 2026-06-17: Reg.M-B メガムクホーク特性修正

### 依頼内容

- メガムクホークの特性を `あまのじゃく` に修正する。
- 能力変化が逆転する特性なので、計算機上で関連する挙動も確認する。
- この修正ではバージョン更新は行わない。
- `debug.md` に文脈を保存し、本番までデプロイする。

### 実施した修正

- `src/data/json/pokemon-mega.json`
  - `メガムクホーク` の特性を `いかく` から `あまのじゃく` へ変更。
- `src/presentation/components/results/DamageResultRow.tsx`
  - 技使用後の自ステータス変化ボタンで、攻撃側特性が `あまのじゃく` の場合にランク変化を反転。
  - 単一変化の `selfStatDrop` と複数変化の `selfStatDrops` の両方に対応。
  - ボタンの矢印・符号・ツールチップも反転後の実適用値に合わせる。

### 判断メモ

- `あまのじゃく` は単発ダメージ式へ直接倍率を掛ける特性ではない。
- ただし、このアプリには `りゅうせいぐん` や `アーマーキャノン` などの使用後ランク変化ボタンがあるため、ここは実用上の影響範囲として修正対象にした。
- 相手から受ける能力変化の反転は、現状 UI では手動ランク操作で表現する設計のため、自動イベント化は今回の範囲外。

## 2026-06-17: 技データ修正（ふんどのこぶし / ゴールドラッシュ）

### 依頼内容

- `ふんどのこぶし` の仕様を修正する。
  - これまでに受けた攻撃1回につき威力が50上がる。
  - 最大威力は350。
  - 手持ちに戻るとリセット。
  - パンチ系の技で、`てつのこぶし` の時は威力が1.2倍になる。
- `ゴールドラッシュ` を追加・修正する。
  - タイプ: はがね
  - 分類: 特殊
  - 威力: 120
  - 命中率: 95
  - PP: 8
  - 対象: 相手全体
  - 攻撃後、自分の `とくこう` ランクが2段階下がる。
- この修正ではバージョン更新は行わない。

### 実施した修正

- `src/data/json/moves.json`
  - `ふんどのこぶし` に `powerOptions: [50, 100, 150, 200, 250, 300, 350]` を追加。
  - `ふんどのこぶし` は既に `flags.punch: true` だったため、`てつのこぶし` の既存 1.2倍処理がそのまま適用される。
  - `ゴールドラッシュ` を新規追加。
  - `ゴールドラッシュ` に `selfStatDrop: { stat: "spa", stages: -2 }` を設定し、使用後C-2ボタンを出すようにした。
- `src/data/i18n/ja.json`
  - `make it rain` → `ゴールドラッシュ` の和訳を追加。
- `src/presentation/components/moves/MoveSlots.tsx`
  - 可変威力ボタンを折り返し可能にし、`ふんどのこぶし` の7段階威力でもUIが詰まりにくいようにした。
- `tests/data/data-integrity.test.ts`
  - `ふんどのこぶし` の威力選択肢とパンチフラグを固定テスト化。
  - `ゴールドラッシュ` のタイプ・分類・威力・命中・PP・C-2を固定テスト化。

### 判断メモ

- `ふんどのこぶし` の被弾回数は現在の単発計算状態から自動追跡できないため、手動の可変威力ボタンとして扱う。
- 手持ちに戻った時のリセットも、同じ理由で自動状態管理せず、ユーザーが威力50へ戻す運用にする。
- `ゴールドラッシュ` の「相手全体」対象はシングルバトルの単体ダメージ計算では直接の倍率影響がないため、技データ上の威力・命中・使用後ランク変化を優先して反映した。

## 2026-06-17: Reg.M-B メガ特性誤適用の復旧

### 発覚内容

- 本番でメガムクホークの特性がまだ `いかく` のままだった。
- 調査したところ、以前の特性修正が同名特性の別メガ個体へ当たっていた。
  - メガライボルト: `あまのじゃく` になっていた。
  - メガバシャーモ: `シェルアーマー` になっていた。
  - メガムクホーク: `いかく` のままだった。
  - メガペンドラー: `かそく` のままだった。

### 実施した修正

- `src/data/json/pokemon-mega.json`
  - メガライボルト: `いかく` へ復旧。
  - メガバシャーモ: `かそく` へ復旧。
  - メガムクホーク: `あまのじゃく` へ修正。
  - メガペンドラー: `シェルアーマー` へ修正。
- `tests/data/data-integrity.test.ts`
  - 上記4件の特性を固定テスト化し、同じ誤適用を検知できるようにした。

### 判断メモ

- 今後、同じ特性名を持つ複数メガ個体を修正する場合は、特性文字列の単純置換ではなく `key` 単位で確認する。
- 今回は本番データの誤りなので、バージョン更新なしで修正デプロイする。

## 2026-06-18: 攻守シミュレーションHP補正順序修正 / エレクトロビーム追加

### 依頼内容

- 攻守シミュレーションで、攻撃技の打ち合いの間に定数回復・定数ダメージを入れると、定数回復が無条件で最末尾に送られる。
- 定数回復・定数ダメージを操作順通りに並べてシミュレーションできるようにする。
- 未実装だった技 `エレクトロビーム` を追加する。
- ここまでの修正を本番デプロイ対象に含める。

### 実施した修正

- `src/presentation/components/results/DamageProgressionPanel.tsx`
  - `イベント追加` に `HP補正` グループを追加し、防御側/攻撃側それぞれのダメージ・回復を時系列イベントとして挿入できるようにした。
  - 攻撃側の技行には `+防ダメ` / `+防回復`、防御側から受ける技行には `+攻ダメ` / `+攻回復` のクイック挿入ボタンを追加した。
  - 背景効果側の `HP直接補正` は最終補正として残し、順序が必要な場合はイベント側を使う案内に更新した。
- `src/presentation/store/progressionStore.ts`
  - HP補正イベントを任意位置へ追加できるアクションを追加。
  - 防御側HP補正イベントも時系列結果へ影響するものとして判定するようにした。
- `tests/presentation/progressionStore.test.ts`
  - HP補正イベントが指定位置へ挿入されること、防御側HP補正が時系列影響ありとして扱われることを固定テスト化。
- `src/data/json/moves.json`
  - `エレクトロビーム` / `Electro Shot` を追加。
  - タイプ `でんき`、分類 `特殊`、威力 `130`、命中 `100`、PP `12` とした。
  - 使用後C+1ボタンを出すため `selfStatDrop: { stat: "spa", stages: 1 }` を設定。
- `src/data/i18n/ja.json`
  - `electro shot` → `エレクトロビーム` の和訳を追加。
- `tests/data/data-integrity.test.ts`
  - `エレクトロビーム` のタイプ・分類・威力・命中・PP・C+1を固定テスト化。

### 検証

- `npm run typecheck`
- `npm run lint`
- `npm run test -- --run tests/data/data-integrity.test.ts tests/presentation/progressionStore.test.ts tests/domain/BattleSequenceCalc.test.ts`
  - 68 tests passed。
  - sandbox 内では esbuild の `spawn EPERM` が出たため、通常権限で再実行。
- `npm run build`
  - sandbox 内では esbuild の `spawn EPERM` が出たため、通常権限で再実行。

### 判断メモ

- `エレクトロビーム` の溜めターン・雨時即発動は単発ダメージ倍率へ直接影響しないため、現状は通常の攻撃技として登録し、使用後のC+1を既存のランク変化ボタンで表現する。
- 攻守シミュレーションで順序が重要なHP補正はイベント時系列へ入れ、背景効果側の `HP直接補正` は従来通り最終補正として扱う。
- 今回はバグ修正と技データ追加のため、バージョン更新なしで修正デプロイする。

## 2026-06-21: サーフゴー特性の英語表記修正

### 発覚内容

- サーフゴーの特性が UI 上で `Good as Gold` のまま表示されていた。
- `abilities.json` の表示名と `pokemon.json` のサーフゴー個体データの両方が英語名を参照していた。

### 実施した修正

- `src/data/json/abilities.json`
  - `Good as Gold` の表示名 `name` を `おうごんのからだ` に変更。
  - `nameEn: "Good as Gold"` と `calcTag: "good-as-gold"` は英語参照・計算タグとして維持。
- `src/data/json/pokemon.json`
  - サーフゴー / `Gholdengo` の特性を `おうごんのからだ` に変更。
- `tests/data/data-integrity.test.ts`
  - サーフゴーの特性が `おうごんのからだ` であることを固定テスト化。
  - 対応する特性データに `nameEn: "Good as Gold"` が残っていることも確認対象にした。

### 検証

- `npm run typecheck`
- `npm run test -- --run tests/data/data-integrity.test.ts`
  - sandbox 内では設定ファイル探索時に `Access is denied` が出たため、通常権限で再実行。
  - 31 tests passed。
- `npm run lint`

### 判断メモ

- 表示名だけを日本語化し、英語名・計算タグは既存のデータ連携や内部識別用に残す。
- 今後、英語名が UI に出ているデータ修正では、ポケモン側の参照値と特性/技/道具側の表示名の両方を確認する。

## 2026-06-22: V3.14.1 急所時の防御ランク補正無効化修正

### 発覚内容

- 急所判定時に、防御側の `ぼうぎょ` / `とくぼう` ランク上昇が無視されていなかった。
- 原因は `executeDamageCalculation()` が先に `calculateStats()` でランク込みの実数値を作り、その後 `calculateDamage()` へ渡していたこと。
  - `calculateDamage()` 内では、急所かどうかは分かるが、防御側の元ランク情報がない。
  - そのため、急所補正 1.5倍や壁無効は働いていても、防御側ランク上昇だけが残っていた。

### 実施した修正

- `src/application/usecases/CalculateDamageUseCase.ts`
  - 急所が有効な場合、防御側の `def` / `spd` のプラスランクだけを 0 として実数値を再計算するようにした。
  - 防御側のマイナスランクは維持する。
  - `シェルアーマー` / `カブトアーマー` で急所が無効化される場合は、防御ランク上昇も無視しない。
  - 既存の `てんねん` 処理と競合しないよう、`てんねん` で防御ランクを 0 にした後、急所時のプラスランク無視を適用する順序にした。
- `tests/application/CalculateDamageUseCase.test.ts`
  - 物理技で防御側 `B+2` が急所時に無視されることを固定テスト化。
  - 特殊技で防御側 `D+2` が急所時に無視されることを固定テスト化。
  - 防御側 `B-2` は急所時にも維持されることを固定テスト化。
  - `シェルアーマー` では急所無効に加えて、防御ランク上昇も無視されないことを固定テスト化。
- `package.json` / `package-lock.json`
  - バージョンを `3.14.0` から `3.14.1` に更新。

### 検証

- `npm run typecheck`
- `npm run lint`
- `npm run test -- --run tests/application/CalculateDamageUseCase.test.ts tests/domain/DamageCalculator.test.ts tests/domain/pkdxCrossCheck.test.ts`
  - 61 tests passed。
  - sandbox 内では esbuild の `spawn EPERM` が出たため、通常権限で再実行。
- `npm run build`
  - sandbox 内では esbuild の `spawn EPERM` が出たため、通常権限で再実行。

### 判断メモ

- 急所時に無視するのは防御側のプラス防御ランクのみ。
- 防御側のランク低下は急所時にも攻撃側に有利な状態として残す。
- 急所無効特性がある場合は「急所として成立していない」ため、防御ランク上昇の無視も発生させない。

## 2026-06-24: メガライチュウX/Y 特性修正

### 発覚内容

- メガライチュウX/Y の特性が誤っていた。
- 現状データでは両方とも `サージサーファー` になっていた。
- 正しい特性は、メガライチュウX が `エレキメイカー`、メガライチュウY が `ノーガード`。

### 実施した修正

- `src/data/json/pokemon-mega.json`
  - `mega-raichu-x` の `ability` を `エレキメイカー` に変更。
  - `mega-raichu-y` の `ability` を `ノーガード` に変更。
- `tests/data/data-integrity.test.ts`
  - メガライチュウX/Y の特性を固定テスト化。

### 検証

- `npm run typecheck`
- `npm run lint`
- `npm run test -- --run tests/data/data-integrity.test.ts`
  - sandbox 内では設定ファイル探索時に `Access is denied` が出たため、通常権限で再実行。
  - 34 tests passed。
- `npm run build`
  - production build passed。

### 判断メモ

- 今回はデータ不備の修正のため、計算ロジック変更は行わない。
- 過去の Reg.M-B メガ特性誤適用と同様に、`key` 単位で固定テストを置いて再発を検知する。

## 2026-06-26: ウェザーボールとメガソーラーの実効天候対応

### 発覚内容

- `ウェザーボール` は通常の場の天候 `field.weather` だけを見ていた。
- 特性 `メガソーラー` が場にいる場合でも、晴れ相当として扱われず、威力100化・ほのおタイプ化・晴れ補正が反映されていなかった。
- `メガソーラー` はメガメガニウムの特性として `pokemon-mega.json` に存在する一方、`abilities.json` 側には未登録だった。

### 実施した修正

- `src/domain/calculators/DamageCalculator.ts`
  - `resolveEffectiveWeather()` を追加。
  - 攻撃側または防御側の特性が `メガソーラー` の場合、実効天候を `はれ` として扱う。
  - `ウェザーボール` の威力100化、タイプ変化、天候補正、`サンパワー` などの天候参照を実効天候ベースに統一。
- `src/domain/calculators/MoveResolution.ts`
  - 実効天候、天候込みの技タイプ、天候込みの表示威力を解決する helper を追加。
  - 計算本体・半減実判定・UI表示で同じ解決結果を使えるようにした。
- `src/application/usecases/CalculateMoveResultsUseCase.ts`
  - 半減実の事前判定で、`ウェザーボール` の変化後タイプを使うようにした。
- `src/presentation/components/moves/MoveMetaChips.tsx`
- `src/presentation/components/moves/MoveSlots.tsx`
  - 技欄のタイプバッジと威力チップが、天候変更に応じて更新されるようにした。
  - `ウェザーボール` は天候なしで `ノーマル / 威力50`、晴れで `ほのお / 威力100`、雨で `みず / 威力100`、砂で `いわ / 威力100`、雪で `こおり / 威力100` と表示される。
- `src/presentation/components/results/DamageResultRow.tsx`
  - 結果行のタイプバッジを天候込みのタイプ表示に変更。
  - `ウェザーボール` には結果行にも `威力50/100` の表示を追加。
- `src/data/json/abilities.json`
  - `メガソーラー` を追加。
  - 既存の英語表示 `Electric Surge` を `エレキメイカー` に変更。
  - メガ個体で参照されていた `おやこあい` / `デルタストリーム` / `ドラゴンスキン` も追加。
- `src/data/json/pokemon.json`
  - バチンウニの特性 `Electric Surge` を `エレキメイカー` に変更。
- `tests/domain/DamageCalculator.test.ts`
  - `メガソーラー` 下の `ウェザーボール` が、通常の `はれ` と同じダメージになることを固定テスト化。
  - 防御側が `メガソーラー` の場合も同様に晴れ扱いになることを固定テスト化。
  - 表示用 helper で、天候ごとの `ウェザーボール` タイプ/威力が正しく解決されることを固定テスト化。
- `tests/data/data-integrity.test.ts`
  - メガポケモンの特性も `abilities.json` に存在することを検証するテストを追加。
  - `メガソーラー` の特性データを固定テスト化。

### 検証

- `npm run typecheck`
- `npm run lint`
- `npm run test -- --run tests/domain/DamageCalculator.test.ts tests/data/data-integrity.test.ts`
  - sandbox 内では設定ファイル探索時に `Access is denied` が出たため、通常権限で再実行。
  - 82 tests passed。
- `npm run build`
  - production build passed。

### 判断メモ

- `メガソーラー` は天候系特性として、明示天候ではなく実効天候の解決層で扱う。
- 今回は `ウェザーボール` と既存天候参照の整合を優先し、追加の「水技不発」など別仕様は未実装。

## 2026-06-30: じだんだの威力2倍選択対応

### 発覚内容

- `じだんだ` は前のターンに技が失敗していた場合、威力75から威力150になる。
- 現状データでは `power: 75` の固定扱いで、UIから2倍威力を選択できなかった。

### 実施した修正

- `src/data/json/moves.json`
  - `じだんだ` に `powerOptions: [75, 150]` を追加。
  - 既存の `しっぺがえし` / `ダメおし` と同じ手動選択方式で、通常威力と条件達成時威力を切り替え可能にした。
- `tests/data/data-integrity.test.ts`
  - `じだんだ` の基本威力75と `powerOptions: [75, 150]` を固定テスト化。

### 検証

- `npm run typecheck`
- `npm run lint`
- `npm run test -- --run tests/data/data-integrity.test.ts`
  - sandbox 内では設定ファイル探索時に `Access is denied` が出たため、通常権限で再実行。
  - 37 tests passed。
- `npm run build`
  - sandbox 内では設定ファイル探索時に `Access is denied` が出たため、通常権限で再実行。
  - production build passed。

### 判断メモ

- 条件「前のターンに技が失敗」はバトル履歴依存のため、既存の可変威力技と同じく自動判定ではなく手動選択方式にする。

## 2026-07-03: V3.15.0 マルチエージェント総点検で発見したバグ群

### 進め方

- Fable 5 が司令塔となり、調査を Opus 4.8（ドメイン層）/ Sonnet 5（プレゼンテーション層・リファクタ分析）に並列委任、修正を Opus 4.8 / Sonnet 5 / Haiku 4.5 に振り分けた。
- 並列エージェント間のファイル競合は担当ファイルの禁止リストで防止した。

### 発見・修正したバグ

1. **きしかいせい/じたばた のオフバイワン**（`SpecialMoveCalc.ts`）
   - `p = floor(48 × HP/maxHP)` の威力100帯が `p < 9` になっており、p=9（例: HP38/192 = 18.75%）が誤って威力80になっていた。canonical は p∈[5,9]→100。`p < 10` に修正。
2. **急所時の攻撃側負ランク無視が未実装**（`CalculateDamageUseCase.ts`）
   - V3.14.1 で防御側の正ランク無視は実装済みだったが、Gen 9 では攻撃側の A/C 下降ランクも急所時に無視される。`effectiveCritical` 時に `atk/spa` を `Math.max(0, rank)` でクランプ（てんねん処理の後段、防御側と対称のパターン）。
3. **`hex` 分岐の恒真条件**（`SpecialMoveCalc.ts`）
   - `if (attackerStatus != null || ctx.defenderStats)` の後者は常に truthy で常時2倍。`special: "hex"` は moves.json から撤去済み（powerOptions 方式に移行済み）のためデッドコードとして分岐と `'hex'` タグを削除。
4. **反動技の両者同時瀕死が「攻撃側生存」扱い**（`BattleSequenceCalc.ts`）
   - `attack` イベントで `nd0 <= 0`（防御側撃破）を反動死判定より先に吸収しており、「相手を倒しつつ反動で自分も倒れる」ロールが攻撃側生存に計上されていた。第3吸収バケット `bothFaint` を追加し、表示値は 撃破率 = `ko + bothFaint`、攻撃側瀕死率 = `faint + bothFaint`、不変条件 `ko + faint + bothFaint + bothAlive = 1`。`incoming` の対称ケース（被ダメ側の反動）も同時修正。
5. **おやこあい急所込みパスできのみターン境界が2倍進行**（`useAccumulatedDamage.ts` / `BattleSequenceCalc.ts`）
   - 急所込みパスは親・子を2つの `attack` イベントに分割するため、はんすう/しゅうかくのターン境界処理が1ターンで2回走っていた。`attack` イベントに `noTurnBoundary?: true` を追加し、親ヒットではターン終了処理を抑止。
6. **アクティブタブの複製で編集が巻き戻る**（`sessionStore.ts`）
   - `duplicateTab` が保存前の `tabs` 配列からスナップショットを取っていたため、アクティブタブ複製時に「最後のタブ切替時点」の状態が複製され、`restoreState` でライブUIも巻き戻った。アクティブタブ複製時は `snapshotLiveState()` を複製元とするよう修正。
7. **リロードで直近編集が消える**（`sessionStore.ts` / `Calculator.tsx`）
   - タブは localStorage 永続化されるのにスナップショット保存はタブ操作時のみだった。`saveActiveTabSnapshot()` を追加し `beforeunload` / `pagehide` で自動保存（多重登録ガード付き）。

### 健全性確認（問題なしと判定した項目）

- スナップショット/攻守交代 `pick` のフィールド網羅性: pokemonStore 28・progressionStore 10・fieldStore 7 フィールドを全数突合し欠落ゼロ。
- KO確率DP・きのみ状態機械（berryUnit パッキング）・丸め順序（フィールド補正→乱数→急所→STAB→相性→やけど）・16段階乱数はすべて正確。確率保存も検証済み。
- `any` 0件、テストの `.only`/`.skip` 0件、V3.8.0 ストア統合の残骸なし。

### 判断メモ

- 累積ビュー（`useAccumulatedDamage`）が `incoming` の drain/recoil による防御側HP変化を無視する件は、「累積=防御側のみ追跡」という設計上の割り切りとして今回は据え置き（シーケンス出力側は正確）。
- `useAccumulatedDamage` / `useBattleSequence` の attack 展開ロジック共通化は、V3.8.1 の痛み分けバグ再発リスクがあるため見送り（将来はモードを引数で明示する設計で実施すること）。
- `calcCombinedKoProbability` はプロダクションから未参照だが、2Dエンジンとの整合性検証オラクルとしてテストが使用しているため削除しない。

## 2026-07-04: やまあらし追加

### 発覚内容

- 技 `やまあらし` / `Storm Throw` が公開用 `moves.json` に未収録だった。
- raw データ側には存在しており、仕様は `かくとう` / `物理` / 威力60 / 命中100 / 確定急所。

### 実施した修正

- `src/data/json/moves.json`
  - `やまあらし` を追加。
  - `alwaysCrit: true` を設定し、既存の確定急所処理に乗せた。
  - PP は既存の Champions 向け技データで raw PP10 相当の物理技が `12` で入っていることに合わせ、`pp: 12` とした。
- `tests/data/data-integrity.test.ts`
  - `やまあらし` のタイプ・分類・威力・命中・PP・確定急所を固定テスト化。

### 検証

- `npm run typecheck`
- `npm run lint`
- `npm run test -- --run tests/data/data-integrity.test.ts`
  - sandbox 内では設定ファイル探索時に `Access is denied` が出たため、通常権限で再実行。
  - 38 tests passed。
- `npm run build`
  - sandbox 内では設定ファイル探索時に `Access is denied` が出たため、通常権限で再実行。
  - production build passed。

### 判断メモ

- 確定急所の計算経路は `トリックフラワー` などで既に実装済みのため、今回は技データ追加で対応する。

## 2026-07-04: すなのちから表記修正

### 発覚内容

- 特性 `すなのちから` が一部データで `サンドフォース` と表記されていた。
- `abilities.json` には `すなのちから` と `サンドフォース` の重複エントリがあり、通常ポケモン側にも `サンドフォース` 参照が残っていた。
- 計算ロジックは `すなのちから` を参照しているため、`サンドフォース` 表記の個体では砂嵐時の威力補正が漏れる可能性があった。

### 実施した修正

- `src/data/json/abilities.json`
  - 重複していた `サンドフォース` エントリを削除し、`Sand Force` の日本語名を `すなのちから` に統一。
- `src/data/json/pokemon.json`
  - 通常ポケモン側の `サンドフォース` 参照を `すなのちから` に統一。
  - 既に `すなのちから` と `サンドフォース` が併記されていた個体は重複を削除。
- `src/data/i18n/ja.json`
  - `sand force` の和訳を `すなのちから` に変更。
- `tests/data/data-integrity.test.ts`
  - `Sand Force` の表示名が `すなのちから` であること、ポケモン側と特性側に `サンドフォース` が残らないことを固定テスト化。

### 検証

- `npm run typecheck`
- `npm run lint`
- `npm run test -- --run tests/data/data-integrity.test.ts`
  - sandbox 内では設定ファイル探索時に `Access is denied` が出たため、通常権限で再実行。
  - 39 tests passed。
- `npm run build`
  - sandbox 内では設定ファイル探索時に `Access is denied` が出たため、通常権限で再実行。
  - production build passed。

### 判断メモ

- raw データは外部由来の英語データとして保持し、公開用 JSON と i18n のみ修正対象にした。
