import { describe, it, expect } from 'vitest'
import { executeDamageCalculation } from '@/application/usecases/CalculateDamageUseCase'
import { calculateStats } from '@/application/usecases/CalculateStatsUseCase'
import { createDefaultBattleField } from '@/domain/models/BattleField'
import { createSpDistribution } from '@/domain/models/StatPoints'
import type { MoveData } from '@/domain/models/Move'

describe('CalculateDamageUseCase - フルパイプライン', () => {
  /**
   * ガブリアス(いじっぱり, AS全振り) vs メガゲンガー(おくびょう, CS全振り)
   */

  const garchompInput = {
    baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 },
    types: ['ドラゴン', 'じめん'] as ['ドラゴン', 'じめん'],
    sp: createSpDistribution({ hp: 2, atk: 32, spe: 32 }),
    natureName: 'いじっぱり',
    abilityName: 'すながくれ',
    itemName: null,
    ranks: {},
    status: null as null,
    weight: 95,
  }

  const megaGengarInput = {
    baseStats: { hp: 60, atk: 65, def: 60, spa: 170, spd: 95, spe: 130 },
    types: ['ゴースト', 'どく'] as ['ゴースト', 'どく'],
    sp: createSpDistribution({ spa: 32, spe: 32 }),
    natureName: 'おくびょう',
    abilityName: 'シャドータッグ',
    itemName: null,
    ranks: {},
    status: null as null,
    weight: 40.5,
  }

  const earthquakeMove: MoveData = {
    name: 'じしん',
    nameEn: 'Earthquake',
    type: 'じめん',
    category: '物理',
    power: 100,
    accuracy: 100,
    pp: 16,
    priority: 0,
    flags: { contact: false, sound: false, bullet: false, pulse: false, punch: false, bite: false, slice: false },
    special: null,
  }

  const tackleMove: MoveData = {
    name: 'たいあたり',
    nameEn: 'Tackle',
    type: 'ノーマル',
    category: '物理',
    power: 40,
    accuracy: 100,
    pp: 20,
    priority: 0,
    flags: { contact: true, sound: false, bullet: false, pulse: false, punch: false, bite: false, slice: false },
    special: null,
  }

  it('スペック計算 - ガブリアスのHP実数値が正しい (仕様書: 184)', () => {
    const stats = calculateStats({
      baseStats: garchompInput.baseStats,
      sp: garchompInput.sp,
      natureName: garchompInput.natureName,
      ranks: garchompInput.ranks,
    })
    expect(stats.hp).toBe(184)
  })

  it('スペック計算 - ガブリアスのA実数値が正しい (仕様書: 200)', () => {
    const stats = calculateStats({
      baseStats: garchompInput.baseStats,
      sp: garchompInput.sp,
      natureName: garchompInput.natureName,
      ranks: garchompInput.ranks,
    })
    expect(stats.atk).toBe(200)
  })

  it('じしん が正のダメージを返す', () => {
    const result = executeDamageCalculation({
      attacker: garchompInput,
      defender: megaGengarInput,
      move: earthquakeMove,
      field: createDefaultBattleField(),
    })

    expect(result.min).toBeGreaterThan(0)
    expect(result.max).toBeGreaterThanOrEqual(result.min)
    expect(result.defenderMaxHp).toBeGreaterThan(0)
    expect(result.rolls).toHaveLength(16)
  })

  it('ゴーストには効かないノーマル技は0ダメージ', () => {
    const result = executeDamageCalculation({
      attacker: garchompInput,
      defender: megaGengarInput,
      move: tackleMove,
      field: createDefaultBattleField(),
    })

    expect(result.min).toBe(0)
    expect(result.max).toBe(0)
    expect(result.koResult.type).toBe('no-ko')
  })

  it('パーセント表示が正しく計算される', () => {
    const result = executeDamageCalculation({
      attacker: garchompInput,
      defender: megaGengarInput,
      move: earthquakeMove,
      field: createDefaultBattleField(),
    })

    const expectedPercent = (result.max / result.defenderMaxHp) * 100
    expect(result.percentMax).toBeCloseTo(expectedPercent, 1)
  })
})
