import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { useAccumulatedDamage } from '@/presentation/hooks/useAccumulatedDamage'
import { useBattleSequence } from '@/presentation/hooks/useBattleSequence'
import { useProgressionStore, type AttackPayload } from '@/presentation/store/progressionStore'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { calculateHP } from '@/domain/calculators/StatCalculator'
import { findPassivePreset, type PassiveEffect } from '@/domain/models/PassiveEffect'
import type { PassiveExpansionContext } from '@/domain/calculators/PassiveEffectExpansion'
import { DamageProgressionPanel } from '@/presentation/components/results/DamageProgressionPanel'
import { PassiveDamageTab } from '@/presentation/components/results/PassiveDamageTab'

/**
 * パネル状態（持ち物・状態異常・特性）から導出される常時効果が、
 * 「ダメージ進行」（総合累積・攻守シミュレーション）へ自動で乗ることの検証。
 */

const ATTACKER_MAX_HP = 100
const DEFENDER_MAX_HP = 200

function setupPokemon() {
  useAttackerStore.getState().setPokemon(445)
  useDefenderStore.getState().setPokemon(445)
  useAttackerStore.setState({
    baseStats: { hp: 25, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
    effectiveAbility: 'なし', itemName: null, status: null,
  })
  useDefenderStore.setState({
    baseStats: { hp: 125, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
    effectiveAbility: 'なし', itemName: null, status: null,
  })
  expect(calculateHP(25, useAttackerStore.getState().sp.hp)).toBe(ATTACKER_MAX_HP)
  expect(calculateHP(125, useDefenderStore.getState().sp.hp)).toBe(DEFENDER_MAX_HP)
}

const CTX: PassiveExpansionContext = {
  attackerMaxHp: ATTACKER_MAX_HP,
  defenderMaxHp: DEFENDER_MAX_HP,
  attackerTypes: ['ドラゴン', 'じめん'],
  defenderTypes: ['ドラゴン', 'じめん'],
}

const ROLLS = Array.from({ length: 16 }, (_, i) => 50 + i)

function attackPayload(usages: number, rolls: number[] = ROLLS): AttackPayload {
  return {
    label: 'テスト与ダメ',
    rolls,
    rawRolls: rolls,
    usages,
    minDmg: rolls[0],
    maxDmg: rolls[15],
    rawMin: rolls[0],
    rawMax: rolls[15],
    defenderMaxHp: DEFENDER_MAX_HP,
    hadMultiscale: false,
    critRolls: rolls,
    rawCritRolls: rolls,
    critMin: rolls[0],
    critMax: rolls[15],
    rawCritMin: rolls[0],
    rawCritMax: rolls[15],
    critChance: 0,
    isForcedCrit: false,
  }
}

/** カタログ行と同じ形の手動効果 */
function manualPreset(presetKey: string, side: PassiveEffect['side']): Omit<PassiveEffect, 'id'> {
  const p = findPassivePreset(presetKey)!
  return {
    side, kind: p.kind, amount: { ...p.amount }, timing: p.timing,
    count: 'all', startTurn: 1, order: p.order, presetKey, label: p.short,
  }
}

function runSeq() {
  const r = renderHook(() => useBattleSequence()).result.current
  cleanup()
  return r
}

function runAccum() {
  const r = renderHook(() => useAccumulatedDamage(DEFENDER_MAX_HP)).result.current
  cleanup()
  return r
}

/** 比較用に結果を素の値へ落とす */
function seqNumbers(r: ReturnType<typeof runSeq>) {
  if (!r.result) return null
  return {
    attackerFaintProb: r.result.attackerFaintProb,
    defenderKoProb: r.result.defenderKoProb,
    steps: r.result.steps.map(s => ({
      a: [...s.attackerHpDist.entries()].sort((x, y) => x[0] - y[0]),
      d: [...s.defenderHpDist.entries()].sort((x, y) => x[0] - y[0]),
      ko: s.koProb, faint: s.faintProb,
    })),
  }
}

function accumNumbers(r: ReturnType<typeof runAccum>) {
  return {
    combinedProb: r.combinedProb,
    combinedProbWithCrit: r.combinedProbWithCrit,
    totalMin: r.totalMin,
    totalMax: r.totalMax,
    distribution: [...r.distribution.entries()].sort((a, b) => a[0] - b[0]),
  }
}

function autoLabels(r: ReturnType<typeof runSeq>): string[] {
  return r.resolved.filter(x => x.auto).map(x => x.label)
}

afterEach(() => {
  cleanup()
  useProgressionStore.getState().clear()
  useAttackerStore.getState().reset()
  useDefenderStore.getState().reset()
})

describe('持ち物・状態異常からの常時効果の自動適用', () => {
  it('(a) 攻撃側いのちのたま + 与ダメ×2 → 攻守シミュレーション表示・自動行2つ・手動いのちのたまと同じ数値', () => {
    setupPokemon()
    useProgressionStore.getState().addAttack(attackPayload(2))
    useAttackerStore.getState().setItem('いのちのたま')

    const implied = runSeq()
    expect(implied.showSequence).toBe(true)
    const labels = autoLabels(implied)
    expect(labels).toEqual([
      'T1攻撃後 いのちのたま（持ち物） 攻−10',
      'T2攻撃後 いのちのたま（持ち物） 攻−10',
    ])
    // 攻撃側 HP は 100 → 80
    const last = implied.result!.steps[implied.result!.steps.length - 1]
    expect([...last.attackerHpDist.keys()]).toEqual([80])

    // 同じ構成を「持ち物なし + 手動いのちのたま」で計算した結果と完全一致
    useAttackerStore.getState().setItem(null)
    useProgressionStore.getState().addPassiveEffect(manualPreset('lifeOrb', 'attacker'))
    const manual = runSeq()
    expect(seqNumbers(implied)).toEqual(seqNumbers(manual))

    // 反動で倒れるケース（開始HP 15 → 5 → 瀕死）も一致
    useProgressionStore.getState().setAttackerStartHp(15)
    const manualLethal = runSeq()
    useProgressionStore.getState().clearPassiveEffects()
    useAttackerStore.getState().setItem('いのちのたま')
    const impliedLethal = runSeq()
    expect(impliedLethal.result!.attackerFaintProb).toBe(1)
    expect(seqNumbers(impliedLethal)).toEqual(seqNumbers(manualLethal))
  })

  it('(b) 手動のいのちのたまが既にあれば導出分は重複しない', () => {
    setupPokemon()
    useProgressionStore.getState().addAttack(attackPayload(2))
    useProgressionStore.getState().addPassiveEffect(manualPreset('lifeOrb', 'attacker'))
    const manualOnly = runSeq()

    useAttackerStore.getState().setItem('いのちのたま')
    const both = runSeq()
    expect(autoLabels(both)).toEqual([
      'T1攻撃後 いのちのたま 攻−10',
      'T2攻撃後 いのちのたま 攻−10',
    ])
    expect(seqNumbers(both)).toEqual(seqNumbers(manualOnly))
    expect(accumNumbers(runAccum())).toEqual((() => {
      useAttackerStore.getState().setItem(null)
      return accumNumbers(runAccum())
    })())
  })

  it('(c) 防御側やけど + 与ダメ×2 → 総合累積が 2×floor(HP/16) 増え、手動やけどと一致', () => {
    setupPokemon()
    useProgressionStore.getState().addAttack(attackPayload(2))
    const plain = accumNumbers(runAccum())

    useDefenderStore.getState().setStatus('やけど')
    const burned = accumNumbers(runAccum())
    const tick = Math.floor(DEFENDER_MAX_HP / 16)
    expect(burned.totalMin).toBe(plain.totalMin + 2 * tick)
    expect(burned.totalMax).toBe(plain.totalMax + 2 * tick)
    // 防御側だけの効果なので攻守シミュレーションは出さない
    expect(runSeq().showSequence).toBe(false)

    useDefenderStore.getState().setStatus(null)
    useProgressionStore.getState().addPassiveEffect(manualPreset('burn', 'defender'))
    expect(accumNumbers(runAccum())).toEqual(burned)
  })

  it('(d) 防御側いのちのたま: 与ダメだけなら何も起きず、被ダメイベントの後に適用される', () => {
    setupPokemon()
    useProgressionStore.getState().addAttack(attackPayload(2))
    const plain = accumNumbers(runAccum())

    useDefenderStore.getState().setItem('いのちのたま')
    const attackOnly = runSeq()
    expect(autoLabels(attackOnly)).toEqual([])
    expect(attackOnly.showSequence).toBe(false)
    expect(accumNumbers(runAccum())).toEqual(plain)

    useDefenderStore.getState().setMove(0, 'じしん')
    useProgressionStore.getState().addEventAfter(null, { kind: 'incoming', moveName: 'じしん', crit: false })
    const withIncoming = runSeq()
    const idx = withIncoming.resolved.findIndex(x => x.event.kind === 'incoming')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(withIncoming.resolved[idx + 1]).toMatchObject({
      auto: true, label: 'T2攻撃後 いのちのたま（持ち物） 防−20',
    })
  })

  it('(e) マジックガードの攻撃側がいのちのたまを持っても自動行は出ない', () => {
    setupPokemon()
    useProgressionStore.getState().addAttack(attackPayload(2))
    useAttackerStore.setState({ itemName: 'いのちのたま', effectiveAbility: 'マジックガード' })
    const r = runSeq()
    expect(autoLabels(r)).toEqual([])
    expect(r.showSequence).toBe(false)
  })

  it('(f) 導出効果があってもすべて固定化で数値は変わらず、導出分は自動行のまま残る', () => {
    setupPokemon()
    useProgressionStore.getState().addAttack(attackPayload(3, Array.from({ length: 16 }, (_, i) => 40 + i)))
    useAttackerStore.getState().setItem('いのちのたま')
    useDefenderStore.getState().setStatus('やけど')
    useProgressionStore.getState().addPassiveEffect(manualPreset('sandstorm', 'defender'))

    const seqBefore = seqNumbers(runSeq())
    const accumBefore = accumNumbers(runAccum())
    expect(accumBefore.combinedProb).toBeGreaterThan(0)
    expect(accumBefore.combinedProb).toBeLessThan(1)

    useProgressionStore.getState().pinAllPassiveEffects(CTX)
    expect(useProgressionStore.getState().passiveEffects).toHaveLength(0)
    // 手動のすなあらしだけが固定化され、与ダメは usages=1 ×3 へ分割される
    expect(useProgressionStore.getState().events.map(e => e.kind)).toEqual([
      'attack', 'defenderConst', 'attack', 'defenderConst', 'attack', 'defenderConst',
    ])

    const after = runSeq()
    expect(seqNumbers(after)).toEqual(seqBefore)
    expect(accumNumbers(runAccum())).toEqual(accumBefore)
    const labels = autoLabels(after)
    expect(labels.filter(l => l.includes('いのちのたま（持ち物）'))).toHaveLength(3)
    expect(labels.filter(l => l.includes('やけど（状態異常）'))).toHaveLength(3)

    // 手動効果が無くなったので、もう一度押しても何も起きない
    expect(useProgressionStore.getState().pinAllPassiveEffects(CTX)).toEqual([])
  })
})

describe('導出効果の UI 表示', () => {
  it('ゴースト行に「（持ち物）」付きで表示し、導出分だけの行には固定化ボタンを出さない', () => {
    setupPokemon()
    useProgressionStore.getState().addAttack(attackPayload(1))
    useAttackerStore.getState().setItem('いのちのたま')
    render(<DamageProgressionPanel defenderMaxHp={DEFENDER_MAX_HP} />)
    const ghost = screen.getByLabelText('自動適用')
    expect(ghost.textContent).toContain('いのちのたま（持ち物） 攻−10')
    expect(within(ghost).queryByRole('button', { name: '固定化' })).toBeNull()
    expect(screen.queryByRole('button', { name: /すべて固定化/ })).toBeNull()
  })

  it('カタログ行は「自動（持ち物）」バッジを出し、回数ステッパーを出さない', () => {
    setupPokemon()
    useAttackerStore.getState().setItem('いのちのたま')
    useDefenderStore.getState().setStatus('やけど')
    render(<PassiveDamageTab defenderMaxHp={DEFENDER_MAX_HP} attackerMaxHp={ATTACKER_MAX_HP} />)

    // 既定の対象は防御側: やけどが自動
    expect(screen.getByTestId('passive-row-burn-auto').textContent).toBe('自動（状態異常）')
    expect(within(screen.getByTestId('passive-row-burn')).queryByRole('button', { name: /回数を増やす/ })).toBeNull()
    expect(screen.queryByTestId('passive-row-lifeOrb-auto')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '攻撃側' }))
    expect(screen.getByTestId('passive-row-lifeOrb-auto').textContent).toBe('自動（持ち物）')
    expect(useProgressionStore.getState().passiveEffects).toHaveLength(0)
  })
})
