# Pokemon Champions Damage Calc — Compressed Context Memory

## Meta
repo=`advancehacker9361/pokemon-champions-damage-calc` | branch=`claude/debug-pokemon-damage-calc-Rd6jZ` | ver=3.12.3 | lang=React18+TS+Vite6+Zustand5+TailwindCSS | PWA=vite-plugin-pwa | test=vitest(171pass) | deploy=GH-Pages(Actions) | url=`https://advancehacker9361.github.io/pokemon-champions-damage-calc/`

## Arch: Clean 5層 w/ path aliases @/{domain,application,data,presentation,infrastructure}
```
src/domain/       # 計算,モデル,定数 (DamageCalculator,BattleSequenceCalc,KoProbabilityCalc,StatCalculator,SpecialMoveCalc,CritRank)
src/application/  # UC (CalculateDamageUseCase,CalculateMoveResultsUseCase) ※FindOptimalSp/AccumDurability=v3.12で削除
src/data/         # JSON+Repo (pokemon/mega/moves/abilities/items/natures/type-chart) ※外部API無
src/presentation/ # React(components/store/hooks/pages)
src/infrastructure/ # version.ts(__APP_VERSION__ via Vite define)
```

## Zustand Stores

### pokemonStore (attacker/defender 同構造, 2インスタンス)
fields: pokemonId,pokemonName,baseStats:{hp,atk,def,spa,spd,spe},types:[TypeName],sp:{hp,atk,def,spa,spd,spe}(0-32,合計≤66),statNatures:{atk,def,spa,spd,spe}(0.9/1.0/1.1),abilityName,effectiveAbility,itemName,isMega,canMega,**availableMegas:MegaPokemonRecord[]**,**megaKey:string|null**,isBlade(ギルガルド),isMighty(イルカマン),ranks:{atk..spe}(±6),status:'none'|'やけど'|'まひ',abilityActivated:bool,proteanType,proteanStab,moves:[4],movePowers:[4],supremeOverlordBoost:number,focusEnergyActive:bool,chargeActive:bool,**metronomeMultiplier:number(1-2)**,weight,grounded:bool
actions: setPokemon,setMega,setMegaForm(key),setBlade,setMighty,setSp,setRank,setItem,setMove,setMovePower,setAbilityActivated,setFocusEnergyActive,setChargeActive,**setMetronomeMultiplier**,**clearPokemonSelection**(技/持物保持),reset,initDefaults

### fieldStore
fields: weather:'none'|'はれ'|'あめ'|'すなあらし'|'ゆき', terrain:'none'|'エレキ'|'グラス'|'サイコ'|'ミスト', isReflect,isLightScreen,isAuroraVeil,isTrickRoom,isGravity :bool

### progressionStore (v3.8.0統合: 旧accumStore+battleSequenceStore)
```ts
ProgressionEvent = discriminated union:
  | {kind:'attack', id, ...AttackPayload, usages:1-9}
  | {kind:'painSplit', id, attackerHp:number}
  | {kind:'incoming', id, moveName:string|null, crit:bool}
  | {kind:'setupTurn', id, side:'attacker'|'defender', label?}     // v3.12+
  | {kind:'megaEvolve', id, side:'attacker'|'defender', megaKey}   // v3.12+
  | {kind:'defenderConst'|'attackerConst'|'defenderRecover'|'attackerRecover', id, amount, label?, source?:'manual'|'background'}
  | {kind:'rearmBerry', id}
  | {kind:'leechSeed', id, direction:'fromAttacker'|'fromDefender'}
```
背景効果fields: constDmg,constRec(たべのこし/ポイヒ per-turn),constRecBerry(オボン/混乱実 1回限),constRecBerryThresholdPct(50=オボン,25=混乱実),berryCudChew:bool(はんすう),berryHarvestChance:0|0.5|1(しゅうかく),poisonTurns:0-10,attackerStartHp:number|null,defenderStartHp:number|null
actions: addAttack,setAttackUsages,removeEvent,moveEvent(±1),addEventAfter(targetId|null),updateEvent(id,patch),set各背景,clear
helper: `hasSequenceImpact(s)→bool` = attackerStartHp≠null ∨ events∃{incoming,attackerConst,attackerRecover,defenderConst,defenderRecover,painSplit,setupTurn,megaEvolve}

