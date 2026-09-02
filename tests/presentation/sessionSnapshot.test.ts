import { describe, expect, it } from 'vitest'
import { migrateProgressionSnapshot, type ProgressionSnapshot } from '@/presentation/store/sessionSnapshot'

function legacy(partial: Partial<ProgressionSnapshot> = {}): ProgressionSnapshot {
  return {
    events: [],
    constDmg: 0,
    constRec: 0,
    constRecBerry: 0,
    constRecBerryThresholdPct: 50,
    berryCudChew: false,
    berryHarvestChance: 0,
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

  it('passiveEffects が既にあるスナップショットは変更しない（冪等）', () => {
    const already = legacy({ constDmg: 12, passiveEffects: [] })
    const m = migrateProgressionSnapshot(already)
    expect(m).toBe(already)
    expect(m.passiveEffects).toEqual([])
    // 旧フィールドは移行済み扱いなのでそのまま残る
    expect(m.constDmg).toBe(12)

    const twice = migrateProgressionSnapshot(migrateProgressionSnapshot(legacy({ constDmg: 12 })))
    expect(twice.passiveEffects).toHaveLength(1)
  })

  it('旧フィールドが空なら常時効果も空になる', () => {
    const m = migrateProgressionSnapshot(legacy())
    expect(m.passiveEffects).toEqual([])
  })
})
