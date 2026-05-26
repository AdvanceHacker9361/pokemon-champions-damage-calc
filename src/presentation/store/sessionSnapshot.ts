import type { Weather, TerrainField } from '@/domain/models/Pokemon'
import { useAttackerStore, useDefenderStore, type PokemonStore } from './pokemonStore'
import { useFieldStore } from './fieldStore'
import { useAccumStore, type AccumEntry } from './accumStore'

/** ポケモンストアのうちスナップショット対象となるデータフィールドのみ */
export type PokemonSnapshot = Pick<PokemonStore,
  | 'pokemonId' | 'pokemonName' | 'statNatures' | 'sp' | 'abilityName' | 'itemName'
  | 'isMega' | 'canMega' | 'availableMegas' | 'megaKey' | 'isBlade' | 'isMighty'
  | 'ranks' | 'status' | 'abilityActivated' | 'proteanType' | 'proteanStab'
  | 'moves' | 'movePowers' | 'supremeOverlordBoost' | 'focusEnergyActive' | 'chargeActive'
  | 'grounded'
  | 'baseStats' | 'types' | 'weight' | 'effectiveAbility'>

export interface FieldSnapshot {
  weather: Weather
  terrain: TerrainField
  isReflect: boolean
  isLightScreen: boolean
  isAuroraVeil: boolean
  isTrickRoom: boolean
  isGravity: boolean
}

export interface AccumSnapshot {
  entries: AccumEntry[]
  constDmg: number
  constRec: number
  poisonTurns: number
}

export interface SessionSnapshot {
  attacker: PokemonSnapshot
  defender: PokemonSnapshot
  field: FieldSnapshot
  accum: AccumSnapshot
}

/**
 * ポケモンスナップショットの深いコピー。
 * 配列・オブジェクトはすべて複製し、ライブストアと参照を共有させない。
 */
function clonePokemonSnapshot(s: PokemonSnapshot): PokemonSnapshot {
  return {
    pokemonId: s.pokemonId,
    pokemonName: s.pokemonName,
    statNatures: { ...s.statNatures },
    sp: { ...s.sp },
    abilityName: s.abilityName,
    itemName: s.itemName,
    isMega: s.isMega,
    canMega: s.canMega,
    availableMegas: [...s.availableMegas],
    megaKey: s.megaKey,
    isBlade: s.isBlade,
    isMighty: s.isMighty,
    ranks: { ...s.ranks },
    status: s.status,
    abilityActivated: s.abilityActivated,
    proteanType: s.proteanType,
    proteanStab: s.proteanStab,
    moves: [...s.moves] as PokemonSnapshot['moves'],
    movePowers: [...s.movePowers] as PokemonSnapshot['movePowers'],
    supremeOverlordBoost: s.supremeOverlordBoost,
    focusEnergyActive: s.focusEnergyActive,
    chargeActive: s.chargeActive,
    grounded: s.grounded,
    baseStats: { ...s.baseStats },
    types: [...s.types],
    weight: s.weight,
    effectiveAbility: s.effectiveAbility,
  }
}

function cloneAccumEntry(e: AccumEntry): AccumEntry {
  return {
    ...e,
    rolls: [...e.rolls],
    rawRolls: [...e.rawRolls],
    critRolls: [...e.critRolls],
    rawCritRolls: [...e.rawCritRolls],
    pbParentRolls: e.pbParentRolls ? [...e.pbParentRolls] : undefined,
    pbParentCritRolls: e.pbParentCritRolls ? [...e.pbParentCritRolls] : undefined,
    pbParentRawRolls: e.pbParentRawRolls ? [...e.pbParentRawRolls] : undefined,
    pbParentRawCritRolls: e.pbParentRawCritRolls ? [...e.pbParentRawCritRolls] : undefined,
    pbChildRolls: e.pbChildRolls ? [...e.pbChildRolls] : undefined,
    pbChildCritRolls: e.pbChildCritRolls ? [...e.pbChildCritRolls] : undefined,
    variableHitDist: e.variableHitDist ? e.variableHitDist.map(d => ({ ...d })) : undefined,
  }
}

function cloneAccumSnapshot(a: AccumSnapshot): AccumSnapshot {
  return {
    entries: a.entries.map(cloneAccumEntry),
    constDmg: a.constDmg,
    constRec: a.constRec,
    poisonTurns: a.poisonTurns,
  }
}

/** SessionSnapshot 全体の深いコピー */
export function cloneSnapshot(snap: SessionSnapshot): SessionSnapshot {
  return {
    attacker: clonePokemonSnapshot(snap.attacker),
    defender: clonePokemonSnapshot(snap.defender),
    field: { ...snap.field },
    accum: cloneAccumSnapshot(snap.accum),
  }
}

/** 現在のライブストアからスナップショットを取得（参照は複製） */
export function snapshotLiveState(): SessionSnapshot {
  const field = useFieldStore.getState()
  const accum = useAccumStore.getState()
  return {
    attacker: clonePokemonSnapshot(useAttackerStore.getState()),
    defender: clonePokemonSnapshot(useDefenderStore.getState()),
    field: {
      weather: field.weather,
      terrain: field.terrain,
      isReflect: field.isReflect,
      isLightScreen: field.isLightScreen,
      isAuroraVeil: field.isAuroraVeil,
      isTrickRoom: field.isTrickRoom,
      isGravity: field.isGravity,
    },
    accum: cloneAccumSnapshot({
      entries: accum.entries,
      constDmg: accum.constDmg,
      constRec: accum.constRec,
      poisonTurns: accum.poisonTurns,
    }),
  }
}

/**
 * スナップショットをライブストアへ復元。
 * setState はマージなのでアクション関数は保持される。
 * 復元時も再複製し、ライブストアの変更がタブ側スナップショットを汚さないようにする。
 */
export function restoreState(snap: SessionSnapshot): void {
  useAttackerStore.setState(clonePokemonSnapshot(snap.attacker))
  useDefenderStore.setState(clonePokemonSnapshot(snap.defender))
  useFieldStore.setState({ ...snap.field })
  useAccumStore.setState(cloneAccumSnapshot(snap.accum))
}
