import type { ComputedStats, TypeName, Weather, StatusCondition } from '@/domain/models/Pokemon'
import type { MoveData } from '@/domain/models/Move'
import type { BattleField } from '@/domain/models/BattleField'
import type { DamageResult } from '@/domain/models/DamageResult'
import { getTypeEffectiveness } from '@/domain/constants/typeChart'
import { calcKoProbability } from '@/domain/calculators/KoProbabilityCalc'
import { resolveSpecialMove } from '@/domain/calculators/SpecialMoveCalc'
import { calcRollPercent } from '@/domain/models/DamageResult'

export interface DamageCalcInput {
  attackerStats: ComputedStats
  attackerTypes: TypeName[]
  attackerAbility: string
  attackerItem: string | null
  attackerStatus: StatusCondition
  attackerAbilityActivated?: boolean
  attackerSupremeOverlordBoost?: number  // 0=なし, 1=×1.1, 2=×1.2
  /** へんげんじざい発動中のタイプ一致補正（true=1.5倍, false=なし）。省略時は true */
  attackerProteanStab?: boolean
  attackerRankModifiers: Record<string, number>
  attackerWeight?: number
  /** じゅうでん状態: 次の電気技の威力2倍 */
  attackerChargeActive?: boolean
  defenderStats: ComputedStats
  defenderTypes: TypeName[]
  defenderAbility: string
  defenderItem: string | null
  defenderStatus: StatusCondition
  defenderAbilityActivated?: boolean
  defenderProteanType?: TypeName | null
  defenderWeight?: number
  move: MoveData
  field: BattleField
  isCritical?: boolean
  /**
   * 連続技・おやこあいの2発目以降では半減実が消費済みとなり発動しないため、
   * 2発目以降の計算にこのフラグを true で渡す。
   */
  skipHalfBerry?: boolean
}

/**
 * 防御側の所持アイテムが現在の技に対して半減実として発動するかを判定する
 * （2発目以降の計算が必要かを useDamageCalc 側で判別する用途）
 */
export function wouldHalfBerryActivate(
  defenderItem: string | null,
  moveType: TypeName,
  typeEff: number,
): boolean {
  if (!defenderItem) return false
  const map = HALF_BERRIES
  if (map[defenderItem] !== moveType) return false
  return defenderItem === 'ホズのみ' || typeEff > 1
}

/** 半減実→対応タイプ */
const HALF_BERRIES: Record<string, TypeName> = {
  'オッカのみ': 'ほのお', 'イトケのみ': 'みず', 'ソクノのみ': 'でんき',
  'リンドのみ': 'くさ', 'ヤチェのみ': 'こおり', 'ヨプのみ': 'かくとう',
  'ビアーのみ': 'どく', 'シュカのみ': 'じめん', 'バコウのみ': 'ひこう',
  'ウタンのみ': 'エスパー', 'タンガのみ': 'むし', 'ヨロギのみ': 'いわ',
  'カシブのみ': 'ゴースト', 'ハバンのみ': 'ドラゴン', 'ナモのみ': 'あく',
  'リリバのみ': 'はがね', 'ロゼルのみ': 'フェアリー',
  'ホズのみ': 'ノーマル',
}

/** 五捨五超入（pokeRound）: 0.5を切り上げる四捨五入 */
function pokeRound(n: number): number {
  return Math.floor(n) + (n - Math.floor(n) > 0.5 ? 1 : 0)
}

/** 技の基本威力を解決（特殊技を含む） */
function resolvePower(input: DamageCalcInput): number {
  const power = resolveBasePower(input)

  // じゅうでん: 次の電気技の威力2倍（エレキスキン変換後の判定も含む）
  if (input.attackerChargeActive && resolveMoveType(input) === 'でんき') {
    return power * 2
  }

  return power
}

function resolveBasePower(input: DamageCalcInput): number {
  const { move, attackerStats, defenderStats, defenderWeight, attackerWeight, attackerStatus } = input

  if (move.special) {
    const result = resolveSpecialMove({
      tag: move.special,
      attackerStats,
      defenderStats,
      attackerWeight,
      defenderWeight,
      attackerStatus,
      originalPower: move.power ?? 0,
      attackerRankModifiers: input.attackerRankModifiers,
    })
    if (result.effectivePower !== undefined) return result.effectivePower
  }

  // ウェザーボール: 天候時に威力2倍
  if (move.special === 'weather-ball' && input.field.weather !== null) {
    return 100
  }

  return move.power ?? 0
}

