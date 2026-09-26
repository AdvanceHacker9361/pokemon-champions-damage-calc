import { afterEach, describe, expect, it } from 'vitest'
import {
  migrateProgressionSnapshot, cloneSnapshot, snapshotLiveState, restoreState,
  type ProgressionSnapshot,
} from '@/presentation/store/sessionSnapshot'
import type { ProgressionEvent } from '@/presentation/store/progressionStore'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { useAttackerTabsStore, useDefenderTabsStore } from '@/presentation/store/pokemonTabsStore'
import { useFieldStore } from '@/presentation/store/fieldStore'

/** cloneSnapshot 経由で ProgressionEvent の複製（＝旧データ移行）結果を取り出す */
function cloneSnapshotOfEvents(events: ProgressionEvent[]): ProgressionEvent[] {
  return cloneSnapshot({
    attacker: useAttackerStore.getState(),
    defender: useDefenderStore.getState(),
    field: useFieldStore.getState(),
    progression: legacy({ events }),
  }).progression.events
}

function legacy(partial: Partial<ProgressionSnapshot> = {}): ProgressionSnapshot {
  return {
    events: [],
    constDmg: 0,
    constRec: 0,
    poisonTurns: 0,
    attackerStartHp: null,
    defenderStartHp: null,
    ...partial,
  }
}

describe('migrateProgressionSnapshot（旧背景効果 → 常時効果）', () => {
  it('constDmg は防御側の固定ダメ start（1回）になる', () => {
    const m = migrateProgressionSnapshot(legacy({ constDmg: 12 }))
    expect(m.passiveEffects).toHaveLength(1)
    expect(m.passiveEffects![0]).toMatchObject({
      side: 'defender', kind: 'damage', timing: 'start', count: 1,
      amount: { type: 'fixed', value: 12 },
    })
    expect(m.constDmg).toBe(0)
  })

  it('constRec は防御側の固定回復 turnEnd "all" になる', () => {
    const m = migrateProgressionSnapshot(legacy({ constRec: 9 }))
    expect(m.passiveEffects![0]).toMatchObject({
      side: 'defender', kind: 'recover', timing: 'turnEnd', count: 'all',
      amount: { type: 'fixed', value: 9 },
    })
    expect(m.constRec).toBe(0)
  })

  it('poisonTurns は もうどく turnEnd count=poisonTurns になる', () => {
    const m = migrateProgressionSnapshot(legacy({ poisonTurns: 4 }))
    expect(m.passiveEffects![0]).toMatchObject({
      side: 'defender', kind: 'damage', timing: 'turnEnd', count: 4,
      amount: { type: 'toxic' },
    })
    expect(m.poisonTurns).toBe(0)
  })

  it('旧 leechSeed イベントは常時効果へ移り、時系列からは除かれる', () => {
    const m = migrateProgressionSnapshot(legacy({
      events: [
        { kind: 'leechSeed', id: 'l1', direction: 'fromAttacker' },
        { kind: 'defenderConst', id: 'c1', amount: 5 },
        { kind: 'leechSeed', id: 'l2', direction: 'fromDefender' },
      ],
    }))
    expect(m.events.map(e => e.kind)).toEqual(['defenderConst'])
    expect(m.passiveEffects!.map(p => [p.kind, p.side])).toEqual([
      ['leechSeed', 'defender'],
      ['leechSeed', 'attacker'],
    ])
    expect(m.passiveEffects![0].amount).toEqual({ type: 'ratio', num: 1, den: 8, rounding: 'floor' })
  })

  it('複数の旧フィールドをまとめて移行する', () => {
    const m = migrateProgressionSnapshot(legacy({ constDmg: 3, constRec: 6, poisonTurns: 2 }))
    expect(m.passiveEffects!.map(p => p.timing)).toEqual(['start', 'turnEnd', 'turnEnd'])
  })

  it('passiveEffects が既にあるスナップショットは常時効果を作り直さない（冪等）', () => {
    const already = legacy({ constDmg: 12, passiveEffects: [] })
    const m = migrateProgressionSnapshot(already)
    expect(m.passiveEffects).toEqual([])
    // 旧フィールドは移行済み扱いなのでそのまま残る
    expect(m.constDmg).toBe(12)

    // きのみ移行だけは走るため、両側の BerryConfig が入る
    expect(m.defenderBerry).toEqual({ amount: 0, thresholdPct: 50, cudChew: false, harvestChance: 0 })
    expect(m.attackerBerry).toEqual({ amount: 0, thresholdPct: 50, cudChew: false, harvestChance: 0 })

    const twice = migrateProgressionSnapshot(migrateProgressionSnapshot(legacy({ constDmg: 12 })))
    expect(twice.passiveEffects).toHaveLength(1)
  })

  it('きのみ移行済みのスナップショットは同一参照を返す（完全冪等）', () => {
    const already = migrateProgressionSnapshot(legacy({ passiveEffects: [] }))
    expect(migrateProgressionSnapshot(already)).toBe(already)
  })

  it('旧フィールドが空なら常時効果も空になる', () => {
    const m = migrateProgressionSnapshot(legacy())
    expect(m.passiveEffects).toEqual([])
  })
})

