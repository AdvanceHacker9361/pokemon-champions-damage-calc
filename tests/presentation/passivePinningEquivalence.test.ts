import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { useAccumulatedDamage } from '@/presentation/hooks/useAccumulatedDamage'
import { useBattleSequence } from '@/presentation/hooks/useBattleSequence'
import { useProgressionStore, type AttackPayload } from '@/presentation/store/progressionStore'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { calculateHP } from '@/domain/calculators/StatCalculator'
import { TURN_END_ORDER, type PassiveEffect } from '@/domain/models/PassiveEffect'
import type { PassiveExpansionContext } from '@/domain/calculators/PassiveEffectExpansion'

/**
 * 「固定化」の等価性テスト。
 * 常時効果を自動展開したまま計算した結果と、固定化して手動イベント化したあとの結果が
 * 完全に一致することを確かめる（＝固定化は数値的に不可視）。
 */

const ATTACKER_BASE_HP = 25
const DEFENDER_BASE_HP = 125
const ATTACKER_MAX_HP = 100
const DEFENDER_MAX_HP = 200

function setupPokemon() {
  useAttackerStore.getState().setPokemon(445)
  useDefenderStore.getState().setPokemon(445)
  useAttackerStore.setState({
    baseStats: { hp: ATTACKER_BASE_HP, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
  })
  useDefenderStore.setState({
    baseStats: { hp: DEFENDER_BASE_HP, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
  })
  expect(calculateHP(useAttackerStore.getState().baseStats.hp, useAttackerStore.getState().sp.hp))
    .toBe(ATTACKER_MAX_HP)
}

const CTX: PassiveExpansionContext = {
  attackerMaxHp: ATTACKER_MAX_HP,
  defenderMaxHp: DEFENDER_MAX_HP,
  attackerTypes: ['ドラゴン', 'じめん'],
  defenderTypes: ['ドラゴン', 'じめん'],
}

function attackPayload(opts: {
  rolls: number[]
  critRolls?: number[]
  critChance?: number
  usages?: number
}): AttackPayload {
  const { rolls } = opts
  const critRolls = opts.critRolls ?? rolls
  return {
    label: 'テスト与ダメ',
    rolls,
    rawRolls: rolls,
    usages: opts.usages ?? 1,
    minDmg: Math.min(...rolls),
    maxDmg: Math.max(...rolls),
    rawMin: Math.min(...rolls),
    rawMax: Math.max(...rolls),
    defenderMaxHp: DEFENDER_MAX_HP,
    hadMultiscale: false,
    critRolls,
    rawCritRolls: critRolls,
    critMin: Math.min(...critRolls),
    critMax: Math.max(...critRolls),
    rawCritMin: Math.min(...critRolls),
    rawCritMax: Math.max(...critRolls),
    critChance: opts.critChance ?? 0,
    isForcedCrit: false,
  }
}

function passive(partial: Partial<Omit<PassiveEffect, 'id'>>): Omit<PassiveEffect, 'id'> {
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

interface Snapshot {
  combinedProb: number
  combinedProbWithCrit: number
  totalMin: number
  totalMax: number
  distribution: [number, number][]
  attackerFaintProb: number | null
}

/** 現在のストア状態から累積・シーケンスの数値をまとめて取得する */
function measure(): Snapshot {
  const accum = renderHook(() => useAccumulatedDamage(DEFENDER_MAX_HP)).result.current
  const seq = renderHook(() => useBattleSequence()).result.current
  const snap: Snapshot = {
    combinedProb: accum.combinedProb,
    combinedProbWithCrit: accum.combinedProbWithCrit,
    totalMin: accum.totalMin,
    totalMax: accum.totalMax,
    distribution: [...accum.distribution.entries()].sort((a, b) => a[0] - b[0]),
    attackerFaintProb: seq.result ? seq.result.attackerFaintProb : null,
  }
  cleanup()
  return snap
}

function expectSameNumbers(before: Snapshot, after: Snapshot) {
  expect(after.combinedProb).toBeCloseTo(before.combinedProb, 12)
  expect(after.combinedProbWithCrit).toBeCloseTo(before.combinedProbWithCrit, 12)
  expect(after.totalMin).toBe(before.totalMin)
  expect(after.totalMax).toBe(before.totalMax)
  expect(after.distribution.map(([d]) => d)).toEqual(before.distribution.map(([d]) => d))
  after.distribution.forEach(([, p], i) => expect(p).toBeCloseTo(before.distribution[i][1], 12))
  if (before.attackerFaintProb !== null) {
    expect(after.attackerFaintProb).not.toBeNull()
    expect(after.attackerFaintProb!).toBeCloseTo(before.attackerFaintProb, 12)
  }
}

/** 全常時効果を固定化して、前後の数値が一致することを確かめる */
function expectPinIsInvisible() {
  const before = measure()
  expect(useProgressionStore.getState().passiveEffects.length).toBeGreaterThan(0)
  useProgressionStore.getState().pinAllPassiveEffects(CTX)
  expect(useProgressionStore.getState().passiveEffects).toHaveLength(0)
  const after = measure()
  expectSameNumbers(before, after)
  return { before, after }
}

describe('固定化の等価性（常時効果 → 手動イベント）', () => {
  afterEach(() => {
    cleanup()
    useProgressionStore.getState().clear()
    useAttackerStore.getState().reset()
    useDefenderStore.getState().reset()
  })

  it('(a) すなあらし全ターン + たべのこし全ターン、与ダメ usages=3', () => {
    setupPokemon()
    const store = useProgressionStore.getState()
    store.addAttack(attackPayload({ rolls: Array.from({ length: 16 }, (_, i) => 55 + i), usages: 3 }))
    store.addPassiveEffect(passive({ label: 'すなあらし' }))
    store.addPassiveEffect(passive({
      kind: 'recover', label: 'たべのこし', order: TURN_END_ORDER.itemHeal,
    }))

    const { before } = expectPinIsInvisible()
    // 固定化しても撃破率が意味のある値であること（0/1 の縮退で「一致」しているのではない）
    expect(before.combinedProb).toBeGreaterThan(0)
    expect(before.combinedProb).toBeLessThan(1)

    // usages=3 の与ダメは 3 つの usages=1 へ分割され、各ターン末の項目が間に挟まる
    const kinds = useProgressionStore.getState().events.map(e => e.kind)
    expect(kinds).toEqual([
      'attack', 'defenderConst', 'defenderRecover',
      'attack', 'defenderConst', 'defenderRecover',
      'attack', 'defenderConst', 'defenderRecover',
    ])
    expect(useProgressionStore.getState().events.filter(e => e.kind === 'attack')
      .every(e => e.kind === 'attack' && e.usages === 1)).toBe(true)
  })

  it('(b) ステルスロック（開始時）+ もうどく count=2', () => {
    setupPokemon()
    const store = useProgressionStore.getState()
    store.addAttack(attackPayload({ rolls: Array.from({ length: 16 }, (_, i) => 65 + i), usages: 2 }))
    store.addPassiveEffect(passive({
      timing: 'start', count: 1, amount: { type: 'stealthRock' },
      label: 'ステロ', order: TURN_END_ORDER.custom,
    }))
    store.addPassiveEffect(passive({
      amount: { type: 'toxic' }, count: 2, label: 'もうどく', order: TURN_END_ORDER.poison,
    }))

    const { before } = expectPinIsInvisible()
    expect(before.combinedProb).toBeGreaterThan(0)
    expect(before.combinedProb).toBeLessThan(1)

    const events = useProgressionStore.getState().events
    expect(events[0]).toMatchObject({ kind: 'defenderConst', label: '開始時 ステロ', source: 'pinned' })
    const toxicRows = events.filter(e => e.kind === 'defenderConst' && e.label?.includes('もうどく'))
    expect(toxicRows.map(e => e.kind)).toEqual(['defenderConst', 'defenderConst'])
  })

  it('(c) 攻撃側いのちのたま（攻撃毎）+ usages=2 + 被ダメ', () => {
    setupPokemon()
    useDefenderStore.getState().setMove(0, 'じしん')
    const store = useProgressionStore.getState()
    store.addAttack(attackPayload({ rolls: Array.from({ length: 16 }, (_, i) => 50 + i), usages: 2 }))
    store.addEventAfter(null, { kind: 'incoming', moveName: 'じしん', crit: false })
    store.addPassiveEffect(passive({
      side: 'attacker', timing: 'perAttack', count: 'all',
      amount: { type: 'ratio', num: 1, den: 10, rounding: 'floor' },
      label: 'いのちのたま', order: TURN_END_ORDER.custom,
    }))

    const before = measure()
    expect(before.attackerFaintProb).not.toBeNull()
    useProgressionStore.getState().pinAllPassiveEffects(CTX)
    const after = measure()
    expectSameNumbers(before, after)

    // 攻撃側 perAttack は各 usage の直後、被ダメの後には来ない
    expect(useProgressionStore.getState().events.map(e => e.kind)).toEqual([
      'attack', 'attackerConst', 'attack', 'attackerConst', 'incoming',
    ])
  })

  it('(d) やどりぎのタネ（攻→防）', () => {
    setupPokemon()
    const store = useProgressionStore.getState()
    store.addAttack(attackPayload({ rolls: Array.from({ length: 16 }, (_, i) => 65 + i), usages: 2 }))
    store.addEventAfter(null, { kind: 'attackerConst', amount: 40 })
    store.addPassiveEffect(passive({
      kind: 'leechSeed', side: 'defender', count: 'all',
      amount: { type: 'ratio', num: 1, den: 8, rounding: 'floor' },
      label: 'やどりぎ', order: TURN_END_ORDER.leechSeed,
    }))

    const before = measure()
    expect(before.combinedProb).toBeGreaterThan(0)
    expect(before.combinedProb).toBeLessThan(1)
    useProgressionStore.getState().pinAllPassiveEffects(CTX)
    const after = measure()
    expectSameNumbers(before, after)

    const leech = useProgressionStore.getState().events.filter(e => e.kind === 'leechSeed')
    expect(leech).toHaveLength(2)
    expect(leech[0]).toMatchObject({
      kind: 'leechSeed', direction: 'fromAttacker', amount: 25, source: 'pinned',
    })
  })

  it('急所込み撃破率も分割の前後で変わらない', () => {
    setupPokemon()
    const store = useProgressionStore.getState()
    store.addAttack(attackPayload({
      rolls: Array.from({ length: 16 }, (_, i) => 40 + i),
      critRolls: Array.from({ length: 16 }, (_, i) => 60 + i),
      critChance: 0.125,
      usages: 3,
    }))
    store.addPassiveEffect(passive({ label: 'すなあらし' }))

    const { before } = expectPinIsInvisible()
    expect(before.combinedProbWithCrit).not.toBeCloseTo(before.combinedProb, 6)
  })
})
