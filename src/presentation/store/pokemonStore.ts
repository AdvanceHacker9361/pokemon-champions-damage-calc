import { create } from 'zustand'
import type { StatKey, StatusCondition, TypeName } from '@/domain/models/Pokemon'
import type { SpDistribution } from '@/domain/models/StatPoints'
import {
  createSpDistribution, withStat, getTotalSp, getRemainingsSp,
} from '@/domain/models/StatPoints'
import { SP_MAX_TOTAL } from '@/domain/constants/spLimits'
import type { BaseStats } from '@/domain/models/Pokemon'
import type { MegaPokemonRecord } from '@/data/schemas/types'
import { PokemonRepository } from '@/data/repositories/PokemonRepository'
import type { StatNatures } from '@/application/usecases/CalculateStatsUseCase'

/** 性格倍率 3択 */
export type StatNatureVal = 0.9 | 1.0 | 1.1

/**
 * 「計算開始時点の状態」で既に発動している条件付き特性。
 * 防御側が HP 満タン前提のため、満タン条件の特性はデフォルト ON、
 * HP 減少が必要な特性は OFF とする。
 */
const INITIALLY_ACTIVATED_ABILITIES = new Set([
  'マルチスケイル',   // HP満タン
  'ファントムガード', // HP満タン
  'ばけのかわ',       // 戦闘開始時は有効
])

function defaultAbilityActivated(ability: string): boolean {
  return INITIALLY_ACTIVATED_ABILITIES.has(ability)
}

const NATURE_STATS: Exclude<StatKey, 'hp'>[] = ['atk', 'def', 'spa', 'spd', 'spe']
const DEFAULT_STAT_NATURES: StatNatures = Object.fromEntries(
  NATURE_STATS.map(s => [s, 1.0])
) as StatNatures

export interface PokemonStore {
  // State
  pokemonId: number | null
  pokemonName: string
  statNatures: StatNatures
  sp: SpDistribution
  abilityName: string
  itemName: string | null
  isMega: boolean
  canMega: boolean
  availableMegas: MegaPokemonRecord[]  // 利用可能なメガ形態リスト（複数形態対応）
  megaKey: string | null               // 選択中のメガ形態キー
  isBlade: boolean  // バトルスイッチ: true=ブレードフォルム, false=シールドフォルム
  ranks: Record<StatKey, number>
  status: StatusCondition
  abilityActivated: boolean
  proteanType: TypeName | null
  /** へんげんじざい発動中のタイプ一致補正（true=1.5倍, false=なし） */
  proteanStab: boolean
  moves: [string | null, string | null, string | null, string | null]
  /** 可変威力技のスロットごとの選択威力（null = 技デフォルト値を使用） */
  movePowers: [number | null, number | null, number | null, number | null]
  /** そうだいしょう: 倒れた味方の数 0/1/2 */
  supremeOverlordBoost: 0 | 1 | 2
  // Derived (cached)
  baseStats: BaseStats
  types: TypeName[]
  weight: number
  effectiveAbility: string

  // Actions
  setPokemon: (id: number) => void
  setStatNature: (stat: StatKey, val: number) => void
  setSp: (stat: StatKey, value: number) => void
  setSpFull: (sp: SpDistribution) => void
  setAbility: (name: string) => void
  setItem: (name: string | null) => void
  setMega: (enable: boolean) => void
  setMegaForm: (key: string) => void   // X/Y等の形態切り替え
  setBlade: (enable: boolean) => void
  setRank: (stat: StatKey, rank: number) => void
  setStatus: (status: StatusCondition) => void
  setAbilityActivated: (v: boolean) => void
  setProteanType: (type: TypeName | null) => void
  setProteanStab: (v: boolean) => void
  setMove: (slot: 0 | 1 | 2 | 3, moveName: string | null) => void
  setMovePower: (slot: 0 | 1 | 2 | 3, power: number | null) => void
  setSupremeOverlordBoost: (v: 0 | 1 | 2) => void
  reset: () => void
}

const DEFAULT_BASE_STATS: BaseStats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
const DEFAULT_RANKS: Record<StatKey, number> = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }

