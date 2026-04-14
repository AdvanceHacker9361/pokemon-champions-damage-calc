import { create } from 'zustand'
import type { StatKey, StatusCondition, TypeName } from '@/domain/models/Pokemon'
import type { SpDistribution } from '@/domain/models/StatPoints'
import {
  createSpDistribution, withStat, getTotalSp, getRemainingsSp,
} from '@/domain/models/StatPoints'
import { SP_MAX_TOTAL } from '@/domain/constants/spLimits'
import type { BaseStats } from '@/domain/models/Pokemon'
import { hasMegaEvolution } from '@/application/usecases/ApplyMegaEvolutionUseCase'
import { PokemonRepository } from '@/data/repositories/PokemonRepository'

export interface PokemonStore {
  // State
  pokemonId: number | null
  pokemonName: string
  natureName: string
  sp: SpDistribution
  abilityName: string
  itemName: string | null
  isMega: boolean
  canMega: boolean
  ranks: Record<StatKey, number>
  status: StatusCondition
  moves: [string | null, string | null, string | null, string | null]
  // Derived (cached)
  baseStats: BaseStats
  types: TypeName[]
  weight: number
  effectiveAbility: string

  // Actions
  setPokemon: (id: number) => void
  setNature: (name: string) => void
  setSp: (stat: StatKey, value: number) => void
  setSpFull: (sp: SpDistribution) => void
  setAbility: (name: string) => void
  setItem: (name: string | null) => void
  setMega: (enable: boolean) => void
  setRank: (stat: StatKey, rank: number) => void
  setStatus: (status: StatusCondition) => void
  setMove: (slot: 0 | 1 | 2 | 3, moveName: string | null) => void
  reset: () => void
}

const DEFAULT_BASE_STATS: BaseStats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
const DEFAULT_RANKS: Record<StatKey, number> = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }

function createPokemonStore() {
  return create<PokemonStore>((set, get) => ({
    pokemonId: null,
    pokemonName: '',
    natureName: 'まじめ',
    sp: createSpDistribution(),
    abilityName: 'なし',
    itemName: null,
    isMega: false,
    canMega: false,
    ranks: { ...DEFAULT_RANKS },
    status: null,
    moves: [null, null, null, null],
    baseStats: { ...DEFAULT_BASE_STATS },
    types: [],
    weight: 0,
    effectiveAbility: 'なし',

    setPokemon: (id: number) => {
      const record = PokemonRepository.findById(id)
      if (!record) return
      const canMega = hasMegaEvolution(id)
      const isMega = get().isMega && canMega

      let baseStats = record.baseStats as BaseStats
      let types = record.types as TypeName[]
      let abilityName = record.abilities[0] ?? 'なし'
      let effectiveAbility = abilityName
      let weight = record.weight

      if (isMega) {
        const mega = PokemonRepository.getMegaByBaseId(id)
        if (mega) {
          baseStats = mega.baseStats as BaseStats
          types = mega.types as TypeName[]
          effectiveAbility = mega.ability
          weight = record.weight
        }
      }

      set({
        pokemonId: id,
        pokemonName: record.name,
        baseStats,
        types,
        canMega,
        isMega,
        abilityName: record.abilities[0] ?? 'なし',
        effectiveAbility,
        weight,
        sp: createSpDistribution(),
        ranks: { ...DEFAULT_RANKS },
        status: null,
      })
    },

    setNature: (name) => set({ natureName: name }),

    setSp: (stat, value) => {
      const current = get().sp
      const clamped = Math.max(0, Math.min(32, value))
      const newSp = withStat(current, stat, clamped)
      const total = getTotalSp(newSp)
      if (total > SP_MAX_TOTAL) return  // 超過は無視
      set({ sp: newSp })
    },

    setSpFull: (sp) => {
      const total = getTotalSp(sp)
      if (total > SP_MAX_TOTAL) return
      set({ sp })
    },

    setAbility: (name) => {
      const { isMega, pokemonId } = get()
      if (isMega && pokemonId) {
        const mega = PokemonRepository.getMegaByBaseId(pokemonId)
        if (mega) return  // メガシンカ中は特性変更不可
      }
      set({ abilityName: name, effectiveAbility: name })
    },

    setItem: (name) => set({ itemName: name }),

    setMega: (enable) => {
      const { pokemonId, canMega, abilityName } = get()
      if (!canMega || !pokemonId) return

      if (enable) {
        const mega = PokemonRepository.getMegaByBaseId(pokemonId)
        if (!mega) return
        set({
          isMega: true,
          baseStats: mega.baseStats as BaseStats,
          types: mega.types as TypeName[],
          effectiveAbility: mega.ability,
        })
      } else {
        const base = PokemonRepository.findById(pokemonId)
        if (!base) return
        set({
          isMega: false,
          baseStats: base.baseStats as BaseStats,
          types: base.types as TypeName[],
          effectiveAbility: abilityName,
        })
      }
    },

    setRank: (stat, rank) => set(s => ({
      ranks: { ...s.ranks, [stat]: Math.max(-6, Math.min(6, rank)) },
    })),

    setStatus: (status) => set({ status }),

    setMove: (slot, moveName) => set(s => {
      const moves = [...s.moves] as typeof s.moves
      moves[slot] = moveName
      return { moves }
    }),

    reset: () => set({
      pokemonId: null, pokemonName: '', natureName: 'まじめ',
      sp: createSpDistribution(), abilityName: 'なし', itemName: null,
      isMega: false, canMega: false, ranks: { ...DEFAULT_RANKS }, status: null,
      moves: [null, null, null, null],
      baseStats: { ...DEFAULT_BASE_STATS }, types: [], weight: 0,
      effectiveAbility: 'なし',
    }),
  }))
}

export const useAttackerStore = createPokemonStore()
export const useDefenderStore = createPokemonStore()

// SP 残り表示用セレクタ
export function useAttackerSpRemaining() {
  return useAttackerStore(s => getRemainingsSp(s.sp))
}
export function useDefenderSpRemaining() {
  return useDefenderStore(s => getRemainingsSp(s.sp))
}