### AttackPayload (attack event内)
rolls[16],rawRolls[16],usages,minDmg,maxDmg,rawMin,rawMax,defenderMaxHp,hadMultiscale:bool,critRolls,rawCritRolls,critMin,critMax,rawCritMin,rawCritMax,critChance(0=1/24,1/8=高急所,1=確定),isForcedCrit,moveName?(吸収率参照用),pbParent{Rolls,CritRolls,RawRolls,RawCritRolls}?,pbChild{Rolls,CritRolls}?,variableHitDist?:{hits,prob}[]

### resultStore
MoveResult: {moveName,moveSlotIndex,result:DamageResult,critResult:DamageResult,rawResult?,rawCritResult?,perHitResults?,critPerHitResults?,weakArmor系...}

### sessionStore (v3.3.0タブ管理)
Tab{id,name,snapshot:SessionSnapshot} | activeTabId | actions: initFirstTab,createTab,duplicateTab,switchTab,renameTab,closeTab
snapshot方式: 切替時にlive→snapshot保存→対象tab復元 (sessionSnapshot.ts: snapshotLiveState/restoreState/cloneSnapshot)

### sessionSnapshot.ts
PokemonSnapshot = Pick<PokemonStore, data fields> (含む availableMegas,megaKey,metronomeMultiplier)
ProgressionSnapshot = {events,constDmg,constRec,constRecBerry,constRecBerryThresholdPct,berryCudChew,berryHarvestChance,poisonTurns,attackerStartHp,defenderStartHp}
cloneProgressionEvent: attack→全配列spread,他→{...ev}

## Domain Calculators

### BattleSequenceCalc.ts — 2D同時分布DP (攻HP×防HP×きのみ状態)
```
SeqEvent = attack(dmg,drain?,recoil?) | incoming(dmg,drain?,recoil?) | setupTurn(side) | megaEvolve(side) | painSplit(attackerHp?) | defenderConst(amount) | attackerConst(amount) | defenderRecover(amount) | attackerRecover(amount) | rearmBerry | leechSeed(direction,amount)
DmgDist = number[] | Map<number,number>
state key = (aHP * stride + dHP) * berryUnit + bstate
berryUnit = なし:1 / はんすうなし:2 / はんすうあり:6
```
runBattleSequence(events,atkMaxHp,defMaxHp,opts?)→BattleSequenceResult{steps[],defenderKoProb,**attackerFaintProb**,attackerSurviveProb,bothAliveProb}
extractDefenderDamageDistribution(result,defMaxHp)→Map<dmg,prob> (overkill→maxHPに集約)
drain: actual=min(roll,残HP)→攻回復floor(actual×drain)min1,maxHPクランプ
**recoil**: actual×recoil→攻自傷(いしあたま/マジックガード免除)
setupTurn/megaEvolve: HP不変,ステップ記録のみ.setupTurnはターン境界(はんすうcountdown)
きのみ: threshold以下→amount回復→consumed. cudChew=発動後cud=2→次ターン再回復. harvestChance=確率再装填

### KoProbabilityCalc.ts
calcCombinedDamageDistribution(rollSets:Array<number[]|Map>,init:number|Map)→Map<dmg,prob>
calcCombinedKoProbability / WithCrit
applyPainSplitToDmgDist(dmgDist,defMaxHp,attackerHp)
calcVariableHitsSingleUsageDist(rolls,dist,rawRolls?) / WithCrit
AttackSlot = AttackRollsWithCrit | {precomputed:Map}
VARIABLE_MULTI_HIT_DIST: normal(2-5), SKILL_LINK(5固定), LOADED_DICE(4-5)

### DamageCalculator.ts
calculateDamage(input)→DamageResult{rolls[16],min,max,percentMin,percentMax,koResult}
16段ロール(85-100%), 補正順: Weather→Crit→Random→STAB→Type→Burn→Other
skipHalfBerry:bool(連続技2発目以降), wouldHalfBerryActivate(item,moveType,typeEff)
**新規持ち物補正**(v3.12): ちからのハチマキ(物理×1.1),ものしりメガネ(特殊×1.1),パンチグローブ(パンチ×1.1),プレート17種(×1.2),おこう5種(×1.2),ジュエル18種(×1.3),しんかのきせき(防御側def/spd×1.5),ふうせん(じめん無効)
**新規特性補正**: ほのおのたてがみ(ほのお×1.5),すてみ(反動技×1.2),てつのこぶし(パンチ×1.2),すなのちから(砂嵐時いわ/はがね/じめん×1.3)
既存特性: きれあじ(切る×1.5),メガランチャー(はどう×1.5),すいほう(攻みず×2/防ほのお×0.5),あついしぼう(防ほのお/こおり×0.5),もふもふ,いろめがね,きもったま,フェアリー/スカイ/エレキ/フリーズスキン(ノーマル変換+×1.2),かたいツメ(接触×1.3)