function createPokemonStore() {
  return create<PokemonStore>((set, get) => ({
    pokemonId: null,
    pokemonName: '',
    statNatures: { ...DEFAULT_STAT_NATURES },
    sp: createSpDistribution(),
    abilityName: 'なし',
    itemName: null,
    isMega: false,
    canMega: false,
    availableMegas: [],
    megaKey: null,
    isBlade: false,
    ranks: { ...DEFAULT_RANKS },
    status: null,
    abilityActivated: false,
    proteanType: null,
    proteanStab: true,
    moves: [null, null, null, null],
    movePowers: [null, null, null, null],
    supremeOverlordBoost: 0,
    baseStats: { ...DEFAULT_BASE_STATS },
    types: [],
    weight: 0,
    effectiveAbility: 'なし',

    setPokemon: (id: number) => {
      const record = PokemonRepository.findById(id)
      if (!record) return
      const availableMegas = PokemonRepository.getMegasByBaseId(id)
      const canMega = availableMegas.length > 0
      const isMega = get().isMega && canMega

      let baseStats = record.baseStats as BaseStats
      let types = record.types as TypeName[]
      let abilityName = record.abilities[0] ?? 'なし'
      let effectiveAbility = abilityName
      let weight = record.weight
      let megaKey: string | null = null

      if (isMega && availableMegas.length > 0) {
        const mega = availableMegas[0]
        baseStats = mega.baseStats as BaseStats
        types = mega.types as TypeName[]
        effectiveAbility = mega.ability
        weight = mega.weight !== undefined ? mega.weight : record.weight
        megaKey = mega.key
      }

      set({
        pokemonId: id,
        pokemonName: record.name,
        baseStats,
        types,
        canMega,
        availableMegas,
        megaKey,
        isMega,
        isBlade: false,
        abilityName: record.abilities[0] ?? 'なし',
        effectiveAbility,
        weight,
        sp: createSpDistribution(),
        ranks: { ...DEFAULT_RANKS },
        status: null,
        abilityActivated: defaultAbilityActivated(effectiveAbility),
        proteanType: null,
        proteanStab: true,
        supremeOverlordBoost: 0,
      })
    },

    setStatNature: (stat, val) => set(s => ({
      statNatures: { ...s.statNatures, [stat]: val },
    })),

    setSp: (stat, value) => {
      const current = get().sp
      const clamped = Math.max(0, Math.min(32, value))
      const newSp = withStat(current, stat, clamped)
      const total = getTotalSp(newSp)
      if (total > SP_MAX_TOTAL) return
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
        if (mega) return
      }
      set({ abilityName: name, effectiveAbility: name, abilityActivated: defaultAbilityActivated(name) })
    },

    setItem: (name) => set({ itemName: name }),

    setMega: (enable) => {
      const { pokemonId, canMega, abilityName, availableMegas } = get()
      if (!canMega || !pokemonId) return

      if (enable) {
        const mega = availableMegas[0]
        if (!mega) return
        const base = PokemonRepository.findById(pokemonId)
        set({
          isMega: true,
          megaKey: mega.key,
          baseStats: mega.baseStats as BaseStats,
          types: mega.types as TypeName[],
          effectiveAbility: mega.ability,
          abilityActivated: defaultAbilityActivated(mega.ability),
          weight: mega.weight !== undefined ? mega.weight : (base?.weight ?? 0),
        })
      } else {
        const base = PokemonRepository.findById(pokemonId)
        if (!base) return
        set({
          isMega: false,
          megaKey: null,
          baseStats: base.baseStats as BaseStats,
          types: base.types as TypeName[],
          effectiveAbility: abilityName,
          abilityActivated: defaultAbilityActivated(abilityName),
          weight: base.weight,
        })
      }
    },

    setMegaForm: (key) => {
      const { pokemonId, isMega, availableMegas } = get()
      if (!pokemonId || !isMega) return
      const mega = availableMegas.find(m => m.key === key)
      if (!mega) return
      const base = PokemonRepository.findById(pokemonId)
      set({
        megaKey: mega.key,
        baseStats: mega.baseStats as BaseStats,
        types: mega.types as TypeName[],
        effectiveAbility: mega.ability,
        abilityActivated: defaultAbilityActivated(mega.ability),
        weight: mega.weight !== undefined ? mega.weight : (base?.weight ?? 0),
      })
    },

    setBlade: (enable) => {
      const { isBlade, baseStats, effectiveAbility } = get()
      if (effectiveAbility !== 'バトルスイッチ') return
      if (isBlade === enable) return
      // シールド↔ブレード: atk↔def, spa↔spd を入れ替え
      set({
        isBlade: enable,
        baseStats: {
          ...baseStats,
          atk: baseStats.def,
          def: baseStats.atk,
          spa: baseStats.spd,
          spd: baseStats.spa,
        },
      })
    },

    setRank: (stat, rank) => set(s => ({
      ranks: { ...s.ranks, [stat]: Math.max(-6, Math.min(6, rank)) },
    })),

    setStatus: (status) => set({ status }),

    setAbilityActivated: (v) => set({ abilityActivated: v }),

    setProteanType: (type) => set({ proteanType: type }),

    setProteanStab: (v) => set({ proteanStab: v }),

    setMove: (slot, moveName) => set(s => {
      const moves = [...s.moves] as typeof s.moves
      moves[slot] = moveName
      // 技を変更したらその枠の威力選択をリセット
      const movePowers = [...s.movePowers] as typeof s.movePowers
      movePowers[slot] = null
      return { moves, movePowers }
    }),

    setMovePower: (slot, power) => set(s => {
      const movePowers = [...s.movePowers] as typeof s.movePowers
      movePowers[slot] = power
      return { movePowers }
    }),

    setSupremeOverlordBoost: (v) => set({ supremeOverlordBoost: v }),

    reset: () => set({
      pokemonId: null, pokemonName: '',
      statNatures: { ...DEFAULT_STAT_NATURES },
      sp: createSpDistribution(), abilityName: 'なし', itemName: null,
      isMega: false, canMega: false, availableMegas: [], megaKey: null,
      isBlade: false, ranks: { ...DEFAULT_RANKS }, status: null,
      abilityActivated: false, proteanType: null, proteanStab: true,
      moves: [null, null, null, null],
      movePowers: [null, null, null, null],
      supremeOverlordBoost: 0,
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
