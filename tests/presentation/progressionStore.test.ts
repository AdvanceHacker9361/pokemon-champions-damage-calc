import { afterEach, describe, expect, it } from 'vitest'
import { useProgressionStore, hasSequenceImpact } from '@/presentation/store/progressionStore'

describe('progressionStore', () => {
  afterEach(() => {
    useProgressionStore.getState().clear()
  })

  it('HP補正イベントが攻守シミュレーション表示条件になる', () => {
    expect(hasSequenceImpact({ events: [], attackerStartHp: null })).toBe(false)
    expect(hasSequenceImpact({
      events: [{ kind: 'attackerConst', id: 'damage-1', amount: 10 }],
      attackerStartHp: null,
    })).toBe(true)
    expect(hasSequenceImpact({
      events: [{ kind: 'attackerRecover', id: 'recover-1', amount: 10 }],
      attackerStartHp: null,
    })).toBe(true)
  })

  it('時系列の防御側HP補正は攻守シミュレーション表示条件になる', () => {
    expect(hasSequenceImpact({
      events: [{ kind: 'defenderRecover', id: 'recover-1', amount: 95 }],
      attackerStartHp: null,
    })).toBe(true)
    expect(hasSequenceImpact({
      events: [{ kind: 'defenderConst', id: 'damage-1', amount: 20 }],
      attackerStartHp: null,
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
})
