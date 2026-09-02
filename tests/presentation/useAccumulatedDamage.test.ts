import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { useAccumulatedDamage } from '@/presentation/hooks/useAccumulatedDamage'
import { useBattleSequence } from '@/presentation/hooks/useBattleSequence'
import { useProgressionStore, type AttackPayload } from '@/presentation/store/progressionStore'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { calculateHP } from '@/domain/calculators/StatCalculator'
import { TURN_END_ORDER, type PassiveEffect } from '@/domain/models/PassiveEffect'

/** 攻撃側 HP=100 / 防御側 HP=200 になる種族値（SP=0, Lv50, IV31 固定式） */
const ATTACKER_BASE_HP = 25
const DEFENDER_BASE_HP = 125
const ATTACKER_MAX_HP = 100
const DEFENDER_MAX_HP = 200

/** ガブリアス（実在ID）を選んだうえで HP 種族値だけテスト用に固定する */
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
  expect(calculateHP(useDefenderStore.getState().baseStats.hp, useDefenderStore.getState().sp.hp))
    .toBe(DEFENDER_MAX_HP)
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

describe('useAccumulatedDamage（攻守シミュレーションとの統合）', () => {
  afterEach(() => {
    // ストアをリセットする前にマウント済みフックを破棄する（act 警告の抑止）
    cleanup()
    useProgressionStore.getState().clear()
    useAttackerStore.getState().reset()
    useDefenderStore.getState().reset()
  })

  it('痛み分けの前に攻撃側が削られている場合、静的な「累積時HP」ではなく追跡中のHPで平均化する', () => {
    setupPokemon()
    const store = useProgressionStore.getState()
    // 攻撃側 100 → 40
    store.addEventAfter(null, { kind: 'attackerConst', amount: 60 })
    // 痛み分け。attackerHp には「攻撃側は満タン」という古い静的値が入っている（無視されるべき）
    store.addEventAfter(null, { kind: 'painSplit', attackerHp: ATTACKER_MAX_HP })
    // 追跡: floor((40 + 200) / 2) = 120 → 120ダメで確定撃破
    // 旧挙動: floor((100 + 200) / 2) = 150 → 120ダメでは残30で生存
    store.addAttack(attackPayload({ rolls: Array(16).fill(120) }))

    const accum = renderHook(() => useAccumulatedDamage(DEFENDER_MAX_HP)).result.current
    const seq = renderHook(() => useBattleSequence()).result.current

    expect(seq.showSequence).toBe(true)
    expect(seq.result).not.toBeNull()
    expect(accum.combinedProb).toBeCloseTo(1.0, 10)
    expect(accum.accumKoResult.type).toBe('guaranteed')
    // 撃破分は防御側最大HPのしきい値へ集約される（旧挙動なら 170 で止まっていた）
    expect(accum.totalMax).toBe(DEFENDER_MAX_HP)
    expect(accum.totalMin).toBe(DEFENDER_MAX_HP)
    // 累積とシミュレーションが同じ撃破率を返す
    expect(accum.combinedProb).toBeCloseTo(seq.result!.defenderKoProb, 10)
  })

  it('攻撃側に影響するイベントが無い純粋な累積では、攻撃側HP固定の計算をそのまま使う', () => {
    setupPokemon()
    // 90〜105 の16通りを2回。合計 180〜210、200以上で撃破 = 66/256
    const rolls = Array.from({ length: 16 }, (_, i) => 90 + i)
    useProgressionStore.getState().addAttack(attackPayload({ rolls, usages: 2 }))

    const accum = renderHook(() => useAccumulatedDamage(DEFENDER_MAX_HP)).result.current
    const seq = renderHook(() => useBattleSequence()).result.current

    // 与ダメイベントだけなのでシーケンス出力は出ない = 高速パス
    expect(seq.showSequence).toBe(false)
    expect(seq.result).toBeNull()
    expect(accum.totalMin).toBe(180)
    expect(accum.totalMax).toBe(DEFENDER_MAX_HP)
    expect(accum.combinedProb).toBeCloseTo(66 / 256, 10)
    expect(accum.combinedProbWithCrit).toBeCloseTo(66 / 256, 10)
  })

  it('統合パスでも急所込み撃破率を追跡中のHPで計算する', () => {
    setupPokemon()
    const store = useProgressionStore.getState()
    store.addEventAfter(null, { kind: 'attackerConst', amount: 60 })
    store.addEventAfter(null, { kind: 'painSplit', attackerHp: ATTACKER_MAX_HP })
    // 痛み分け後は両者120。通常100では残20で生存、急所130なら撃破
    store.addAttack(attackPayload({
      rolls: Array(16).fill(100),
      critRolls: Array(16).fill(130),
      critChance: 0.5,
    }))

    const accum = renderHook(() => useAccumulatedDamage(DEFENDER_MAX_HP)).result.current

    expect(accum.combinedProb).toBeCloseTo(0, 10)
    expect(accum.combinedProbWithCrit).toBeCloseTo(0.5, 10)
    // 分布は通常パス由来（残20 = 180ダメ）。急所込みは撃破率だけを別パスで求める
    expect(accum.totalMin).toBe(180)
    expect(accum.totalMax).toBe(180)
  })

  it('防御側の常時効果（1/16 ターン末・全ターン）は累積の撃破率を変える', () => {
    setupPokemon()
    const store = useProgressionStore.getState()
    // 95 ダメ ×2 = 190 で HP200 は落ちない
    store.addAttack(attackPayload({ rolls: Array(16).fill(95), usages: 2 }))

    const before = renderHook(() => useAccumulatedDamage(DEFENDER_MAX_HP)).result.current
    expect(before.combinedProb).toBeCloseTo(0, 10)
    cleanup()

    // すなあらし相当: 毎ターン末に 200/16 = 12
    const sandstorm: Omit<PassiveEffect, 'id'> = {
      side: 'defender', kind: 'damage',
      amount: { type: 'ratio', num: 1, den: 16, rounding: 'floor' },
      timing: 'turnEnd', count: 'all', startTurn: 1,
      order: TURN_END_ORDER.weather, label: 'すなあらし',
    }
    store.addPassiveEffect(sandstorm)

    const accum = renderHook(() => useAccumulatedDamage(DEFENDER_MAX_HP)).result.current
    const seq = renderHook(() => useBattleSequence()).result.current

    // 防御側だけの常時効果なので攻守シミュレーションは出さないが、計算結果は使う
    expect(seq.showSequence).toBe(false)
    expect(seq.result).not.toBeNull()
    // ターン末項目は usage の間に挟まる（与ダメ → T1末 → 与ダメ → T2末）
    expect(seq.result!.steps.map(st => st.label)).toEqual([
      '与ダメ テスト与ダメ 1/2',
      'T1末 すなあらし 防−12',
      '与ダメ テスト与ダメ 2/2',
      'T2末 すなあらし 防−12',
    ])
    // 95 → 12 → 95 で 202 ≥ 200 の確定撃破
    expect(accum.combinedProb).toBeCloseTo(1.0, 10)
    expect(accum.hasAnything).toBe(true)
  })

  it('攻撃側の常時効果は攻守シミュレーション表示条件になり、攻撃側HPを削る', () => {
    setupPokemon()
    const store = useProgressionStore.getState()
    store.addAttack(attackPayload({ rolls: Array(16).fill(50) }))
    // いのちのたま相当: 攻撃ごとに攻撃側HPの1/10（100 → 10）
    store.addPassiveEffect({
      side: 'attacker', kind: 'damage',
      amount: { type: 'ratio', num: 1, den: 10, rounding: 'floor' },
      timing: 'perAttack', count: 'all', startTurn: 1,
      order: TURN_END_ORDER.custom, label: 'いのちのたま',
    })

    const seq = renderHook(() => useBattleSequence()).result.current
    expect(seq.showSequence).toBe(true)
    expect(seq.result).not.toBeNull()
    // 攻撃 → いのちのたま の2ステップ。最終ステップの攻撃側HPは 100 - 10 = 90
    const steps = seq.result!.steps
    expect(steps).toHaveLength(2)
    expect([...steps[steps.length - 1].attackerHpDist.keys()]).toEqual([ATTACKER_MAX_HP - 10])
    expect(seq.passiveSchedule.perAttackByTurn[1]).toHaveLength(1)
  })
})
