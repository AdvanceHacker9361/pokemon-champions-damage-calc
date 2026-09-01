import { describe, expect, it } from 'vitest'
import { computeMoveDisplaySummary } from '@/presentation/hooks/computeMoveDisplaySummary'
import { calcKoProbability, VARIABLE_MULTI_HIT_DIST } from '@/domain/calculators/KoProbabilityCalc'
import { calcRollPercent, type DamageResult } from '@/domain/models/DamageResult'
import type { MultiHitData } from '@/domain/models/Move'

/** 16乱数の合成 DamageResult を作る */
function makeResult(rolls: number[], defenderMaxHp: number): DamageResult {
  expect(rolls).toHaveLength(16)
  return {
    rolls: rolls as unknown as DamageResult['rolls'],
    min: rolls[0],
    max: rolls[15],
    defenderMaxHp,
    percentMin: calcRollPercent(rolls[0], defenderMaxHp),
    percentMax: calcRollPercent(rolls[15], defenderMaxHp),
    koResult: calcKoProbability(rolls, defenderMaxHp),
  }
}

/** base から始まり 1 ずつ増える 16 要素の昇順ロール列 */
function ramp(base: number, step = 1): number[] {
  return Array.from({ length: 16 }, (_, i) => base + i * step)
}

const DEFENDER_HP = 139
const CHIP = Math.floor(DEFENDER_HP / 8) // = 17

/** トリプルアクセル型（20→40→60）の各発ロール */
const HIT1 = ramp(20)
const HIT2 = ramp(40)
const HIT3 = ramp(60)
const ESCALATING_TOTAL = HIT1.map((v, i) => v + HIT2[i] + HIT3[i]) // 120〜165

function escalatingInput(isDisguiseIntact: boolean) {
  const multiHit: MultiHitData = { type: 'escalating', powers: [20, 40, 60] }
  return {
    result: makeResult(ESCALATING_TOTAL, DEFENDER_HP),
    perHitResults: [HIT1, HIT2, HIT3].map(r => makeResult(r, DEFENDER_HP)),
    multiHit,
    isParentalBond: false,
    isDisguiseIntact,
    variableMultiHitDist: VARIABLE_MULTI_HIT_DIST,
  }
}