### CritRank.ts
CRIT_RANK_TABLE: 0→1/24, 1→1/8, 2→1/2, ≥3→確定(Gen7+仕様)
calcCritChance({moveCritBonus,attackerAbility,attackerItem,focusEnergyActive})

### MoveRecord (schemas/types.ts)
name,nameEn,type,category('物理'|'特殊'|'変化'),power,accuracy,pp,priority,flags:{contact,sound,bullet,pulse,punch,bite,slice,**recoil?**},special:SpecialMoveTag|null,multiHit?,powerOptions?,selfStatDrop?,selfStatDrops?,alwaysCrit?,critChance?,drain?,**recoil?:number**

## Hooks

### useBattleSequence()→BattleSequenceComputed{showSequence,attackerMaxHp,defenderMaxHp,resolved:ResolvedEvent[],result:BattleSequenceResult|null}
- megaEvolve対応: toBaseBattleState(初期)→toMegaBattleState(mega後)で被ダメ計算切替
- recoil対応: recoilRateForMove(move,ability)→SeqEvent.recoil
- drain: ev.moveName→MoveRepository.findByName→move.drain
- incoming: 攻守入替executeDamageCalculation (seqDefender→seqAttacker)
- setupTurn: そのままpushSeq
- painSplit: attackerHp渡さない(2D追跡)
- constDmg/constRec/poisonTurns→背景プリセットからイベントへの自動変換は**削除**(v3.12でPanel側責務に)
- deps: [events,constRecBerry,berryThresholdPct,berryCudChew,berryHarvestChance,attackerStartHp,defenderStartHp,attacker,defender,field]

### useAccumulatedDamage(defenderMaxHp)→AccumulatedDamage
- 累積モード=防御側のみ追跡, ATT_DUMMY=1
- expandAttack: usages展開,マルチスケイル(1発目のみrolls/以降rawRolls),variableHitDist,おやこあい(pb分割),急所混合(mixToMap)
- painSplit→{attackerHp:ev.attackerHp}(累積=攻撃側HP固定)
- leechSeed: fromAttacker→defenderConst(defMaxHp/8), fromDefender→defenderRecover(atkMaxHp/8)
- setupTurn→pushBoth, megaEvolve→break(累積では無視)
- incoming/attackerConst/attackerRecover→break(防御側のみ)
- totalConst=0固定(背景は手動イベント化)
- runBattleSequence×2(normal,crit)→extractDefenderDamageDistribution

## UI Components (主要)

### DamageProgressionPanel.tsx (v3.12大改修,最大ファイル)
イベント時系列UI + 背景効果(定数ダメ/回復/きのみ/もうどく) + シーケンス出力(生存率/HP分布テーブル)
EventRow: attack(×N/+痛み分け),painSplit,incoming(技選択+crit),setupTurn,megaEvolve,const/recover(1/3·1/2·2/3プリセット),rearmBerry,leechSeed
追加ボタン: 攻撃側被ダメ,痛み分け,防御側ダメ/回復,攻撃側ダメ/回復,リサイクル,宿り木(攻→防/防→攻),補助技(攻/防),メガシンカ

### DamageResultRow.tsx
技結果行: HPバー,残HP,KOラベル,期待ダメ,乱数展開,急所トグル(alwaysCrit→固定表示),+加算,自己デバフ/バフボタン,MoveMetaChips
「主操作」セクションにグループ化(v3.12)

### DamageSummaryHeader.tsx
最上部: 累積HPバー+AccumHistogram | 最大ダメ技サマリー

### SessionTabsBar.tsx (v3.12強化)
タブバー: click切替,dblclick rename,×close,＋new | keyboard(Arrow/Home/End/F2/Del/ContextMenu) | touch向け...メニュー(rename/duplicate/moveL/moveR/close)

### MoveMetaChips.tsx (v3.12新規)
技メタ表示: TypeBadge + 分類 + 威力(可変/escalating対応) + 連続回数

### PokemonSearch.tsx (v3.12改善)
loading/no-results表示,IME安全Enter,クエリクリア,clearPokemonSelection(非破壊)

### ItemSelect.tsx (v3.12改修)
候補20件,英語名削除,131items対応

