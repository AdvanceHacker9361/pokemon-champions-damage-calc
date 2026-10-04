import { describe, it, expect } from 'vitest'
import { executeDamageCalculation } from '@/application/usecases/CalculateDamageUseCase'
import { createDefaultBattleField } from '@/domain/models/BattleField'
import { createSpDistribution } from '@/domain/models/StatPoints'
import { MoveRepository } from '@/data/repositories/MoveRepository'
import type { MoveData } from '@/domain/models/Move'

/**
 * せいなるつるぎ・ＤＤラリアット: 相手の防御/特防ランク補正を（上昇・低下とも）無視する。
 */
describe('防御ランク無視技（ignoreDefenseStages）', () => {
  const attacker = {
    baseStats: { hp: 91, atk: 129, def: 90, spa: 72, spd: 90, spe: 108 }, // テラキオン相当
    types: ['いわ', 'かくとう'] as ['いわ', 'かくとう'],
    sp: createSpDistribution({ atk: 32, spe: 32 }),
    statNatures: { atk: 1.0, def: 1.0, spa: 1.0, spd: 1.0, spe: 1.0 },
    abilityName: 'せいぎのこころ',
    itemName: null,
    ranks: {},
    status: null as null,
    weight: 260,
  }

  const defenderBase = {
    baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 },
    types: ['ドラゴン', 'じめん'] as ['ドラゴン', 'じめん'],
    sp: createSpDistribution({ hp: 32 }),
    statNatures: { atk: 1.0, def: 1.0, spa: 1.0, spd: 1.0, spe: 1.0 },
    abilityName: 'すながくれ',
    itemName: null,
    status: null as null,
    weight: 95,
  }

  const field = createDefaultBattleField()
  const asMove = (name: string) => MoveRepository.findByName(name) as unknown as MoveData

  const run = (move: MoveData, defRank: number, isCritical = false) =>
    executeDamageCalculation({
      attacker,
      defender: { ...defenderBase, ranks: { def: defRank } },
      move,
      field,
      isCritical,
    })

  it('moves.json: せいなるつるぎ・ＤＤラリアット にフラグが付いている', () => {
    expect(MoveRepository.findByName('せいなるつるぎ')?.ignoreDefenseStages).toBe(true)
    expect(MoveRepository.findByName('ＤＤラリアット')?.ignoreDefenseStages).toBe(true)
    expect(MoveRepository.findByName('インファイト')?.ignoreDefenseStages).toBeUndefined()
  })

  it('せいなるつるぎ: 相手の B+2 / B+6 でもダメージが B±0 と同じ', () => {
    const move = asMove('せいなるつるぎ')
    const neutral = run(move, 0)
    expect(run(move, 2).rolls).toEqual(neutral.rolls)
    expect(run(move, 6).rolls).toEqual(neutral.rolls)
  })

  it('せいなるつるぎ: 相手の B-2 でもダメージは増えない（低下も無視）', () => {
    const move = asMove('せいなるつるぎ')
    expect(run(move, -2).rolls).toEqual(run(move, 0).rolls)
  })

  it('せいなるつるぎ: 急所でも B±0 基準のまま', () => {
    const move = asMove('せいなるつるぎ')
    expect(run(move, -2, true).rolls).toEqual(run(move, 0, true).rolls)
    expect(run(move, 2, true).rolls).toEqual(run(move, 0, true).rolls)
  })

  it('ＤＤラリアット: 相手の B+2 を無視する', () => {
    const move = asMove('ＤＤラリアット')
    expect(run(move, 2).rolls).toEqual(run(move, 0).rolls)
  })

  it('対照: 通常の物理技（インファイト）は B+2 でダメージが減る', () => {
    const move = asMove('インファイト')
    expect(run(move, 2).max).toBeLessThan(run(move, 0).max)
  })
})
