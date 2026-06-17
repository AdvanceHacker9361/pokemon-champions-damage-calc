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
