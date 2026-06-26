import type { SpecialMoveTag } from '@/domain/models/Move'
import type { TypeName, Weather } from '@/domain/models/Pokemon'

interface MoveResolutionInput {
  moveType: TypeName
  moveSpecial?: SpecialMoveTag | null
  weather: Weather
  attackerAbility?: string
  defenderAbility?: string
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
  attackerAbility,
  defenderAbility,
}: {
  movePower: number | null | undefined
  moveSpecial?: SpecialMoveTag | null
  weather: Weather
  attackerAbility?: string
  defenderAbility?: string
}): number | null {
  if (moveSpecial === 'weather-ball' &&
      resolveEffectiveWeather({ weather, attackerAbility, defenderAbility }) !== null) {
    return 100
  }
  return movePower ?? null
}
