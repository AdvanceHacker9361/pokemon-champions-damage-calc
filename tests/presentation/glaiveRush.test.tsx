import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, renderHook, screen } from '@testing-library/react'
import { useAccumulatedDamage } from '@/presentation/hooks/useAccumulatedDamage'
import { useBattleSequence } from '@/presentation/hooks/useBattleSequence'
import { useProgressionStore, type AttackPayload } from '@/presentation/store/progressionStore'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { snapshotLiveState, restoreState, cloneSnapshot } from '@/presentation/store/sessionSnapshot'
import { calculateHP } from '@/domain/calculators/StatCalculator'
import { DamageResultRow } from '@/presentation/components/results/DamageResultRow'
import { calcKoProbability } from '@/domain/calculators/KoProbabilityCalc'
import { calcRollPercent, type DamageResult } from '@/domain/models/DamageResult'

const GLAIVE = 'きょけんとつげき'

/** 攻撃側 HP=330 / 防御側 HP=200（Lv50・IV31・SP=0 は 種族値+75） */
const ATTACKER_BASE_HP = 255
const DEFENDER_BASE_HP = 125
const ATTACKER_MAX_HP = 330
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
  expect(calculateHP(useDefenderStore.getState().baseStats.hp, useDefenderStore.getState().sp.hp))
    .toBe(DEFENDER_MAX_HP)
}

function attackPayload(opts: {
  rolls: number[]
  moveName?: string
  usages?: number
  defenderGlaiveRush?: boolean
}): AttackPayload {
  const { rolls } = opts
  return {
    label: `テスト与ダメ ${opts.moveName ?? ''}`.trim(),
    moveName: opts.moveName,
    rolls,
    rawRolls: rolls,
    usages: opts.usages ?? 1,
    minDmg: Math.min(...rolls),
    maxDmg: Math.max(...rolls),
    rawMin: Math.min(...rolls),
    rawMax: Math.max(...rolls),
    defenderMaxHp: DEFENDER_MAX_HP,
    hadMultiscale: false,
    critRolls: rolls,
    rawCritRolls: rolls,
    critMin: Math.min(...rolls),
    critMax: Math.max(...rolls),
    rawCritMin: Math.min(...rolls),
    rawCritMax: Math.max(...rolls),
    critChance: 0,
    isForcedCrit: false,
    defenderGlaiveRush: opts.defenderGlaiveRush,
  }
}

function fill(v: number): number[] {
  return Array(16).fill(v)
}

/** HP 周辺分布の [最小HP, 最大HP] */
function hpRange(dist: Map<number, number>): [number, number] {
  const keys = Array.from(dist.keys())
  return [Math.min(...keys), Math.max(...keys)]
}

type Store = ReturnType<typeof useProgressionStore.getState>

/** イベントを組んで攻守シミュレーションを1回だけ実行する */
function runSequence(build: (store: Store) => void) {
  useProgressionStore.getState().clear()
  build(useProgressionStore.getState())
  const seq = renderHook(() => useBattleSequence()).result.current
  cleanup()
  expect(seq.result).not.toBeNull()
  return seq.result!
}

