import { afterEach, describe, expect, it } from 'vitest'
import { useProgressionStore, hasSequenceImpact } from '@/presentation/store/progressionStore'
import { snapshotLiveState, restoreState } from '@/presentation/store/sessionSnapshot'

describe('progressionStore', () => {
  afterEach(() => {
    useProgressionStore.getState().clear()
  })

  it('HP直接補正をclearでリセットする', () => {
    const s = useProgressionStore.getState()
    s.setAttackerDirectDmg(12.9)
    s.setAttackerDirectRec(23.1)
    s.setDefenderDirectDmg(34.8)
    s.setDefenderDirectRec(45.2)

    expect(useProgressionStore.getState()).toMatchObject({
      attackerDirectDmg: 12,
      attackerDirectRec: 23,
      defenderDirectDmg: 34,
      defenderDirectRec: 45,
    })

    useProgressionStore.getState().clear()

    expect(useProgressionStore.getState()).toMatchObject({
      attackerDirectDmg: 0,
      attackerDirectRec: 0,
      defenderDirectDmg: 0,
      defenderDirectRec: 0,
    })
  })

  it('攻撃側HP直接補正が攻守シミュレーション表示条件になる', () => {
    expect(hasSequenceImpact({ events: [], attackerStartHp: null })).toBe(false)
    expect(hasSequenceImpact({ events: [], attackerStartHp: null, defenderDirectDmg: 1 })).toBe(false)
    expect(hasSequenceImpact({ events: [], attackerStartHp: null, attackerDirectDmg: 1 })).toBe(true)
    expect(hasSequenceImpact({ events: [], attackerStartHp: null, attackerDirectRec: 1 })).toBe(true)
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

  it('HP直接補正をセッションスナップショットで保存復元する', () => {
    const s = useProgressionStore.getState()
    s.setAttackerDirectDmg(10)
    s.setAttackerDirectRec(20)
    s.setDefenderDirectDmg(30)
    s.setDefenderDirectRec(40)

    const snap = snapshotLiveState()
    useProgressionStore.getState().clear()
    restoreState(snap)

    expect(useProgressionStore.getState()).toMatchObject({
      attackerDirectDmg: 10,
      attackerDirectRec: 20,
      defenderDirectDmg: 30,
      defenderDirectRec: 40,
    })
  })
})
