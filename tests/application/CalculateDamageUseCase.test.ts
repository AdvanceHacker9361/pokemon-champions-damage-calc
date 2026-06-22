import { describe, it, expect } from 'vitest'
import { executeDamageCalculation } from '@/application/usecases/CalculateDamageUseCase'
import { calculateStats } from '@/application/usecases/CalculateStatsUseCase'
import { createDefaultBattleField } from '@/domain/models/BattleField'
import { createSpDistribution } from '@/domain/models/StatPoints'
import type { MoveData } from '@/domain/models/Move'

describe('CalculateDamageUseCase - フルパイプライン', () => {
  /**
   * ガブリアス(いじっぱり相当 A↑C↓, AS全振り) vs メガゲンガー(おくびょう相当 S↑A↓, CS全振り)
   * statNatures で性格を表現 (いじっぱり=A:1.1,C:0.9 / おくびょう=S:1.1,A:0.9)
   */

  const garchompInput = {
    baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 },
    types: ['ドラゴン', 'じめん'] as ['ドラゴン', 'じめん'],
    sp: createSpDistribution({ hp: 2, atk: 32, spe: 32 }),
    statNatures: { atk: 1.1, def: 1.0, spa: 0.9, spd: 1.0, spe: 1.0 }, // いじっぱり
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
    statNatures: { atk: 0.9, def: 1.0, spa: 1.0, spd: 1.0, spe: 1.1 }, // おくびょう
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

  const shadowBallMove: MoveData = {
    name: 'シャドーボール',
    nameEn: 'Shadow Ball',
    type: 'ゴースト',
    category: '特殊',
    power: 80,
    accuracy: 100,
    pp: 16,
    priority: 0,
    flags: { contact: false, sound: false, bullet: true, pulse: false, punch: false, bite: false, slice: false },
    special: null,
  }

  it('スペック計算 - ガブリアスのHP実数値が正しい (sp=2: 185)', () => {
    const stats = calculateStats({
      baseStats: garchompInput.baseStats,
      sp: garchompInput.sp,
      statNatures: garchompInput.statNatures,
      ranks: garchompInput.ranks,
    })
    expect(stats.hp).toBe(185)
  })

  it('スペック計算 - ガブリアスのA実数値が正しい (いじっぱり sp=32: 200)', () => {
    const stats = calculateStats({
      baseStats: garchompInput.baseStats,
      sp: garchompInput.sp,
      statNatures: garchompInput.statNatures,
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

  it('急所時は防御側のBランク上昇を無視する', () => {
    const boostedDefender = {
      ...megaGengarInput,
      ranks: { def: 2 },
    }

    const normalBoosted = executeDamageCalculation({
      attacker: garchompInput,
      defender: boostedDefender,
      move: earthquakeMove,
      field: createDefaultBattleField(),
    })
    const normalUnboosted = executeDamageCalculation({
      attacker: garchompInput,
      defender: megaGengarInput,
      move: earthquakeMove,
      field: createDefaultBattleField(),
    })
    const critBoosted = executeDamageCalculation({
      attacker: garchompInput,
      defender: boostedDefender,
      move: earthquakeMove,
      field: createDefaultBattleField(),
      isCritical: true,
    })
    const critUnboosted = executeDamageCalculation({
      attacker: garchompInput,
      defender: megaGengarInput,
      move: earthquakeMove,
      field: createDefaultBattleField(),
      isCritical: true,
    })

    expect(normalBoosted.max).toBeLessThan(normalUnboosted.max)
    expect(critBoosted.rolls).toEqual(critUnboosted.rolls)
  })

  it('急所時は防御側のDランク上昇を無視する', () => {
    const boostedDefender = {
      ...megaGengarInput,
      ranks: { spd: 2 },
    }

    const normalBoosted = executeDamageCalculation({
      attacker: garchompInput,
      defender: boostedDefender,
      move: shadowBallMove,
      field: createDefaultBattleField(),
    })
    const normalUnboosted = executeDamageCalculation({
      attacker: garchompInput,
      defender: megaGengarInput,
      move: shadowBallMove,
      field: createDefaultBattleField(),
    })
    const critBoosted = executeDamageCalculation({
      attacker: garchompInput,
      defender: boostedDefender,
      move: shadowBallMove,
      field: createDefaultBattleField(),
      isCritical: true,
    })
    const critUnboosted = executeDamageCalculation({
      attacker: garchompInput,
      defender: megaGengarInput,
      move: shadowBallMove,
      field: createDefaultBattleField(),
      isCritical: true,
    })

    expect(normalBoosted.max).toBeLessThan(normalUnboosted.max)
    expect(critBoosted.rolls).toEqual(critUnboosted.rolls)
  })

  it('急所時も防御側の防御ランク低下は維持する', () => {
    const loweredDefender = {
      ...megaGengarInput,
      ranks: { def: -2 },
    }

    const critLowered = executeDamageCalculation({
      attacker: garchompInput,
      defender: loweredDefender,
      move: earthquakeMove,
      field: createDefaultBattleField(),
      isCritical: true,
    })
    const critUnboosted = executeDamageCalculation({
      attacker: garchompInput,
      defender: megaGengarInput,
      move: earthquakeMove,
      field: createDefaultBattleField(),
      isCritical: true,
    })

    expect(critLowered.max).toBeGreaterThan(critUnboosted.max)
  })

  it('急所無効特性の場合は防御側のBランク上昇を無視しない', () => {
    const shellArmorDefender = {
      ...megaGengarInput,
      abilityName: 'シェルアーマー',
      ranks: { def: 2 },
    }

    const normal = executeDamageCalculation({
      attacker: garchompInput,
      defender: shellArmorDefender,
      move: earthquakeMove,
      field: createDefaultBattleField(),
    })
    const blockedCrit = executeDamageCalculation({
      attacker: garchompInput,
      defender: shellArmorDefender,
      move: earthquakeMove,
      field: createDefaultBattleField(),
      isCritical: true,
    })

    expect(blockedCrit.rolls).toEqual(normal.rolls)
  })
})
