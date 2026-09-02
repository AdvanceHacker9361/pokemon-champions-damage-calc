import { describe, expect, it } from 'vitest'
import { migrateProgressionSnapshot, cloneSnapshot, type ProgressionSnapshot } from '@/presentation/store/sessionSnapshot'
import type { ProgressionEvent } from '@/presentation/store/progressionStore'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
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
