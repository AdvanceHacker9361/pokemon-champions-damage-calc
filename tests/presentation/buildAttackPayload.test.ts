import { describe, expect, it } from 'vitest'
import { buildAttackPayload } from '@/presentation/components/results/buildAttackPayload'
import { VARIABLE_MULTI_HIT_DIST } from '@/domain/calculators/KoProbabilityCalc'
import { expandAttack } from '@/presentation/hooks/useAccumulatedDamage'
import { collapseMultiHitDist, runBattleSequence } from '@/domain/calculators/BattleSequenceCalc'
import { expandAttackEvent } from '@/presentation/hooks/expandAttackEvent'

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
    expect(expanded.normal[0].kind).toBe('multiHit')
    expect(expanded.normal[1].kind).toBe('multiHit')
    if (expanded.normal[0].kind !== 'multiHit' || expanded.normal[1].kind !== 'multiHit') return
    // ヒット別イベントを（途中介入なしで）1使用分の合計分布へ畳み込んで旧表現と比較する
    const firstDist = collapseMultiHitDist(expanded.normal[0].hits, expanded.normal[0].hitCountDist)
    const secondDist = collapseMultiHitDist(expanded.normal[1].hits, expanded.normal[1].hitCountDist)

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

// ---------------------------------------------------------------------------
// ヒット別ロール（perHitRolls）と multiHit 展開
// ---------------------------------------------------------------------------

const r16 = (base: number, step = 1) => Array.from({ length: 16 }, (_, i) => base + i * step)

function basePayloadParams(over: Partial<Parameters<typeof buildAttackPayload>[0]>) {
  const rolls = r16(10)
  const crit = r16(15)
  return buildAttackPayload({
    attackerName: 'テスト攻撃側',
    moveName: 'テスト技',
    isCritical: false,
    isParentalBond: false,
    isDisguiseIntact: false,
    isForcedCrit: false,
    hadMultiscale: false,
    multiHit: null,
    moveCritChance: 1 / 24,
    variableMultiHitDist: VARIABLE_MULTI_HIT_DIST,
    rolls,
    rawRolls: rolls,
    effectiveRolls: rolls,
    critRollsBase: crit,
    rawCritRollsBase: crit,
    effectiveCritRolls: crit,
    activeRawResult: undefined,
    rawCritResult: undefined,
    defenderMaxHp: 200,
    ...over,
  })
}

const expandParams = {
  mode: 'accumFixedAttacker' as const,
  isFirstOverall: true,
  firstHadMultiscale: false,
}

describe('buildAttackPayload: ヒット別ロール', () => {
  it('段階威力型: perHitResults から3発分のロールを保存する', () => {
    const hits = [r16(5), r16(10), r16(15)]
    const critHits = [r16(8), r16(15), r16(22)]
    const sum = hits[0].map((_, i) => hits[0][i] + hits[1][i] + hits[2][i])
    const payload = basePayloadParams({
      moveName: 'トリプルアクセル',
      multiHit: { type: 'escalating', powers: [20, 40, 60] },
      effectiveRolls: sum,
      perHitRolls: hits,
      critPerHitRolls: critHits,
    })
    expect(payload.perHitRolls).toHaveLength(3)
    expect(payload.perHitRolls?.[0][0]).toBe(5)
    expect(payload.perHitRolls?.[1][0]).toBe(10)
    expect(payload.perHitRolls?.[2][0]).toBe(15)
    expect(payload.perHitCritRolls?.[2][0]).toBe(22)
    expect(payload.usages).toBe(1)
    expect(payload.minDmg).toBe(sum[0])
  })

  it('固定多段: 既定の使用回数は1、perHitRolls はヒット数ぶん、表示は合計', () => {
    const rolls = r16(10)
    const sum = rolls.map(r => r * 2)
    const payload = basePayloadParams({
      moveName: 'ドラゴンアロー',
      multiHit: { type: 'fixed', count: 2 },
      rolls,
      rawRolls: rolls,
      effectiveRolls: sum,
      effectiveCritRolls: r16(15).map(r => r * 2),
    })
    expect(payload.usages).toBe(1)
    expect(payload.perHitRolls).toHaveLength(2)
    expect(payload.perHitRolls?.[1]).toEqual(rolls)
    expect(payload.minDmg).toBe(20)
    expect(payload.maxDmg).toBe(50)
    expect(payload.rolls).toEqual(sum)
    expect(payload.label).toContain('(2発)')
  })

  it('固定多段 + くだけるよろい: 2発目以降は段階別ロールを使う', () => {
    const wa = [r16(10), r16(13), r16(16)]
    const payload = basePayloadParams({
      multiHit: { type: 'fixed', count: 3 },
      rolls: wa[0],
      rawRolls: wa[1],
      effectiveRolls: wa[0].map((_, i) => wa[0][i] + wa[1][i] + wa[2][i]),
      activeRawResult: { rolls: wa[1] } as never,
      weakArmorPerHitRolls: wa,
    })
    expect(payload.perHitRolls).toEqual(wa)
    // 2回目以降の使用: 1発目は素ダメ版
    expect(payload.perHitRawRolls?.[0]).toEqual(wa[1])
    expect(payload.perHitRawRolls?.[2]).toEqual(wa[2])
  })

  it('変動連続技: 2発目以降は素ダメ、3発目以降は段階別ロールがあればそれを使う', () => {
    const plain = buildVariablePayload(false)
    expect(plain.perHitRolls).toHaveLength(5)
    expect(plain.perHitRolls?.[4]).toEqual(Array(16).fill(10))

    const byHit = [r16(30), r16(40), r16(50)]
    const payload = basePayloadParams({
      multiHit: { type: 'variable' },
      rawRolls: r16(20),
      activeRawResult: { rolls: r16(20) } as never,
      weakArmorVariableRawRollsByHit: byHit,
    })
    expect(payload.perHitRolls).toEqual([r16(10), r16(20), ...byHit])
    expect(payload.perHitRawRolls?.[0]).toEqual(r16(20))
  })

  it('おやこあい: [親, 子] のヒット別ロールを持つ（pb* も互換のため保持）', () => {
    const payload = basePayloadParams({ isParentalBond: true, rawRolls: r16(20) })
    expect(payload.perHitRolls).toHaveLength(2)
    expect(payload.perHitRolls?.[0]).toEqual(r16(10))
    expect(payload.perHitRolls?.[1]).toEqual(r16(20).map(r => Math.floor(r * 0.25)))
    expect(payload.pbChildRolls).toEqual(payload.perHitRolls?.[1])
  })
})

