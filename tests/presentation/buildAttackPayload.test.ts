import { describe, expect, it } from 'vitest'
import { buildAttackPayload } from '@/presentation/components/results/buildAttackPayload'
import { VARIABLE_MULTI_HIT_DIST } from '@/domain/calculators/KoProbabilityCalc'
import { expandAttack } from '@/presentation/hooks/useAccumulatedDamage'

function buildVariablePayload(isDisguiseIntact: boolean) {
  const rolls = Array(16).fill(10)
  const critRolls = Array(16).fill(15)
  return buildAttackPayload({
    attackerName: 'テスト攻撃側',
    moveName: 'ボーンラッシュ',
    isCritical: false,
    isParentalBond: false,
    isDisguiseIntact,
    isForcedCrit: false,
    hadMultiscale: false,
    multiHit: { type: 'variable' },
    moveCritChance: 1 / 24,
    variableMultiHitDist: VARIABLE_MULTI_HIT_DIST,
    rolls,
    rawRolls: rolls,
    effectiveRolls: isDisguiseIntact ? Array(16).fill(0) : rolls,
    critRollsBase: critRolls,
    rawCritRollsBase: critRolls,
    effectiveCritRolls: isDisguiseIntact ? Array(16).fill(0) : critRolls,
    activeRawResult: undefined,
    rawCritResult: undefined,
    defenderMaxHp: 200,
  })
}

describe('buildAttackPayload', () => {
  it('ばけのかわ相手でも変動連続技の分布を保持し、残り1〜4発の範囲を保存する', () => {
    const payload = buildVariablePayload(true)

    expect(payload.variableHitDist).toEqual(VARIABLE_MULTI_HIT_DIST)
    expect(payload.firstHitNullified).toBe(true)
    expect(payload.firstHitFixedDamage).toBe(25)
    expect(payload.minDmg).toBe(35)
    expect(payload.maxDmg).toBe(65)
    expect(payload.critMin).toBe(40)
    expect(payload.critMax).toBe(85)
    expect(payload.label).toContain('(2〜5発加重)')
    expect(payload.label).toContain('+ばけのかわ')
  })

  it('通常時は初撃を含む2〜5発の範囲を維持する', () => {
    const payload = buildVariablePayload(false)

    expect(payload.firstHitNullified).toBe(false)
    expect(payload.minDmg).toBe(20)
    expect(payload.maxDmg).toBe(50)
    expect(payload.critMin).toBe(30)
    expect(payload.critMax).toBe(75)
  })

  it('加算では最初の使用だけ初撃を無効化し、2回目は通常の2〜5発へ戻す', () => {
    const payload = buildVariablePayload(true)
    const event = { kind: 'attack' as const, id: 'bone-rush', ...payload, usages: 2 }
    const expanded = expandAttack(event, true, false)

    expect(expanded.normal).toHaveLength(2)
    expect(expanded.normal[0].kind).toBe('attack')
    expect(expanded.normal[1].kind).toBe('attack')
    if (expanded.normal[0].kind !== 'attack' || expanded.normal[1].kind !== 'attack') return
    const firstDist = expanded.normal[0].dmg
    const secondDist = expanded.normal[1].dmg
    expect(firstDist).toBeInstanceOf(Map)
    expect(secondDist).toBeInstanceOf(Map)
    if (!(firstDist instanceof Map) || !(secondDist instanceof Map)) return

    expect(firstDist.get(35)).toBeCloseTo(1 / 3, 6)
    expect(firstDist.get(65)).toBeCloseTo(1 / 6, 6)
    const firstExpected = [...firstDist].reduce(
      (sum, [damage, probability]) => sum + damage * probability,
      0,
    )
    expect(firstExpected).toBeCloseTo(140 / 3, 6)
    expect(secondDist.get(20)).toBeCloseTo(1 / 3, 6)
    expect(secondDist.get(50)).toBeCloseTo(1 / 6, 6)
  })
})