describe('きょけんとつげき: 攻守シミュレーションでの自動2倍', () => {
  afterEach(() => {
    cleanup()
    useProgressionStore.getState().clear()
    useAttackerStore.getState().reset()
    useDefenderStore.getState().reset()
  })

  it('(a) 攻撃側がきょけんとつげきを使った次の被ダメだけが2倍になる', () => {
    setupPokemon()

    // 1発目を きょけんとつげき にした場合
    const withState = runSequence(store => {
      store.addAttack(attackPayload({ rolls: fill(10), moveName: GLAIVE }))
      store.addEventAfter(null, { kind: 'incoming', moveName: 'じしん', crit: false })
      store.addAttack(attackPayload({ rolls: fill(10), moveName: 'じしん' }))
      store.addEventAfter(null, { kind: 'incoming', moveName: 'じしん', crit: false })
    })
    // 対照: 1発目を通常技にした場合
    const without = runSequence(store => {
      store.addAttack(attackPayload({ rolls: fill(10), moveName: 'じしん' }))
      store.addEventAfter(null, { kind: 'incoming', moveName: 'じしん', crit: false })
      store.addAttack(attackPayload({ rolls: fill(10), moveName: 'じしん' }))
      store.addEventAfter(null, { kind: 'incoming', moveName: 'じしん', crit: false })
    })

    expect(withState.steps).toHaveLength(4)
    expect(without.steps).toHaveLength(4)

    // 1回目の被ダメ（step index 1）
    const [wMin1, wMax1] = hpRange(withState.steps[1].attackerHpDist)
    const [bMin1, bMax1] = hpRange(without.steps[1].attackerHpDist)
    const baseDmgMin = ATTACKER_MAX_HP - bMax1
    const baseDmgMax = ATTACKER_MAX_HP - bMin1
    expect(baseDmgMin).toBeGreaterThan(0)
    expect(ATTACKER_MAX_HP - wMax1).toBe(baseDmgMin * 2)
    expect(ATTACKER_MAX_HP - wMin1).toBe(baseDmgMax * 2)

    // 2回目の被ダメ（step index 3）は攻撃側が動いた後なので2倍にならない
    const [wMin3, wMax3] = hpRange(withState.steps[3].attackerHpDist)
    expect(wMax1 - wMax3).toBe(baseDmgMin)
    expect(wMin1 - wMin3).toBe(baseDmgMax)
  })

  it('(b) 防御側がきょけんとつげきを使うと、防御側が次に動くまでの与ダメが2倍になる', () => {
    setupPokemon()

    const result = runSequence(store => {
      store.addEventAfter(null, { kind: 'incoming', moveName: GLAIVE, crit: false })
      store.addAttack(attackPayload({ rolls: fill(10), moveName: 'じしん' }))
      store.addAttack(attackPayload({ rolls: fill(10), moveName: 'じしん' }))
      store.addEventAfter(null, { kind: 'incoming', moveName: 'じしん', crit: false })
      store.addAttack(attackPayload({ rolls: fill(10), moveName: 'じしん' }))
    })

    expect(result.steps).toHaveLength(5)
    // 与ダメ 10 → 2倍で 20 ずつ削れる
    expect(hpRange(result.steps[1].defenderHpDist)).toEqual([180, 180])
    expect(hpRange(result.steps[2].defenderHpDist)).toEqual([160, 160])
    // 防御側が次に動いた（incoming）あとの与ダメは等倍に戻る
    expect(hpRange(result.steps[4].defenderHpDist)).toEqual([150, 150])
  })

  it('(c) 総合累積と攻守シミュレーションが同じ撃破率を返す（防御側きょけんとつげき）', () => {
    setupPokemon()
    const store = useProgressionStore.getState()
    store.addEventAfter(null, { kind: 'incoming', moveName: GLAIVE, crit: false })
    // 素の合計は 60×2=120（撃破できない）が、2倍なら 240 で確定撃破
    store.addAttack(attackPayload({ rolls: fill(60), moveName: 'じしん', usages: 2 }))

    const accum = renderHook(() => useAccumulatedDamage(DEFENDER_MAX_HP)).result.current
    const seq = renderHook(() => useBattleSequence()).result.current

    expect(seq.showSequence).toBe(true)
    expect(seq.result).not.toBeNull()
    expect(accum.combinedProb).toBeCloseTo(1.0, 10)
    expect(accum.combinedProb).toBeCloseTo(seq.result!.defenderKoProb, 10)
    expect(accum.combinedProbWithCrit).toBeCloseTo(seq.critResult!.defenderKoProb, 10)
  })

  it('(d) 加算時に2倍が織り込み済みのエントリは再度2倍にならない', () => {
    setupPokemon()

    const baked = runSequence(store => {
      store.addEventAfter(null, { kind: 'incoming', moveName: GLAIVE, crit: false })
      store.addAttack(attackPayload({
        rolls: fill(100), moveName: 'じしん', defenderGlaiveRush: true,
      }))
    })
    // 100 のまま（200 にならない）＝ 撃破しない
    expect(hpRange(baked.steps[1].defenderHpDist)).toEqual([100, 100])
    expect(baked.defenderKoProb).toBeCloseTo(0, 10)

    const notBaked = runSequence(store => {
      store.addEventAfter(null, { kind: 'incoming', moveName: GLAIVE, crit: false })
      store.addAttack(attackPayload({ rolls: fill(100), moveName: 'じしん' }))
    })
    // 100 → 200 で確定撃破
    expect(notBaked.defenderKoProb).toBeCloseTo(1.0, 10)
  })

  it('攻撃側パネルの手動トグルは最初の攻撃イベントまで被ダメを2倍にする', () => {
    setupPokemon()
    useAttackerStore.setState({ glaiveRushVulnerable: true })

    const toggled = runSequence(store => {
      store.addEventAfter(null, { kind: 'incoming', moveName: 'じしん', crit: false })
      store.addAttack(attackPayload({ rolls: fill(10), moveName: 'じしん' }))
      store.addEventAfter(null, { kind: 'incoming', moveName: 'じしん', crit: false })
    })

    const [min1, max1] = hpRange(toggled.steps[0].attackerHpDist)
    const [min3, max3] = hpRange(toggled.steps[2].attackerHpDist)
    const dmg1Min = ATTACKER_MAX_HP - max1
    const dmg2Min = max1 - max3
    const dmg1Max = ATTACKER_MAX_HP - min1
    const dmg2Max = min1 - min3
    expect(dmg1Min).toBe(dmg2Min * 2)
    expect(dmg1Max).toBe(dmg2Max * 2)
  })
})

