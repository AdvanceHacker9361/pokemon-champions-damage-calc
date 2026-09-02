import { describe, expect, it } from 'vitest'
import {
  INSERT_EVENT_ACTIONS,
  INSERT_EVENT_GROUPS,
  INSERT_EVENT_GROUP_LABELS,
  findInsertEventAction,
  type InsertEventCtx,
} from '@/presentation/components/results/eventInsertActions'

const BOTH_MEGA: InsertEventCtx = { attackerCanMega: true, defenderCanMega: true }
const NO_MEGA: InsertEventCtx = { attackerCanMega: false, defenderCanMega: false }

describe('EventInsertMenu catalog', () => {
  it('groups: ターン進行 と 手動HP補正 の2種のみ', () => {
    expect(INSERT_EVENT_GROUPS).toEqual(['turn', 'manual'])
    expect(INSERT_EVENT_GROUP_LABELS.turn).toBe('ターン進行')
    expect(INSERT_EVENT_GROUP_LABELS.manual).toBe('手動HP補正')
  })

  it('ターン進行グループに規定の7アクションが揃っている', () => {
    const turnKeys = INSERT_EVENT_ACTIONS.filter(a => a.group === 'turn').map(a => a.key)
    expect(turnKeys).toEqual([
      'incoming',
      'painSplit',
      'setupTurn-attacker',
      'setupTurn-defender',
      'megaEvolve-attacker',
      'megaEvolve-defender',
      'rearmBerry',
    ])
  })

  it('手動HP補正グループに規定の4アクションが揃っている', () => {
    const manualKeys = INSERT_EVENT_ACTIONS.filter(a => a.group === 'manual').map(a => a.key)
    expect(manualKeys).toEqual([
      'defenderConst',
      'defenderRecover',
      'attackerConst',
      'attackerRecover',
    ])
  })

  it('宿り木 (leechSeed) はカタログに含まれない（V3.18.0でカタログ方式へ移行のため撤去）', () => {
    const hasLeechSeed = INSERT_EVENT_ACTIONS.some(a =>
      a.key.toLowerCase().includes('leech') || a.label.includes('宿り木')
    )
    expect(hasLeechSeed).toBe(false)
  })

  it('全アクションの key が一意', () => {
    const keys = INSERT_EVENT_ACTIONS.map(a => a.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('findInsertEventAction はキーで引ける／未知キーは undefined', () => {
    expect(findInsertEventAction('painSplit')?.label).toBe('＋痛み分け')
    expect(findInsertEventAction('does-not-exist')).toBeUndefined()
  })
})

describe('disabled(ctx) ルール', () => {
  it('メガ以外のアクションは attackerCanMega/defenderCanMega に関わらず常に有効', () => {
    const nonMega = INSERT_EVENT_ACTIONS.filter(a => !a.key.startsWith('megaEvolve'))
    for (const action of nonMega) {
      expect(action.disabled(BOTH_MEGA)).toBe(false)
      expect(action.disabled(NO_MEGA)).toBe(false)
    }
  })

  it('攻撃側メガは attackerCanMega のみを見る', () => {
    const action = findInsertEventAction('megaEvolve-attacker')!
    expect(action.disabled({ attackerCanMega: true, defenderCanMega: false })).toBe(false)
    expect(action.disabled({ attackerCanMega: false, defenderCanMega: true })).toBe(true)
  })

  it('防御側メガは defenderCanMega のみを見る', () => {
    const action = findInsertEventAction('megaEvolve-defender')!
    expect(action.disabled({ attackerCanMega: false, defenderCanMega: true })).toBe(false)
    expect(action.disabled({ attackerCanMega: true, defenderCanMega: false })).toBe(true)
  })

  it('両側メガ可なら両方有効、両側メガ不可なら両方無効', () => {
    const attackerMega = findInsertEventAction('megaEvolve-attacker')!
    const defenderMega = findInsertEventAction('megaEvolve-defender')!
    expect(attackerMega.disabled(BOTH_MEGA)).toBe(false)
    expect(defenderMega.disabled(BOTH_MEGA)).toBe(false)
    expect(attackerMega.disabled(NO_MEGA)).toBe(true)
    expect(defenderMega.disabled(NO_MEGA)).toBe(true)
  })
})

describe('dispatch 種別の整合性', () => {
  it('setupTurn-* は setupTurn ディスパッチかつ side が key と一致', () => {
    const attacker = findInsertEventAction('setupTurn-attacker')!
    const defender = findInsertEventAction('setupTurn-defender')!
    expect(attacker.dispatch).toEqual({ type: 'setupTurn', side: 'attacker' })
    expect(defender.dispatch).toEqual({ type: 'setupTurn', side: 'defender' })
  })

  it('megaEvolve-* は megaEvolve ディスパッチかつ side が key と一致', () => {
    const attacker = findInsertEventAction('megaEvolve-attacker')!
    const defender = findInsertEventAction('megaEvolve-defender')!
    expect(attacker.dispatch).toEqual({ type: 'megaEvolve', side: 'attacker' })
    expect(defender.dispatch).toEqual({ type: 'megaEvolve', side: 'defender' })
  })

  it('残りは event ディスパッチで kind が key と一致', () => {
    for (const key of ['incoming', 'painSplit', 'rearmBerry', 'defenderConst', 'defenderRecover', 'attackerConst', 'attackerRecover']) {
      const action = findInsertEventAction(key)!
      expect(action.dispatch).toEqual({ type: 'event', kind: key })
    }
  })
})
