import { afterEach, describe, expect, it } from 'vitest'
import { useProgressionStore, hasSequenceImpact } from '@/presentation/store/progressionStore'
import { TURN_END_ORDER, type PassiveEffect } from '@/domain/models/PassiveEffect'

function passive(partial: Partial<Omit<PassiveEffect, 'id'>> = {}): Omit<PassiveEffect, 'id'> {
  return {
    side: 'defender',
    kind: 'damage',
    amount: { type: 'ratio', num: 1, den: 16, rounding: 'floor' },
    timing: 'turnEnd',
    count: 'all',
    startTurn: 1,
    order: TURN_END_ORDER.weather,
    label: 'すなあらし',
    ...partial,
  }
}

describe('progressionStore', () => {
  afterEach(() => {
    useProgressionStore.getState().clear()
  })

  it('HP補正イベントが攻守シミュレーション表示条件になる', () => {
    expect(hasSequenceImpact({ events: [], attackerStartHp: null, passiveEffects: [] })).toBe(false)
    expect(hasSequenceImpact({
      events: [{ kind: 'attackerConst', id: 'damage-1', amount: 10 }],
      attackerStartHp: null,
      passiveEffects: [],
    })).toBe(true)
    expect(hasSequenceImpact({
      events: [{ kind: 'attackerRecover', id: 'recover-1', amount: 10 }],
      attackerStartHp: null,
      passiveEffects: [],
    })).toBe(true)
  })

  it('時系列の防御側HP補正は攻守シミュレーション表示条件になる', () => {
    expect(hasSequenceImpact({
      events: [{ kind: 'defenderRecover', id: 'recover-1', amount: 95 }],
      attackerStartHp: null,
      passiveEffects: [],
    })).toBe(true)
    expect(hasSequenceImpact({
      events: [{ kind: 'defenderConst', id: 'damage-1', amount: 20 }],
      attackerStartHp: null,
      passiveEffects: [],
    })).toBe(true)
  })

  it('補助技ターンは攻守シミュレーション表示条件になる', () => {
    expect(hasSequenceImpact({
      events: [{ kind: 'setupTurn', id: 'setup-1', side: 'attacker' }],
      attackerStartHp: null,
      passiveEffects: [],
    })).toBe(true)
    expect(hasSequenceImpact({
      events: [{ kind: 'setupTurn', id: 'setup-2', side: 'defender' }],
      attackerStartHp: null,
      passiveEffects: [],
    })).toBe(true)
  })

  it('メガシンカイベントは攻守シミュレーション表示条件になる', () => {
    expect(hasSequenceImpact({
      events: [{ kind: 'megaEvolve', id: 'mega-1', side: 'attacker', megaKey: 'mega-example' }],
      attackerStartHp: null,
      passiveEffects: [],
    })).toBe(true)
    expect(hasSequenceImpact({
      events: [{ kind: 'megaEvolve', id: 'mega-2', side: 'defender', megaKey: 'mega-example' }],
      attackerStartHp: null,
      passiveEffects: [],
    })).toBe(true)
  })

  it('HP補正イベントを指定位置の直後に挿入できる', () => {
    const s = useProgressionStore.getState()
    s.addEventAfter(null, { kind: 'incoming', moveName: null, crit: false })
    const firstId = useProgressionStore.getState().events[0].id

    s.addEventAfter(firstId, { kind: 'defenderRecover', amount: 95 })
    s.addEventAfter(null, { kind: 'attackerConst', amount: 10 })

    expect(useProgressionStore.getState().events.map(e => e.kind)).toEqual([
      'incoming',
      'defenderRecover',
      'attackerConst',
    ])
  })

  it('背景プリセット由来のHP補正イベントの表示メタ情報を保持する', () => {
    const s = useProgressionStore.getState()
    s.addEventAfter(null, {
      kind: 'defenderConst',
      amount: 12,
      label: '背景 定数ダメ 12',
      source: 'background',
    })

    expect(useProgressionStore.getState().events[0]).toMatchObject({
      kind: 'defenderConst',
      amount: 12,
      label: '背景 定数ダメ 12',
      source: 'background',
    })
  })

  it('常時効果を追加・更新・削除できる', () => {
    const s = useProgressionStore.getState()
    const id = s.addPassiveEffect(passive())
    expect(useProgressionStore.getState().passiveEffects).toHaveLength(1)
    expect(useProgressionStore.getState().passiveEffects[0].id).toBe(id)

    s.updatePassiveEffect(id, { count: 3, label: 'やけど' })
    expect(useProgressionStore.getState().passiveEffects[0]).toMatchObject({ id, count: 3, label: 'やけど' })

    // id はパッチで上書きされない
    s.updatePassiveEffect(id, { label: 'のろい' } as Partial<Omit<PassiveEffect, 'id'>>)
    expect(useProgressionStore.getState().passiveEffects[0].id).toBe(id)

    s.removePassiveEffect(id)
    expect(useProgressionStore.getState().passiveEffects).toHaveLength(0)
  })

  it('clearPassiveEffects(tab) はタブに対応する種別だけ消す', () => {
    const s = useProgressionStore.getState()
    s.addPassiveEffect(passive({ kind: 'damage' }))
    s.addPassiveEffect(passive({ kind: 'leechSeed' }))
    s.addPassiveEffect(passive({ kind: 'recover' }))

    s.clearPassiveEffects('damage')
    expect(useProgressionStore.getState().passiveEffects.map(p => p.kind)).toEqual(['recover'])

    s.addPassiveEffect(passive({ kind: 'damage' }))
    s.clearPassiveEffects('recover')
    expect(useProgressionStore.getState().passiveEffects.map(p => p.kind)).toEqual(['damage'])

    s.clearPassiveEffects()
    expect(useProgressionStore.getState().passiveEffects).toHaveLength(0)
  })

  it('clear() は常時効果も消す', () => {
    const s = useProgressionStore.getState()
    s.addPassiveEffect(passive())
    s.clear()
    expect(useProgressionStore.getState().passiveEffects).toHaveLength(0)
  })

  it('攻撃側の常時効果・やどりぎは攻守シミュレーション表示条件になる', () => {
    const defenderOnly = { ...passive(), id: 'p1' }
    expect(hasSequenceImpact({ events: [], attackerStartHp: null, passiveEffects: [defenderOnly] })).toBe(false)

    const attackerSide = { ...passive({ side: 'attacker' }), id: 'p2' }
    expect(hasSequenceImpact({ events: [], attackerStartHp: null, passiveEffects: [attackerSide] })).toBe(true)

    const leech = { ...passive({ kind: 'leechSeed' }), id: 'p3' }
    expect(hasSequenceImpact({ events: [], attackerStartHp: null, passiveEffects: [leech] })).toBe(true)
  })
})