describe('きょけんとつげき: ストア・スナップショット', () => {
  afterEach(() => {
    cleanup()
    useProgressionStore.getState().clear()
    useAttackerStore.getState().reset()
    useDefenderStore.getState().reset()
  })

  it('(e) スナップショットの往復で glaiveRushVulnerable が保持される', () => {
    useAttackerStore.getState().setPokemon(998)
    useDefenderStore.getState().setPokemon(998)
    useAttackerStore.getState().setGlaiveRushVulnerable(true)
    useDefenderStore.getState().setGlaiveRushVulnerable(true)

    const snap = cloneSnapshot(snapshotLiveState())
    expect(snap.attacker.glaiveRushVulnerable).toBe(true)
    expect(snap.defender.glaiveRushVulnerable).toBe(true)

    useAttackerStore.getState().setGlaiveRushVulnerable(false)
    useDefenderStore.getState().setGlaiveRushVulnerable(false)
    expect(useAttackerStore.getState().glaiveRushVulnerable).toBe(false)

    restoreState(snap)
    expect(useAttackerStore.getState().glaiveRushVulnerable).toBe(true)
    expect(useDefenderStore.getState().glaiveRushVulnerable).toBe(true)
  })

  it('ポケモンを選び直すとリセットされる', () => {
    useAttackerStore.getState().setPokemon(998)
    useAttackerStore.getState().setGlaiveRushVulnerable(true)
    useAttackerStore.getState().setPokemon(445)
    expect(useAttackerStore.getState().glaiveRushVulnerable).toBe(false)
  })
})

function makeResult(rolls: number[], defenderMaxHp: number): DamageResult {
  return {
    rolls: rolls as unknown as DamageResult['rolls'],
    min: rolls[0],
    max: rolls[rolls.length - 1],
    defenderMaxHp,
    percentMin: calcRollPercent(rolls[0], defenderMaxHp),
    percentMax: calcRollPercent(rolls[rolls.length - 1], defenderMaxHp),
    koResult: calcKoProbability(rolls, defenderMaxHp),
    basePower: 75,
  }
}

describe('きょけんとつげき: 結果行の命中率', () => {
  afterEach(() => {
    cleanup()
    useAttackerStore.getState().reset()
    useDefenderStore.getState().reset()
  })

  it('防御側がきょけんとつげき後なら命中90の技でも命中率表示が消える（必中扱い）', () => {
    useAttackerStore.getState().setPokemon(445)
    useDefenderStore.getState().setPokemon(998)

    const result = makeResult(fill(30), 200)
    const critResult = makeResult(fill(45), 200)

    // 通常は「90%命中」が表示される
    render(<DamageResultRow moveName="いわなだれ" result={result} critResult={critResult} />)
    expect(screen.getByText('90%命中')).toBeTruthy()
    cleanup()

    useDefenderStore.getState().setGlaiveRushVulnerable(true)
    render(<DamageResultRow moveName="いわなだれ" result={result} critResult={critResult} />)
    expect(screen.queryByText('90%命中')).toBeNull()
  })
})