describe('expandAttackEvent: multiHit', () => {
  it('連続技は使用ごとに1つの multiHit を出し、急所パスも同じ個数になる', () => {
    const payload = basePayloadParams({ isParentalBond: true })
    const ev = { kind: 'attack' as const, id: 'pb', ...payload, usages: 3 }
    const { normal, crit } = expandAttackEvent(ev, expandParams)
    expect(normal).toHaveLength(3)
    expect(crit).toHaveLength(3)
    for (const s of [...normal, ...crit]) {
      expect(s.kind).toBe('multiHit')
      if (s.kind === 'multiHit') {
        expect(s.hits).toHaveLength(2)
        expect(s.noTurnBoundary).toBeUndefined()
      }
    }
  })

  it('急所パスは各ヒットで独立に急所混合する', () => {
    const payload = basePayloadParams({ multiHit: { type: 'fixed', count: 2 } })
    const ev = { kind: 'attack' as const, id: 'dd', ...payload }
    const { crit } = expandAttackEvent(ev, expandParams)
    expect(crit[0].kind).toBe('multiHit')
    if (crit[0].kind !== 'multiHit') return
    for (const h of crit[0].hits) {
      expect(h).toBeInstanceOf(Map)
      if (!(h instanceof Map)) continue
      // 急所ロール（15〜30）の質量 = 1/24
      let critMass = 0
      for (const [d, p] of h) if (d > 25) critMass += p
      expect(critMass).toBeGreaterThan(0)
      expect([...h.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9)
    }
  })

  it('旧データ（per-hit 配列なしの単発技）は従来どおり attack を出す', () => {
    const payload = basePayloadParams({})
    expect(payload.perHitRolls).toBeUndefined()
    const ev = { kind: 'attack' as const, id: 'x', ...payload, usages: 2 }
    const { normal, crit } = expandAttackEvent(ev, expandParams)
    expect(normal.map(s => s.kind)).toEqual(['attack', 'attack'])
    expect(crit.map(s => s.kind)).toEqual(['attack', 'attack'])
  })

  it('旧データのおやこあい（pb* のみ）も multiHit [親, 子] へ展開する', () => {
    const payload = basePayloadParams({ isParentalBond: true })
    const legacy = { kind: 'attack' as const, id: 'old', ...payload, perHitRolls: undefined,
      perHitRawRolls: undefined, perHitCritRolls: undefined, perHitRawCritRolls: undefined }
    const { normal, crit } = expandAttackEvent(legacy, expandParams)
    expect(normal).toHaveLength(1)
    expect(crit).toHaveLength(1)
    expect(normal[0].kind).toBe('multiHit')
    if (normal[0].kind === 'multiHit') expect(normal[0].hits[1]).toEqual(payload.pbChildRolls)
  })

  it('固定多段 + ばけのかわ: 最初の使用だけ1発目が固定ダメに置換され、2回目は全弾当たる', () => {
    const rolls = r16(10)
    const payload = basePayloadParams({
      multiHit: { type: 'fixed', count: 2 },
      isDisguiseIntact: true,
      rolls,
      effectiveRolls: rolls,
    })
    expect(payload.firstHitNullified).toBe(true)
    expect(payload.firstHitFixedDamage).toBe(25)
    const ev = { kind: 'attack' as const, id: 'dd', ...payload, usages: 2 }
    const { normal } = expandAttackEvent(ev, expandParams)
    if (normal[0].kind !== 'multiHit' || normal[1].kind !== 'multiHit') throw new Error('multiHit expected')
    expect(normal[0].hits[0]).toEqual([25])
    expect(normal[0].hits[1]).toEqual(rolls)
    expect(normal[1].hits[0]).toEqual(rolls)
  })

  it('end-to-end: 固定多段の途中でオボンが発動する', () => {
    // 1発40固定 × 3発、HP100、オボン(≤50で+25) → 5 残し
    const rolls = Array(16).fill(40)
    const payload = basePayloadParams({
      multiHit: { type: 'fixed', count: 3 },
      rolls, rawRolls: rolls, effectiveRolls: rolls.map(r => r * 3),
      critRollsBase: rolls, rawCritRollsBase: rolls, effectiveCritRolls: rolls.map(r => r * 3),
      defenderMaxHp: 100,
    })
    const ev = { kind: 'attack' as const, id: 'f3', ...payload }
    const { normal } = expandAttackEvent(ev, expandParams)
    const r = runBattleSequence(normal, 1, 100, { defenderBerry: { threshold: 50, amount: 25 } })
    expect(r.defenderKoProb).toBe(0)
    expect(r.steps[0].defenderHpDist.get(5)).toBeCloseTo(1, 9)
  })
})