/** 攻撃実数値を解決 */
function resolveAtk(input: DamageCalcInput): number {
  const { move, attackerStats, defenderStats, attackerAbility, attackerItem } = input

  let atk: number

  // 特殊技による攻撃ステータス変更
  if (move.special) {
    const result = resolveSpecialMove({
      tag: move.special,
      attackerStats,
      defenderStats,
      defenderWeight: input.defenderWeight,
      attackerStatus: input.attackerStatus,
      originalPower: move.power ?? 0,
    })
    if (result.effectiveAtk !== undefined) {
      atk = result.effectiveAtk
    } else {
      atk = move.category === '物理' ? attackerStats.atk : attackerStats.spa
    }
  } else {
    atk = move.category === '物理' ? attackerStats.atk : attackerStats.spa
  }

  // 特性補正（攻撃側）
  let atkMod = 1.0
  if (attackerAbility === 'ちからもち' || attackerAbility === 'ヨガパワー') {
    if (move.category === '物理') atkMod *= 2
  }
  if (attackerAbility === 'サンパワー' && input.field.weather === 'はれ') {
    if (move.category === '特殊') atkMod *= 1.5
  }
  // こんじょう: 状態異常時に物理攻撃1.5倍
  if (attackerAbility === 'こんじょう' && input.attackerStatus !== null) {
    if (move.category === '物理') atkMod *= 1.5
  }
  // はりきり: 物理攻撃1.5倍
  if (attackerAbility === 'はりきり') {
    if (move.category === '物理') atkMod *= 1.5
  }
  // HP1/3以下で発動するピンチ特性（手動トグル）
  if (input.attackerAbilityActivated) {
    if (attackerAbility === 'げきりゅう' && move.type === 'みず') atkMod *= 1.5
    if (attackerAbility === 'もうか'     && move.type === 'ほのお') atkMod *= 1.5
    if (attackerAbility === 'しんりょく' && move.type === 'くさ') atkMod *= 1.5
    if (attackerAbility === 'むしのしらせ' && move.type === 'むし') atkMod *= 1.5
  }

  // そうだいしょう: 味方の倒れた数に応じて攻撃・特攻を強化（手動入力）
  if (attackerAbility === 'そうだいしょう' && input.attackerSupremeOverlordBoost) {
    atkMod *= 1 + input.attackerSupremeOverlordBoost * 0.1
  }

  // 持ち物補正（攻撃側）
  if (attackerItem === 'こだわりハチマキ' && move.category === '物理') atkMod *= 1.5
  if (attackerItem === 'こだわりメガネ' && move.category === '特殊') atkMod *= 1.5

  return Math.floor(atk * atkMod)
}

/** 防御実数値を解決 */
function resolveDef(input: DamageCalcInput): number {
  const { move, attackerStats, defenderStats, defenderAbility, defenderItem } = input

  let def: number

  if (move.special) {
    const result = resolveSpecialMove({
      tag: move.special,
      attackerStats,
      defenderStats,
      defenderWeight: input.defenderWeight,
      attackerStatus: input.attackerStatus,
      originalPower: move.power ?? 0,
    })
    if (result.effectiveDef !== undefined) {
      def = result.effectiveDef
    } else {
      def = move.category === '物理' ? defenderStats.def : defenderStats.spd
    }
  } else {
    def = move.category === '物理' ? defenderStats.def : defenderStats.spd
  }

  // 特性補正（防御側）
  let defMod = 1.0
  if (defenderAbility === 'ふわふわもうふ' || defenderAbility === 'もふもふ') {
    if (move.flags.contact) defMod *= 0.5
  }
  // ふしぎなうろこ: 状態異常時に特防1.5倍（statusフィールドから自動判定）
  if (defenderAbility === 'ふしぎなうろこ' && input.defenderStatus !== null) {
    if (move.category === '特殊') defMod *= 1.5
  }

  // 砂嵐時の岩タイプ特防1.5倍
  if (input.field.weather === 'すなあらし') {
    if (move.category === '特殊') {
      if (input.defenderTypes?.includes('いわ')) defMod *= 1.5
    }
  }
  // 雪時の氷タイプ防御1.5倍
  if (input.field.weather === 'ゆき') {
    if (move.category === '物理') {
      if (input.defenderTypes?.includes('こおり')) defMod *= 1.5
    }
  }

  // 持ち物補正（防御側）
  if (defenderItem === 'とつげきチョッキ' && move.category === '特殊') defMod *= 1.5

  return Math.floor(def * defMod)
}

