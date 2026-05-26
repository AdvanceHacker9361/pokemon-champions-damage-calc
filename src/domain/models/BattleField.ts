import type { Weather, TerrainField } from '@/domain/models/Pokemon'

export interface BattleField {
  weather: Weather
  terrain: TerrainField
  isReflect: boolean
  isLightScreen: boolean
  isAuroraVeil: boolean
  isTrickRoom: boolean
  /** じゅうりょく: 命中率5/3倍 + 全ポケモン接地（ひこう/ふゆうにじめん技が当たる） */
  isGravity: boolean
}

export function createDefaultBattleField(): BattleField {
  return {
    weather: null,
    terrain: null,
    isReflect: false,
    isLightScreen: false,
    isAuroraVeil: false,
    isTrickRoom: false,
    isGravity: false,
  }
}
