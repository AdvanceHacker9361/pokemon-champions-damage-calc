import type { Weather, TerrainField } from '@/domain/models/Pokemon'
import { useAttackerStore, useDefenderStore, type PokemonStore } from './pokemonStore'
import { useFieldStore } from './fieldStore'
import { useProgressionStore, type ProgressionEvent } from './progressionStore'
import { TURN_END_ORDER, type PassiveEffect } from '@/domain/models/PassiveEffect'
import { useAttackerTabsStore, useDefenderTabsStore } from './pokemonTabsStore'

/** ポケモンストアのうちスナップショット対象となるデータフィールドのみ */
export type PokemonSnapshot = Pick<PokemonStore,
  | 'pokemonId' | 'pokemonName' | 'statNatures' | 'sp' | 'abilityName' | 'itemName'
  | 'isMega' | 'canMega' | 'availableMegas' | 'megaKey' | 'isBlade' | 'isMighty'
  | 'ranks' | 'status' | 'abilityActivated' | 'proteanType' | 'proteanStab'
  | 'moves' | 'movePowers' | 'supremeOverlordBoost' | 'focusEnergyActive' | 'chargeActive' | 'metronomeMultiplier'
  | 'grounded'
  | 'baseStats' | 'types' | 'weight' | 'effectiveAbility'>

/** ポケモンタブ1件（片側の複数構成を保持するための単位） */
export interface PokemonTab {
  id: string
  snapshot: PokemonSnapshot
}

/** 片側のポケモンタブ全体のスナップショット */
export interface PokemonTabsSnapshot {
  tabs: PokemonTab[]
  activeTabId: string | null
}

/** タブ ID 生成（sessionStore と同一パターン） */
export function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

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
  /**
   * 常時効果（V3.18.0）。この機能以前に永続化されたセッションとの後方互換のため optional。
   * 未定義のスナップショットは `migrateProgressionSnapshot` が旧フィールドから生成する。
   */
  passiveEffects?: PassiveEffect[]
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
  /**
   * 攻撃側ポケモンタブ一覧（V3.15）。
   * この機能以前に永続化されたセッションとの後方互換のため optional。
   */
  attackerTabs?: PokemonTabsSnapshot
  /**
   * 防御側ポケモンタブ一覧。
   * 防御側タブ導入以前に永続化されたセッションとの後方互換のため optional。
   */
  defenderTabs?: PokemonTabsSnapshot
}

