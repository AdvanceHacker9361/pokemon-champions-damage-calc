import { create } from 'zustand'
import type { Weather, TerrainField } from '@/domain/models/Pokemon'

interface FieldStore {
  weather: Weather
  terrain: TerrainField
  isReflect: boolean
  isLightScreen: boolean
  isAuroraVeil: boolean
  isTrickRoom: boolean

  setWeather: (w: Weather) => void
  setTerrain: (t: TerrainField) => void
  setReflect: (v: boolean) => void
  setLightScreen: (v: boolean) => void
  setAuroraVeil: (v: boolean) => void
  setTrickRoom: (v: boolean) => void
}

export const useFieldStore = create<FieldStore>(set => ({
  weather: null,
  terrain: null,
  isReflect: false,
  isLightScreen: false,
  isAuroraVeil: false,
  isTrickRoom: false,

  setWeather: (weather) => set({ weather }),
  setTerrain: (terrain) => set({ terrain }),
  setReflect: (isReflect) => set({ isReflect }),
  setLightScreen: (isLightScreen) => set({ isLightScreen }),
  setAuroraVeil: (isAuroraVeil) => set({ isAuroraVeil }),
  setTrickRoom: (isTrickRoom) => set({ isTrickRoom }),
}))