describe('computeMoveDisplaySummary', () => {
  it('(a) 段階威力型 × ばけのかわ: 1発目を無効化し、固定ダメ + 2・3発目で範囲とKOを出す', () => {
    const summary = computeMoveDisplaySummary(escalatingInput(true))

    // 2発目 + 3発目 = 100〜130、そこへ ばけのかわ解除時の固定ダメ 17 を加算
    expect(summary.disguiseFlatDmg).toBe(CHIP)
    expect(summary.min).toBe(100 + CHIP) // 117
    expect(summary.max).toBe(130 + CHIP) // 147
    expect(summary.displayRolls[0]).toBe(117)
    expect(summary.displayRolls[15]).toBe(147)

    // KO は素の合計ではなく実効ロールから再計算される（147 のみ HP139 に到達）
    expect(summary.koResult).toEqual(
      calcKoProbability(summary.displayRolls, DEFENDER_HP),
    )
    expect(summary.koResult).toEqual({
      type: 'chance',
      hits: 1,
      probability: 5 / 16, // 139 以上になるのは 139,141,143,145,147 の5通り
    })
  })

  it('(b) ばけのかわ非発動時は素の結果と一致する', () => {
    const input = escalatingInput(false)
    const summary = computeMoveDisplaySummary(input)

    expect(summary.disguiseFlatDmg).toBe(0)
    expect(summary.min).toBe(input.result.min) // 120
    expect(summary.max).toBe(input.result.max) // 165
    expect(summary.koResult).toEqual(input.result.koResult)
    expect(summary.displayRolls).toEqual(ESCALATING_TOTAL)
  })

  it('(a-regression) ヘッダーが素の result.max を使うと過大表示になる', () => {
    const raw = makeResult(ESCALATING_TOTAL, DEFENDER_HP)
    const summary = computeMoveDisplaySummary(escalatingInput(true))

    // 素の値: 120〜165 / 乱数1発 (2〜3発目までの合計が HP を超える確率が高い)
    expect([raw.min, raw.max]).toEqual([120, 165])
    // 実効表示: 117〜147。max が一致しないこと自体がヘッダー不整合バグの再現
    expect(summary.max).not.toBe(raw.max)
    expect([summary.min, summary.max]).toEqual([117, 147])
    expect(
      (summary.koResult as { probability: number }).probability,
    ).toBeLessThan((raw.koResult as { probability: number }).probability)
  })

  it('(c) 固定連続技は全発合計を表示する', () => {
    const rolls = ramp(30) // 30〜45
    const multiHit: MultiHitData = { type: 'fixed', count: 3 }
    const summary = computeMoveDisplaySummary({
      result: makeResult(rolls, 200),
      multiHit,
      isParentalBond: false,
      isDisguiseIntact: false,
      variableMultiHitDist: VARIABLE_MULTI_HIT_DIST,
    })

    expect(summary.displayRolls).toEqual(rolls.map(r => r * 3))
    expect(summary.min).toBe(90)
    expect(summary.max).toBe(135)
  })

  it('(c-2) 固定連続技 × ばけのかわ: 1発目無効 + 固定ダメ', () => {
    const rolls = ramp(30)
    const multiHit: MultiHitData = { type: 'fixed', count: 3 }
    const summary = computeMoveDisplaySummary({
      result: makeResult(rolls, 200),
      multiHit,
      isParentalBond: false,
      isDisguiseIntact: true,
      variableMultiHitDist: VARIABLE_MULTI_HIT_DIST,
    })

    // 残2発 + 固定ダメ floor(200/8)=25
    expect(summary.disguiseFlatDmg).toBe(25)
    expect(summary.min).toBe(30 * 2 + 25)
    expect(summary.max).toBe(45 * 2 + 25)
  })

  it('(d) おやこあいは親 + 子（素ダメの25%）を合算する', () => {
    const rolls = ramp(40) // 40〜55
    const summary = computeMoveDisplaySummary({
      result: makeResult(rolls, 200),
      multiHit: null,
      isParentalBond: true,
      isDisguiseIntact: false,
      variableMultiHitDist: VARIABLE_MULTI_HIT_DIST,
    })

    expect(summary.childRolls).toEqual(rolls.map(r => Math.floor(r * 0.25)))
    expect(summary.displayRolls).toEqual(
      rolls.map(r => r + Math.floor(r * 0.25)),
    )
    expect(summary.min).toBe(40 + 10)
    expect(summary.max).toBe(55 + 13)
    expect(summary.koResult).toEqual(
      calcKoProbability(summary.displayRolls, 200),
    )
  })

  it('(d-2) おやこあい × ばけのかわ: 親が無効化され子ダメ + 固定ダメのみ', () => {
    const rolls = ramp(40)
    const summary = computeMoveDisplaySummary({
      result: makeResult(rolls, 200),
      multiHit: null,
      isParentalBond: true,
      isDisguiseIntact: true,
      variableMultiHitDist: VARIABLE_MULTI_HIT_DIST,
    })

    expect(summary.min).toBe(Math.floor(40 * 0.25) + 25)
    expect(summary.max).toBe(Math.floor(55 * 0.25) + 25)
  })

  it('(e) 変動連続技 × ばけのかわ: 残り1〜4発の加重範囲 + 固定ダメ', () => {
    const rolls = Array(16).fill(10)
    const multiHit: MultiHitData = { type: 'variable' }
    const summary = computeMoveDisplaySummary({
      result: makeResult(rolls, 200),
      multiHit,
      isParentalBond: false,
      isDisguiseIntact: true,
      variableMultiHitDist: VARIABLE_MULTI_HIT_DIST,
    })

    expect(summary.variableSummary).not.toBeNull()
    // 1発目は固定ダメ 25 に置換され、残りは 2〜5発分布の 1〜4 発
    expect(summary.variableFirstRolls).toEqual(Array(16).fill(25))
    expect(summary.min).toBe(25 + 10 * 1)
    expect(summary.max).toBe(25 + 10 * 4)
    expect(summary.koResult).toEqual({ type: 'no-ko' })
  })

  it('(e-2) 変動連続技でばけのかわ非発動なら加重サマリを使わない', () => {
    const rolls = Array(16).fill(10)
    const multiHit: MultiHitData = { type: 'variable' }
    const result = makeResult(rolls, 200)
    const summary = computeMoveDisplaySummary({
      result,
      multiHit,
      isParentalBond: false,
      isDisguiseIntact: false,
      variableMultiHitDist: VARIABLE_MULTI_HIT_DIST,
    })

    expect(summary.variableSummary).toBeNull()
    expect(summary.min).toBe(10)
    expect(summary.max).toBe(10)
    expect(summary.koResult).toEqual(result.koResult)
  })

  it('マルチスケイル/半減実の素ダメ結果が2発目以降に使われる', () => {
    const rolls = ramp(20) // 半減された1発目
    const rawRolls = ramp(40) // 2発目以降の素ダメ
    const multiHit: MultiHitData = { type: 'fixed', count: 3 }
    const summary = computeMoveDisplaySummary({
      result: makeResult(rolls, 300),
      rawResult: makeResult(rawRolls, 300),
      multiHit,
      isParentalBond: false,
      isDisguiseIntact: false,
      variableMultiHitDist: VARIABLE_MULTI_HIT_DIST,
    })

    expect(summary.rawRolls).toEqual(rawRolls)
    expect(summary.displayRolls).toEqual(
      rolls.map((r, i) => r + rawRolls[i] * 2),
    )
    expect(summary.min).toBe(20 + 40 * 2)
    expect(summary.max).toBe(35 + 55 * 2)
  })
})
