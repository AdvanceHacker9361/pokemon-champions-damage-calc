import type { SpecialMoveTag } from '@/domain/models/Move'
import type { TerrainField, TypeName, Weather } from '@/domain/models/Pokemon'

interface MoveResolutionInput {
  moveType: TypeName
  moveSpecial?: SpecialMoveTag | null
  weather: Weather
  /** だいちのはどう等、フィールドでタイプが変わる技の判定に使う */
  terrain?: TerrainField
  /** 使用者が接地しているか（省略時は接地扱い） */
  attackerGrounded?: boolean
  attackerAbility?: string
  defenderAbility?: string
}

/** ふゆう系（じめん技を無効化する＝接地していない）特性 */
const LEVITATE_LIKE_ABILITIES = new Set(['ふゆう', 'うなぎのぼり'])

/**
 * ふゆう系（接地しない）特性かを判定する。
 * 防御側のじめん技無効化判定（DamageCalculator）と
 * 攻撃側の接地判定（だいちのはどう）で同じリストを共有する。
 */
export function isLevitateLikeAbility(ability: string | null | undefined): boolean {
  return ability != null && LEVITATE_LIKE_ABILITIES.has(ability)
}

/**
 * 使用者が接地しているかを解決する。
 * ひこうタイプ / ふゆう系特性 / ふうせん所持 で浮いているが、
 * じゅうりょく中は全員が接地扱いになる。
 */
export function resolveAttackerGrounded({
  types,
  ability,
  item,
  isGravity,
}: {
  types?: TypeName[]
  ability?: string | null
  item?: string | null
  isGravity?: boolean
}): boolean {
  if (isGravity === true) return true
  // くろいてっきゅう: ひこう / ふゆう系でも接地扱い（防御側の接地判定と対称）
  if (item === 'くろいてっきゅう') return true
  if (types?.includes('ひこう')) return false
  if (isLevitateLikeAbility(ability)) return false
  if (item === 'ふうせん') return false
  return true
}

/** だいちのはどう: フィールド → 変化後のタイプ（フィールドなしは null） */
export function resolveTerrainPulseType(terrain: TerrainField): TypeName | null {
  switch (terrain) {
    case 'エレキ': return 'でんき'
    case 'グラス': return 'くさ'
    case 'サイコ': return 'エスパー'
    case 'ミスト': return 'フェアリー'
    default: return null
  }
}

/**
 * だいちのはどうの効果（タイプ変化 + 威力2倍）が発動しているか。
 * フィールドが張られていて、かつ使用者が接地しているときのみ発動する。
 */
export function isTerrainPulseActive({
  moveSpecial,
  terrain,
  attackerGrounded,
}: Pick<MoveResolutionInput, 'moveSpecial' | 'terrain' | 'attackerGrounded'>): boolean {
  if (moveSpecial !== 'terrain-pulse') return false
  if (resolveTerrainPulseType(terrain ?? null) === null) return false
  return attackerGrounded ?? true
}

/** 天候系特性を含めた実効天候 */
export function resolveEffectiveWeather({
  weather,
  attackerAbility,
  defenderAbility,
}: Pick<MoveResolutionInput, 'weather' | 'attackerAbility' | 'defenderAbility'>): Weather {
  if (attackerAbility === 'メガソーラー' || defenderAbility === 'メガソーラー') {
    return 'はれ'
  }
  return weather
}

export function resolveWeatherAwareMoveType(input: MoveResolutionInput): TypeName {
  if (input.moveSpecial === 'weather-ball') {
    switch (resolveEffectiveWeather(input)) {
      case 'はれ': return 'ほのお'
      case 'あめ': return 'みず'
      case 'すなあらし': return 'いわ'
      case 'ゆき': return 'こおり'
      default: return 'ノーマル'
    }
  }

  // だいちのはどう: フィールドのタイプが スキン特性 より優先される
  if (isTerrainPulseActive(input)) {
    const terrainType = resolveTerrainPulseType(input.terrain ?? null)
    if (terrainType !== null) return terrainType
  }

  if (input.moveType === 'ノーマル') {
    if (input.attackerAbility === 'フェアリースキン') return 'フェアリー'
    if (input.attackerAbility === 'スカイスキン') return 'ひこう'
    if (input.attackerAbility === 'エレキスキン') return 'でんき'
    if (input.attackerAbility === 'フリーズスキン') return 'こおり'
  }
  return input.moveType
}

export function resolveWeatherAwareMovePower({
  movePower,
  moveSpecial,
  weather,
  terrain,
  attackerGrounded,
  attackerAbility,
  defenderAbility,
}: {
  movePower: number | null | undefined
  moveSpecial?: SpecialMoveTag | null
  weather: Weather
  terrain?: TerrainField
  attackerGrounded?: boolean
  attackerAbility?: string
  defenderAbility?: string
}): number | null {
  if (moveSpecial === 'weather-ball' &&
      resolveEffectiveWeather({ weather, attackerAbility, defenderAbility }) !== null) {
    return 100
  }
  if (isTerrainPulseActive({ moveSpecial, terrain, attackerGrounded })) {
    return (movePower ?? 50) * 2
  }
  return movePower ?? null
}