/** 技のタイプを解決（スキン特性によるタイプ変換を含む） */
function resolveMoveType(input: DamageCalcInput): TypeName {
  const { move, attackerAbility } = input
  // ウェザーボール: 天候によってタイプ変化
  if (move.special === 'weather-ball') {
    switch (input.field.weather) {
      case 'はれ': return 'ほのお'
      case 'あめ': return 'みず'
      case 'すなあらし': return 'いわ'
      case 'ゆき': return 'こおり'
      default: return 'ノーマル'
    }
  }

  if (move.type === 'ノーマル') {
    if (attackerAbility === 'フェアリースキン') return 'フェアリー'
    if (attackerAbility === 'スカイスキン')    return 'ひこう'
    if (attackerAbility === 'エレキスキン')    return 'でんき'
    if (attackerAbility === 'フリーズスキン')  return 'こおり'
  }
  return move.type
}

/**
 * ダメージ計算メイン関数
 * Gen9 ダメージ計算式 + Champions フィールド補正
 * Champions仕様: 16段階乱数ロール（85〜100）すべてを返す
 */
export function calculateDamage(input: DamageCalcInput): DamageResult {
  const { move, attackerAbility, defenderAbility,
          attackerStatus, defenderStats, field, isCritical = false } = input

  const power = resolvePower(input)
  if (power === 0) {
    const zeroRolls = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0] as DamageResult['rolls']
    return {
      rolls: zeroRolls, min: 0, max: 0,
      defenderMaxHp: defenderStats.hp,
      percentMin: 0, percentMax: 0,
      koResult: { type: 'no-ko' },
    }
  }

  const atk = resolveAtk(input)
  const def = resolveDef(input)
  const moveType = resolveMoveType(input)

  // へんげんじざい: 防御側タイプを変換済みタイプで上書き
  const effectiveDefenderTypes: TypeName[] =
    (defenderAbility === 'へんげんじざい' &&
     input.defenderAbilityActivated &&
     input.defenderProteanType != null)
      ? [input.defenderProteanType]
      : input.defenderTypes

  // ===== 基本ダメージ =====
  // floor((レベル×2÷5+2)) = floor((50×2÷5+2)) = floor(22) = 22
  const levelCalc = Math.floor(50 * 2 / 5 + 2)  // = 22 (レベル50固定)
  const baseDamage = Math.floor(
    Math.floor(levelCalc * power * atk / def) / 50
  ) + 2

  // ===== 補正の逐次適用 =====
  let damage = baseDamage

  // 1. 天候補正
  damage = applyWeatherModifier(damage, moveType, field.weather, defenderAbility)

  // 2. フィールド補正（乱数より前に適用: Gen8+ / Showdown 準拠）
  damage = applyFieldModifier(damage, moveType, field.terrain, move.name)

  // 3. 急所補正（1.5倍）
  if (isCritical) {
    damage = pokeRound(damage * 1.5)
  }

  // 3. 乱数（Champions仕様: 16段階 85〜100を100で割った値）
  const rolls: number[] = []
  for (let r = 85; r <= 100; r++) {
    rolls.push(Math.floor(damage * r / 100))
  }

  // 4〜7 の補正はロールごとに適用
  const finalRolls = rolls.map(roll => {
    let d = roll

    // 4. タイプ一致補正 (STAB)
    // へんげんじざい: 技タイプ=自分のタイプになるため常にSTAB
    // ただし attackerProteanStab=false のときはSTABを乗せない（可変STAB）
    const proteanActive = attackerAbility === 'へんげんじざい' && input.attackerAbilityActivated
    const hasSTAB = proteanActive
      ? (input.attackerProteanStab ?? true)
      : input.attackerTypes.includes(moveType)
    if (hasSTAB) {
      if (attackerAbility === 'てきおうりょく') {
        d = pokeRound(d * 2.0)
      } else {
        d = pokeRound(d * 1.5)
      }
    }

    // 5. タイプ相性（へんげんじざい発動時は変換後タイプで判定）
    let typeEff: number = getTypeEffectiveness(moveType, effectiveDefenderTypes)
    // フリーズドライ: みず タイプに対して2倍有効（通常はこおり→みず 0.5倍）
    if (move.special === 'freeze-dry' && effectiveDefenderTypes.includes('みず')) {
      let eff = 1
      for (const defType of effectiveDefenderTypes) {
        if (defType === 'みず') {
          eff *= 2  // 常に2倍
        } else {
          eff *= getTypeEffectiveness('こおり', [defType])
        }
      }
      typeEff = eff
    }
    if (typeEff !== 1) {
      d = pokeRound(d * typeEff)
    }

    // 6. やけど補正（物理技0.5倍）
    // からげんきはやけどでも威力上昇（2倍）して減衰なし
    const isFacade = move.special === 'facade'
    if (attackerStatus === 'やけど' && move.category === '物理' && !isFacade) {
      d = pokeRound(d * 0.5)
    }

    // 7. その他補正
    d = applyOtherModifiers(d, input, moveType, typeEff)

    return Math.max(1, d)  // 最低1ダメージ（無効タイプは0）
  })

  // 無効タイプは0（へんげんじざい発動時は変換後タイプで判定）
  let typeEffCheck: number = getTypeEffectiveness(moveType, effectiveDefenderTypes)
  if (move.special === 'freeze-dry') {
    // みずタイプへの無効化はない（こおりに免疫なし）
    typeEffCheck = typeEffCheck === 0 ? 0 : 1  // 0以外はすべて有効
  }
  const effectiveRolls = typeEffCheck === 0
    ? ([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0] as DamageResult['rolls'])
    : (finalRolls as DamageResult['rolls'])

  const min = effectiveRolls[0]
  const max = effectiveRolls[15]
  const defHp = defenderStats.hp

  return {
    rolls: effectiveRolls,
    min,
    max,
    defenderMaxHp: defHp,
    percentMin: calcRollPercent(min, defHp),
    percentMax: calcRollPercent(max, defHp),
    koResult: calcKoProbability(Array.from(effectiveRolls), defHp),
  }
}