describe('migrateProgressionSnapshot（旧きのみフィールド → 両側 BerryConfig）', () => {
  it('旧・防御側専用きのみは defenderBerry へ移り、攻撃側は既定値になる', () => {
    const m = migrateProgressionSnapshot(legacy({
      constRecBerry: 45,
      constRecBerryThresholdPct: 25,
      berryCudChew: true,
      berryHarvestChance: 0.5,
    }))
    expect(m.defenderBerry).toEqual({
      amount: 45, thresholdPct: 25, cudChew: true, harvestChance: 0.5,
    })
    expect(m.attackerBerry).toEqual({
      amount: 0, thresholdPct: 50, cudChew: false, harvestChance: 0,
    })
    // 旧フィールドは移行後に初期化される
    expect(m.constRecBerry).toBe(0)
    expect(m.berryCudChew).toBe(false)
    expect(m.berryHarvestChance).toBe(0)
  })

  it('常時効果が移行済み（V3.18.0 期）のスナップショットでもきのみだけは移行する', () => {
    const m = migrateProgressionSnapshot(legacy({ passiveEffects: [], constRecBerry: 30 }))
    expect(m.defenderBerry?.amount).toBe(30)
    expect(m.attackerBerry?.amount).toBe(0)
    // 常時効果は作り直さない
    expect(m.passiveEffects).toEqual([])
  })

  it('新形式（defenderBerry / attackerBerry あり）は上書きしない', () => {
    const attackerBerry = { amount: 20, thresholdPct: 50, cudChew: false, harvestChance: 0 }
    const defenderBerry = { amount: 10, thresholdPct: 25, cudChew: true, harvestChance: 1 }
    const m = migrateProgressionSnapshot(legacy({
      passiveEffects: [], constRecBerry: 99, attackerBerry, defenderBerry,
    }))
    expect(m.attackerBerry).toEqual(attackerBerry)
    expect(m.defenderBerry).toEqual(defenderBerry)
  })

  it('旧 rearmBerry（side なし）は防御側として復元される', () => {
    const legacyEvent = { kind: 'rearmBerry', id: 'r1' } as unknown as ProgressionEvent
    const snap = cloneSnapshotOfEvents([legacyEvent])
    expect(snap[0]).toMatchObject({ kind: 'rearmBerry', id: 'r1', side: 'defender' })
  })
})

// メガフラエッテ（えいえんのはな）: id 10670, mega key 'mega-floette-eternal'
// 正しい weight = 100.8, baseStats = { hp:74, atk:85, def:87, spa:155, spd:148, spe:102 }, ability = フェアリーオーラ
const MEGA_FLOETTE = 10670
// ヒスイヌメルゴン: id 10706（非メガ）。正しい weight = 334.1, baseStats = { hp:80, atk:100, def:100, spa:110, spd:150, spe:60 }
const HISUI_GOODRA = 10706
// ギルガルド: id 681（バトルスイッチ、ブレード時に atk↔def, spa↔spd が入れ替わる）
const AEGISLASH = 681
const UNKNOWN_POKEMON_ID = 999999

