import type { Weather, TerrainField } from '@/domain/models/Pokemon'
import { useAttackerStore, useDefenderStore, type PokemonStore } from './pokemonStore'
import { useFieldStore } from './fieldStore'
import { useProgressionStore, type ProgressionEvent } from './progressionStore'

/** ポケモンストアのうちスナップショット対象となるデータフィールドのみ */
export type PokemonSnapshot = Pick<PokemonStore,
  | 'pokemonId' | 'pokemonName' | 'statNatures' | 'sp' | 'abilityName' | 'itemName'
  | 'isMega' | 'canMega' | 'availableMegas' | 'megaKey' | 'isBlade' | 'isMighty'
  | 'ranks' | 'status' | 'abilityActivated' | 'proteanType' | 'proteanStab'
  | 'moves' | 'movePowers' | 'supremeOverlordBoost' | 'focusEnergyActive' | 'chargeActive' | 'metronomeMultiplier'
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

export interface ProgressionSnapshot {
  events: ProgressionEvent[]
  constDmg: number
  constRec: number
  constRecBerry: number
  constRecBerryThresholdPct: number
  berryCudChew: boolean
  berryHarvestChance: number
  poisonTurns: number
  attackerStartHp: number | null
  defenderStartHp: number | null
}

export interface SessionSnapshot {
  attacker: PokemonSnapshot
  defender: PokemonSnapshot
  field: FieldSnapshot
  progression: ProgressionSnapshot
}

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
    metronomeMultiplier: s.metronomeMultiplier,
    grounded: s.grounded,
    baseStats: { ...s.baseStats },
    types: [...s.types],
    weight: s.weight,
    effectiveAbility: s.effectiveAbility,
  }
}

function cloneProgressionEvent(ev: ProgressionEvent): ProgressionEvent {
  if (ev.kind === 'attack') {
    return {
      ...ev,
      rolls: [...ev.rolls],
      rawRolls: [...ev.rawRolls],
      critRolls: [...ev.critRolls],
      rawCritRolls: [...ev.rawCritRolls],
      pbParentRolls: ev.pbParentRolls ? [...ev.pbParentRolls] : undefined,
      pbParentCritRolls: ev.pbParentCritRolls ? [...ev.pbParentCritRolls] : undefined,
      pbParentRawRolls: ev.pbParentRawRolls ? [...ev.pbParentRawRolls] : undefined,
      pbParentRawCritRolls: ev.pbParentRawCritRolls ? [...ev.pbParentRawCritRolls] : undefined,
      pbChildRolls: ev.pbChildRolls ? [...ev.pbChildRolls] : undefined,
      pbChildCritRolls: ev.pbChildCritRolls ? [...ev.pbChildCritRolls] : undefined,
      variableHitDist: ev.variableHitDist ? ev.variableHitDist.map(d => ({ ...d })) : undefined,
    }
  }
  return { ...ev }
}

function cloneProgressionSnapshot(p: ProgressionSnapshot): ProgressionSnapshot {
  return {
    events: p.events.map(cloneProgressionEvent),
    constDmg: p.constDmg,
    constRec: p.constRec,
    constRecBerry: p.constRecBerry ?? 0,
    constRecBerryThresholdPct: p.constRecBerryThresholdPct ?? 50,
    berryCudChew: p.berryCudChew ?? false,
    berryHarvestChance: p.berryHarvestChance ?? 0,
    poisonTurns: p.poisonTurns,
    attackerStartHp: p.attackerStartHp,
    defenderStartHp: p.defenderStartHp,
  }
}

/** SessionSnapshot 全体の深いコピー */
export function cloneSnapshot(snap: SessionSnapshot): SessionSnapshot {
  return {
    attacker: clonePokemonSnapshot(snap.attacker),
    defender: clonePokemonSnapshot(snap.defender),
    field: { ...snap.field },
    progression: cloneProgressionSnapshot(snap.progression),
  }
}

/** 現在のライブストアからスナップショットを取得（参照は複製） */
export function snapshotLiveState(): SessionSnapshot {
  const field = useFieldStore.getState()
  const prog = useProgressionStore.getState()
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
    progression: cloneProgressionSnapshot({
      events: prog.events,
      constDmg: prog.constDmg,
      constRec: prog.constRec,
      constRecBerry: prog.constRecBerry,
      constRecBerryThresholdPct: prog.constRecBerryThresholdPct,
      berryCudChew: prog.berryCudChew,
      berryHarvestChance: prog.berryHarvestChance,
      poisonTurns: prog.poisonTurns,
      attackerStartHp: prog.attackerStartHp,
      defenderStartHp: prog.defenderStartHp,
    }),
  }
}

/**
 * スナップショットをライブストアへ復元。
 * setState はマージなのでアクション関数は保持される。
 */
export function restoreState(snap: SessionSnapshot): void {
  useAttackerStore.setState(clonePokemonSnapshot(snap.attacker))
  useDefenderStore.setState(clonePokemonSnapshot(snap.defender))
  useFieldStore.setState({ ...snap.field })
  useProgressionStore.setState(cloneProgressionSnapshot(snap.progression))
}