## Data
- pokemon.json: 210体(Champions内定) + ヒスイフォルム等
- pokemon-mega.json: 74件(weight含む)
- moves.json: 562技(drain/recoil/critChance/alwaysCrit/powerOptions/selfStatDrop(s)/multiHit/special)
- abilities.json: 189特性(日本語名)
- items.json: **131件**(v3.12拡充: +プレート17+ジュエル18+おこう5+ちからのハチマキ+ものしりメガネ+パンチグローブ+しんかのきせき+ふうせん+メトロノーム等)
- type-chart.json: 18×18
- natures.json: 性格補正

## PokemonRepository
findById,search(query,limit),**getMegaByKey(key)**,getMegaByBaseId(id),**getMegasByBaseId(id)→MegaPokemonRecord[]**,getAllMega

## Version History (主要マイルストーン)
- v1.0: 基本計算機+PWA+CI/CD
- v2.0: データ完全性(562技/189特性)+15段乱数(86-100)
- v2.1: 急所トグル+加算統合+自己デバフ+体重技修正
- v2.2-2.5: HPバー+サマリー+ヒストグラム+耐久調整+期待ダメ+critChance
- v2.6-2.7: 累積ヒストグラム+サマリー統合
- v3.0: 累積耐久調整+マルチスケイル自動ON+累積マルチスケイル正確化+多段技マルチスケイル
- v3.1: 急所込みKO確率+おやこあい親子独立+スキルリンク/いかさまダイス
- v3.1.5: pkdxクロスチェック+フィールド補正順修正+半減実18種修正+タイプ強化修正
- v3.2: 急所率1/24(Gen7+)+KoProbCalc拡張(Map入力)+変動連続技分布
- v3.3: タブバー(セッション管理)+データ追加(ダメおし/ナイトバースト/すいほう/ヒスイゾロアーク等)
- v3.5: 痛み分け(2セグメント分割DP)
- v3.6: バトルシーケンス2D同時分布DP+吸収技対応
- v3.7: エンジン統合(累積=2Dの特殊ケース)+UI単一パネル
- v3.8.0: データモデル統合(progressionStore)→v3.8.1-6: 痛み分け/定数/オボン修正の反復
- v3.9: オボン/混乱実(しきい値可変)
- v3.10: きのみ例外(くいしんぼう/はんすう/しゅうかく/リサイクル/ほおぶくろ)
- v3.11.0-7: 宿り木+再生回復プリセット+食べ残し/ポイヒ明確化+ドレイン配線修正+むねんのつるぎdrain
- **v3.12.0**: UI/UX大整理, 耐久調整パネル**完全削除**, 技選択履歴, フィールド条件パネル移動, アクセシビリティ
- **v3.12.1**: HP直接補正→背景効果内移動, 攻/防別ダメ/回復/再生プリセット, 被ダメ→攻撃側被ダメ改称
- **v3.12.2**: attackerFaintProb追加, 攻撃側瀕死表示
- **v3.12.3**: タブkeyboard, 検索改善, SP上限警告, MoveMetaChips
- **PR#64**: items.json 49→131, DamageCalc+テスト拡充(ちからのハチマキ/ものしりメガネ/パンチグローブ/しんかのきせき/ふうせん/プレート/ジュエル/メトロノーム/ほのおのたてがみ/シェルアーマー)
- **PR#65**: SP警告リバート+debug.md

## 削除済ファイル (v3.12)
- src/application/usecases/FindOptimalSpUseCase.ts
- src/application/usecases/FindOptimalAccumDurability.ts
- src/domain/calculators/DurabilityCalc.ts
- src/presentation/components/results/DurabilityPanel.tsx
- src/presentation/components/results/AccumDurabilityPanel.tsx

## 既知パターン/制約
- 持ち物効果=日本語名文字列判定(calcTag未使用)→名称ゆれ=バグリスク
- 累積で「2番目以降エントリで初半減実発動」未対応(マルチスケイル既存制限と同様)
- 16段乱数(85-100%)=Pokemon Champions固有(v2.0で15段→v3.1.5で16段に修正)
- GH Actions Node.js20 deprecation warning有

## Tests: 171 pass (11 files)
BattleSequenceCalc(33), pkdxCrossCheck(10), DamageCalculator(36), KoProbabilityCalc(18), CalculateDamageUseCase(5), data-integrity(26), StatPoints(19), StatCalculator(18), CalculateMoveResultsUseCase(2), progressionStore(3→実際6assertions), FoulPlay(1)

## Git状態
branch `claude/debug-pokemon-damage-calc-Rd6jZ` = mainと同期済(c6b325f merge) | typecheck✓ | 171tests✓ | lint未確認
plan.md, debug.md = Codex作成,main上に存在(作業記録用)