describe('restoreState: 派生データの再解決', () => {
  afterEach(() => {
    useAttackerStore.getState().reset()
    useDefenderStore.getState().reset()
    useAttackerTabsStore.setState({ tabs: [], activeTabId: null })
    useDefenderTabsStore.setState({ tabs: [], activeTabId: null })
  })

  it('陳腐化したメガの weight/baseStats をリポジトリから再解決する', () => {
    useDefenderStore.getState().setPokemon(MEGA_FLOETTE)
    useDefenderStore.getState().setMega(true)

    const snap = cloneSnapshot(snapshotLiveState())
    // データ更新前に永続化された「陳腐化したメガフラエッテ」を模す
    snap.defender.weight = 0.9
    snap.defender.baseStats = { ...snap.defender.baseStats, hp: 1 }

    restoreState(snap)

    const state = useDefenderStore.getState()
    expect(state.weight).toBe(100.8)
    expect(state.baseStats).toEqual({ hp: 74, atk: 85, def: 87, spa: 155, spd: 148, spe: 102 })
    expect(state.effectiveAbility).toBe('フェアリーオーラ')
    expect(state.isMega).toBe(true)
    expect(state.megaKey).toBe('mega-floette-eternal')
  })

  it('陳腐化した非メガの weight をリポジトリから再解決し、特性/ランク/技威力は保持する', () => {
    useAttackerStore.getState().setPokemon(HISUI_GOODRA)
    useAttackerStore.getState().setRank('atk', 3)
    useAttackerStore.getState().setMovePower(0, 130)
    const originalEffectiveAbility = useAttackerStore.getState().effectiveAbility

    const snap = cloneSnapshot(snapshotLiveState())
    snap.attacker.weight = 1 // 陳腐化した体重（本来は 334.1）

    restoreState(snap)

    const state = useAttackerStore.getState()
    expect(state.weight).toBe(334.1)
    expect(state.baseStats).toEqual({ hp: 80, atk: 100, def: 100, spa: 110, spd: 150, spe: 60 })
    // ライブの effectiveAbility は勝手に abilityName へ戻さない
    expect(state.effectiveAbility).toBe(originalEffectiveAbility)
    expect(state.ranks.atk).toBe(3)
    expect(state.movePowers[0]).toBe(130)
  })

  it('ブレードフォルムの baseStats 上書きは維持しつつ weight だけ再解決する', () => {
    useAttackerStore.getState().setPokemon(AEGISLASH)
    useAttackerStore.getState().setBlade(true)
    const bladeBaseStats = { ...useAttackerStore.getState().baseStats }
    expect(bladeBaseStats).toEqual({ hp: 60, atk: 140, def: 50, spa: 140, spd: 50, spe: 60 })

    const snap = cloneSnapshot(snapshotLiveState())
    snap.attacker.weight = 999 // 陳腐化した体重（本来は 53）

    restoreState(snap)

    const state = useAttackerStore.getState()
    expect(state.isBlade).toBe(true)
    expect(state.baseStats).toEqual(bladeBaseStats)
    expect(state.weight).toBe(53)
  })

  it('タブ内のスナップショットも復元時に再解決される', () => {
    useAttackerStore.getState().setPokemon(MEGA_FLOETTE)
    useAttackerStore.getState().setMega(true)
    useAttackerTabsStore.getState().initIfEmpty()

    const snap = cloneSnapshot(snapshotLiveState())
    expect(snap.attackerTabs!.tabs.length).toBe(1)
    snap.attackerTabs!.tabs[0]!.snapshot.weight = 0.9

    restoreState(snap)

    expect(useAttackerTabsStore.getState().tabs[0]!.snapshot.weight).toBe(100.8)
  })

  it('データから消えた pokemonId はスナップショットの値をそのまま維持する', () => {
    useAttackerStore.getState().reset()

    const snap = cloneSnapshot(snapshotLiveState())
    snap.attacker.pokemonId = UNKNOWN_POKEMON_ID
    snap.attacker.weight = 123

    restoreState(snap)

    const state = useAttackerStore.getState()
    expect(state.pokemonId).toBe(UNKNOWN_POKEMON_ID)
    expect(state.weight).toBe(123)
  })
})
