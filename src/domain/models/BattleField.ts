import type { Weather, TerrainField } from '@/domain/models/Pokemon'

export interface BattleField {
  weather: Weather
  terrain: TerrainField
  isReflect: boolean
  isLightScreen: boolean
  isAuroraVeil: boolean
  isTrickRoom: boolean
}

export function createDefaultBattleField(): BattleField {
  return {
    weather: null,
    terrain: null,
    isReflect: false,
    isLightScreen: false,
    isAuroraVeil: false,
    isTrickRoom: false,
  }
}