export function clonePokemonSnapshot(s: PokemonSnapshot): PokemonSnapshot {
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

function clonePassiveEffect(e: PassiveEffect): PassiveEffect {
  return { ...e, amount: { ...e.amount } }
}

function cloneProgressionSnapshot(p: ProgressionSnapshot): ProgressionSnapshot {
  return {
    events: p.events.map(cloneProgressionEvent),
    passiveEffects: p.passiveEffects ? p.passiveEffects.map(clonePassiveEffect) : undefined,
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

function clonePokemonTabsSnapshot(s: PokemonTabsSnapshot): PokemonTabsSnapshot {
  return {
    activeTabId: s.activeTabId,
    tabs: s.tabs.map(t => ({ id: t.id, snapshot: clonePokemonSnapshot(t.snapshot) })),
  }
}

/**
 * 片側のタブストアの現在状態を取得。
 * アクティブタブの内容は（タブ切替を挟まない直近のライブ編集を反映するため）
 * 保存済みスナップショットではなく対応するライブポケモンストアから取得する。
 */
function capturePokemonTabs(
  tabsStore: typeof useAttackerTabsStore,
  pokemonStore: typeof useAttackerStore
): PokemonTabsSnapshot {
  const { tabs, activeTabId } = tabsStore.getState()
  return {
    activeTabId,
    tabs: tabs.map(t =>
      t.id === activeTabId
        ? { id: t.id, snapshot: clonePokemonSnapshot(pokemonStore.getState()) }
        : { id: t.id, snapshot: clonePokemonSnapshot(t.snapshot) }
    ),
  }
}

/** タブスナップショットを復元。無い（旧永続化）場合はライブ内容から単一タブを生成 */
function restorePokemonTabs(
  tabsStore: typeof useAttackerTabsStore,
  tabsSnap: PokemonTabsSnapshot | undefined,
  fallback: PokemonSnapshot
): void {
  if (tabsSnap && tabsSnap.tabs.length >= 1) {
    tabsStore.setState(clonePokemonTabsSnapshot(tabsSnap))
    return
  }
  const id = genId()
  tabsStore.setState({
    tabs: [{ id, snapshot: clonePokemonSnapshot(fallback) }],
    activeTabId: id,
  })
}

/** SessionSnapshot 全体の深いコピー */
export function cloneSnapshot(snap: SessionSnapshot): SessionSnapshot {
  return {
    attacker: clonePokemonSnapshot(snap.attacker),
    defender: clonePokemonSnapshot(snap.defender),
    field: { ...snap.field },
    progression: cloneProgressionSnapshot(snap.progression),
    attackerTabs: snap.attackerTabs ? clonePokemonTabsSnapshot(snap.attackerTabs) : undefined,
    defenderTabs: snap.defenderTabs ? clonePokemonTabsSnapshot(snap.defenderTabs) : undefined,
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
      passiveEffects: prog.passiveEffects,
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
    attackerTabs: capturePokemonTabs(useAttackerTabsStore, useAttackerStore),
    defenderTabs: capturePokemonTabs(useDefenderTabsStore, useDefenderStore),
  }
}

/**
 * 旧フィールド（constDmg / constRec / poisonTurns / leechSeed イベント）から
 * 常時効果（passiveEffects）を生成する移行処理（V3.18.0）。
 *
 * `passiveEffects` が既に定義されているスナップショットは何もしない（冪等）。
 * 移行後は旧数値フィールドを 0 にし、旧 `leechSeed` イベントは時系列から取り除く。
 */
export function migrateProgressionSnapshot(p: ProgressionSnapshot): ProgressionSnapshot {
  if (p.passiveEffects !== undefined) return p

  const passiveEffects: PassiveEffect[] = []
  if (p.constDmg > 0) {
    passiveEffects.push({
      id: genId(), side: 'defender', kind: 'damage',
      amount: { type: 'fixed', value: p.constDmg },
      timing: 'start', count: 1, startTurn: 1,
      order: TURN_END_ORDER.custom, label: '定数ダメ（移行）',
    })
  }
  if (p.constRec > 0) {
    passiveEffects.push({
      id: genId(), side: 'defender', kind: 'recover',
      amount: { type: 'fixed', value: p.constRec },
      timing: 'turnEnd', count: 'all', startTurn: 1,
      order: TURN_END_ORDER.itemHeal, label: '定数回復（移行）',
    })
  }
  if (p.poisonTurns > 0) {
    passiveEffects.push({
      id: genId(), side: 'defender', kind: 'damage',
      amount: { type: 'toxic' },
      timing: 'turnEnd', count: p.poisonTurns, startTurn: 1,
      order: TURN_END_ORDER.poison, presetKey: 'toxic', label: 'もうどく（移行）',
    })
  }

  const events: ProgressionEvent[] = []
  for (const ev of p.events) {
    if (ev.kind !== 'leechSeed') {
      events.push(ev)
      continue
    }
    passiveEffects.push({
      id: genId(),
      // direction は植え主の側。常時効果の side は被ダメ側
      side: ev.direction === 'fromAttacker' ? 'defender' : 'attacker',
      kind: 'leechSeed',
      amount: { type: 'ratio', num: 1, den: 8, rounding: 'floor' },
      timing: 'turnEnd', count: 1, startTurn: 1,
      order: TURN_END_ORDER.leechSeed, presetKey: 'leechSeed', label: 'やどりぎ（移行）',
    })
  }

  return { ...p, events, passiveEffects, constDmg: 0, constRec: 0, poisonTurns: 0 }
}

/**
 * スナップショットをライブストアへ復元。
 * setState はマージなのでアクション関数は保持される。
 */
export function restoreState(snap: SessionSnapshot): void {
  useAttackerStore.setState(clonePokemonSnapshot(snap.attacker))
  useDefenderStore.setState(clonePokemonSnapshot(snap.defender))
  useFieldStore.setState({ ...snap.field })
  const progression = migrateProgressionSnapshot(cloneProgressionSnapshot(snap.progression))
  useProgressionStore.setState({
    ...progression,
    passiveEffects: progression.passiveEffects ?? [],
  })

  // 各側のタブを復元。該当フィールドが無い（その機能以前の永続化）場合は、
  // ライブ内容（= snap.attacker / snap.defender）から単一タブを新規生成する。
  restorePokemonTabs(useAttackerTabsStore, snap.attackerTabs, snap.attacker)
  restorePokemonTabs(useDefenderTabsStore, snap.defenderTabs, snap.defender)
}