function applyWeatherModifier(
  damage: number,
  moveType: TypeName,
  weather: Weather,
  _defenderAbility: string,
): number {
  if (weather === 'はれ') {
    if (moveType === 'ほのお') return pokeRound(damage * 1.5)
    if (moveType === 'みず')   return pokeRound(damage * 0.5)
  }
  if (weather === 'あめ') {
    if (moveType === 'みず')   return pokeRound(damage * 1.5)
    if (moveType === 'ほのお') return pokeRound(damage * 0.5)
  }
  return damage
}

/** 5325/4096 (≒1.3002) による五捨五超入 — Gen8+ フィールド倍率のShowdown準拠値 */
function applyField13x(damage: number): number {
  return Math.floor((damage * 5325 + 2047) / 4096)
}

function applyFieldModifier(
  damage: number,
  moveType: TypeName,
  terrain: 'エレキ' | 'グラス' | 'サイコ' | 'ミスト' | null,
  moveName: string,
): number {
  if (terrain === 'エレキ' && moveType === 'でんき') return applyField13x(damage)
  if (terrain === 'グラス' && moveType === 'くさ')   return applyField13x(damage)
  if (terrain === 'グラス' &&
      (moveName === 'じしん' || moveName === 'じならし' || moveName === 'マグニチュード')) {
    return pokeRound(damage * 0.5)
  }
  if (terrain === 'サイコ' && moveType === 'エスパー') return applyField13x(damage)
  if (terrain === 'ミスト' && moveType === 'ドラゴン') return pokeRound(damage * 0.5)
  return damage
}

