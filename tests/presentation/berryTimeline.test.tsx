import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, renderHook, screen } from '@testing-library/react'
import { useBattleSequence, type BerryGhostItem } from '@/presentation/hooks/useBattleSequence'
import { useProgressionStore, type AttackPayload } from '@/presentation/store/progressionStore'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { calculateHP } from '@/domain/calculators/StatCalculator'
import { BerryGhostRow } from '@/presentation/components/results/BerryGhostRow'
import { berryItemText } from '@/presentation/components/results/berryGhostText'
import { DamageProgressionPanel } from '@/presentation/components/results/DamageProgressionPanel'
import { SequenceResultPanel } from '@/presentation/components/results/SequenceResultPanel'
import { runBattleSequence } from '@/domain/calculators/BattleSequenceCalc'

/** 攻撃側 HP=100 / 防御側 HP=200 になる種族値（SP=0, Lv50, IV31 固定式） */
const ATTACKER_BASE_HP = 25
const DEFENDER_BASE_HP = 125
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
  expect(calculateHP(useDefenderStore.getState().baseStats.hp, useDefenderStore.getState().sp.hp))
    .toBe(DEFENDER_MAX_HP)
}

function attackPayload(rolls: number[], usages = 1): AttackPayload {
  return {
    label: 'テスト与ダメ',
    rolls,
    rawRolls: rolls,
    usages,
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
  }
}

function attackIds(): string[] {
  return useProgressionStore.getState().events.filter(e => e.kind === 'attack').map(e => e.id)
}

describe('きのみ発動の時系列表示', () => {
  afterEach(() => {
    cleanup()
    useProgressionStore.getState().clear()
    useProgressionStore.getState().setBerry('defender', { amount: 0, thresholdPct: 50, cudChew: false, harvestChance: 0 })
    useProgressionStore.getState().setBerry('attacker', { amount: 0, thresholdPct: 50, cudChew: false, harvestChance: 0 })
    useAttackerStore.getState().reset()
    useDefenderStore.getState().reset()
  })

  it('防御側きのみ + 与ダメ2回: 2回目の与ダメに発動行が付き、showSequence は false のまま result は計算される', () => {
    setupPokemon()
    const store = useProgressionStore.getState()
    store.setBerry('defender', { amount: 50, thresholdPct: 50 })
    store.addAttack(attackPayload(Array(16).fill(60)))
    store.addAttack(attackPayload(Array(16).fill(60)))
    const [first, second] = attackIds()

    const seq = renderHook(() => useBattleSequence()).result.current
    expect(seq.showSequence).toBe(false)
    expect(seq.result).not.toBeNull()
    expect(seq.berryRowsByEventId[first]).toBeUndefined()
    const rows = seq.berryRowsByEventId[second]
    expect(rows).toHaveLength(1)
    expect(rows[0].side).toBe('defender')
    expect(rows[0].triggerProb).toBeCloseTo(1, 10)
    expect(rows[0].healExpected).toBeCloseTo(50, 10)
    expect(rows[0].amount).toBe(50)
    expect(seq.berrySummary?.defender?.expectedTriggers).toBeCloseTo(1, 10)
  })

  it('usages=2 の1イベント: 発動行はそのイベントに付き、ステップラベルは使用回数つき', () => {
    setupPokemon()
    const store = useProgressionStore.getState()
    store.setBerry('defender', { amount: 50, thresholdPct: 50 })
    store.addAttack(attackPayload(Array(16).fill(60), 2))
    const [id] = attackIds()

    const seq = renderHook(() => useBattleSequence()).result.current
    const rows = seq.berryRowsByEventId[id]
    expect(rows).toHaveLength(1)
    expect(rows[0].stepLabel).toContain('2/2')
    expect(rows[0].stepKind).toBe('attack')
  })

  it('きのみ未設定なら発動行は無く、従来どおり与ダメのみの構成では result も null', () => {
    setupPokemon()
    useProgressionStore.getState().addAttack(attackPayload(Array(16).fill(60), 2))
    const seq = renderHook(() => useBattleSequence()).result.current
    expect(seq.result).toBeNull()
    expect(seq.berryRowsByEventId).toEqual({})
    expect(seq.berrySummary).toBeUndefined()
  })

  it('DamageProgressionPanel が発動行を時系列に描画する', () => {
    setupPokemon()
    const store = useProgressionStore.getState()
    store.setBerry('defender', { amount: 50, thresholdPct: 50 })
    store.addAttack(attackPayload(Array(16).fill(60)))
    store.addAttack(attackPayload(Array(16).fill(60)))
    render(<DamageProgressionPanel defenderMaxHp={DEFENDER_MAX_HP} />)
    const row = screen.getByLabelText('きのみ発動')
    expect(row.textContent).toContain('オボン/混乱実（防御側）+50')
    expect(row.textContent).toContain('発動 100%')
  })
})

describe('BerryGhostRow', () => {
  const base: BerryGhostItem = {
    side: 'defender', stepLabel: '与ダメ X', stepKind: 'attack',
    triggerProb: 0.732, cudProb: 0, healExpected: 32.94, rearmProb: 0, amount: 45, cudChew: false,
  }

  afterEach(() => cleanup())

  it('発動確率・はんすう再回復・しゅうかく再装填を表記する', () => {
    expect(berryItemText(base)).toBe('🍒 オボン/混乱実（防御側）+45 ─ 発動 73.2%')
    expect(berryItemText({ ...base, side: 'attacker', triggerProb: 1 })).toBe('🍒 オボン/混乱実（攻撃側）+45 ─ 発動 100%')
    expect(berryItemText({ ...base, triggerProb: 1, cudProb: 1, cudChew: true }))
      .toBe('🍒 オボン/混乱実（防御側）+45 ─ はんすう再回復 100%')
    expect(berryItemText({ ...base, rearmProb: 0.5 })).toContain('しゅうかく再装填 50.0%')
    expect(berryItemText({ ...base, triggerProb: 0, rearmProb: 1, stepKind: 'rearmBerry' }))
      .toContain('リサイクル再装填 100%')
  })

  it('描画: 連続技ステップのツールチップに途中発動の注記と期待回復が入る', () => {
    render(<BerryGhostRow items={[{ ...base, stepKind: 'multiHit' }]} />)
    const row = screen.getByLabelText('きのみ発動')
    expect(row.textContent).toContain('発動 73.2%')
    const line = row.querySelector('[title*="期待回復"]')
    expect(line?.getAttribute('title')).toContain('期待回復 32.9')
    expect(line?.getAttribute('title')).toContain('（連続技の途中を含む）')
  })

  it('項目が無ければ何も描画しない', () => {
    const { container } = render(<BerryGhostRow items={[]} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('SequenceResultPanel のきのみ注記', () => {
  afterEach(() => cleanup())

  it('発動ステップにバッジ、見出しに期待発動回数・期待回復を表示する', () => {
    const r = runBattleSequence(
      // 2撃目は 60 → 55 / 65 → 60 で閾値を割らない
      [{ kind: 'attack', dmg: [40, 60] }, { kind: 'attack', dmg: [5] }],
      100, 100, { defenderBerry: { threshold: 50, amount: 25 }, labels: ['一撃目', '二撃目'] },
    )
    render(<SequenceResultPanel seqResult={r} attackerName="A" defenderName="D" />)
    expect(screen.getByText('🍒防 50%')).toBeTruthy()
    expect(screen.queryByText(/🍒攻/)).toBeNull()
    expect(screen.getByLabelText('きのみの発動統計').textContent)
      .toContain('防御側 期待発動 0.50回 / 期待回復 12.5')
  })
})