function applyOtherModifiers(
  damage: number,
  input: DamageCalcInput,
  moveType: TypeName,
  typeEff: number,
): number {
  let d = damage
  const { attackerAbility, attackerItem, defenderAbility, defenderItem,
          move, field, isCritical = false } = input

  // 壁補正（急所時は壁無効）
  if (!isCritical) {
    if (field.isAuroraVeil) {
      d = pokeRound(d * 0.5)
    } else if (field.isReflect && move.category === '物理') {
      d = pokeRound(d * 0.5)
    } else if (field.isLightScreen && move.category === '特殊') {
      d = pokeRound(d * 0.5)
    }
  }

  // 特性補正（防御側）
  // マルチスケイル/ファントムガード: HP満タン時ダメージ0.5倍（手動トグルで有効化）
  if ((defenderAbility === 'マルチスケイル' || defenderAbility === 'ファントムガード') &&
      input.defenderAbilityActivated) {
    d = pokeRound(d * 0.5)
  }
  if (defenderAbility === 'フィルター' || defenderAbility === 'ハードロック') {
    if (typeEff > 1) d = pokeRound(d * 0.75)
  }
  if (defenderAbility === 'もふもふ' && move.type === 'ほのお') {
    d = pokeRound(d * 2)
  }

  // フェアリーオーラ: 攻撃側・防御側どちらが持っていてもフェアリー技1.33倍
  if ((attackerAbility === 'フェアリーオーラ' || defenderAbility === 'フェアリーオーラ') &&
      moveType === 'フェアリー') {
    d = pokeRound(d * 4 / 3)
  }

  // 攻撃側特性
  if (attackerAbility === 'テクニシャン') {
    if ((move.power ?? 0) <= 60) d = pokeRound(d * 1.5)
  }
  if (attackerAbility === 'いろめがね') {
    if (typeEff < 1 && typeEff > 0) d = pokeRound(d * 2)
  }
  // かたいツメ: 接触技の威力1.3倍
  if (attackerAbility === 'かたいツメ' && move.flags.contact) {
    d = pokeRound(d * 1.3)
  }
  // すてみ: 反動技の威力1.2倍
  if (attackerAbility === 'すてみ' && move.flags.recoil) {
    d = pokeRound(d * 1.2)
  }
  // てつのこぶし: パンチ技の威力1.2倍
  if (attackerAbility === 'てつのこぶし' && move.flags.punch) {
    d = pokeRound(d * 1.2)
  }
  // すなのちから: すなあらし時にいわ/はがね/じめん技1.3倍
  if (attackerAbility === 'すなのちから' && input.field.weather === 'すなあらし') {
    if (moveType === 'いわ' || moveType === 'はがね' || moveType === 'じめん') {
      d = pokeRound(d * 1.3)
    }
  }
  // スキン特性: ノーマル→他タイプ変換 + 威力1.2倍
  if ((attackerAbility === 'フェアリースキン' || attackerAbility === 'スカイスキン' ||
       attackerAbility === 'エレキスキン' || attackerAbility === 'フリーズスキン') &&
      move.type === 'ノーマル') {
    d = pokeRound(d * 1.2)
  }

  // 持ち物補正（攻撃側）
  if (attackerItem === 'いのちのたま') {
    d = Math.floor(d * 1.3)
  }
  if (attackerItem === 'たつじんのおび' && typeEff > 1) {
    d = Math.floor(d * 1.2)
  }
  // タイプ強化アイテム（各種+1.2倍）
  const typeBoostItems: Record<string, TypeName> = {
    'もくたん': 'ほのお', 'しんかいのキバ': 'みず', 'じしゃく': 'でんき',
    'きせきのたね': 'くさ', 'とけないこおり': 'こおり', 'くろおび': 'かくとう',
    'どくバリ': 'どく', 'やわらかいすな': 'じめん', 'するどいくちばし': 'ひこう',
    'まがったスプーン': 'エスパー', 'ぎんのこな': 'むし', 'かたいいし': 'いわ',
    'のろいのおふだ': 'ゴースト', 'りゅうのキバ': 'ドラゴン', 'くろいめがね': 'あく',
    'メタルコート': 'はがね', 'ようせいのはね': 'フェアリー',
  }
  if (attackerItem && typeBoostItems[attackerItem] === moveType) {
    d = Math.floor(d * 1.2)
  }
  // 半減実
  // - 通常: 該当タイプ かつ 効果抜群（typeEff > 1）のとき 0.5 倍
  // - ホズのみ（ノーマル半減）のみ例外: 効果抜群でなくても発動
  // - skipHalfBerry: 連続技・おやこあいの2発目以降は消費済みのためスキップ
  if (!input.skipHalfBerry && wouldHalfBerryActivate(defenderItem, moveType, typeEff)) {
    d = pokeRound(d * 0.5)
  }

  return d
}

/**
 * ステルスロックのダメージ計算
 * 最大HP × タイプ相性倍率 × 1/8
 */
export function calcStealthRockDamage(
  defenderMaxHp: number,
  defenderTypes: TypeName[],
): number {
  const typeEff = getTypeEffectiveness('いわ', defenderTypes)
  return Math.floor(defenderMaxHp * typeEff / 8)
}
