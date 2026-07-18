import { describe, expect, it } from 'vitest'
import {
  calculateMoveResults,
  type MoveSelectionState,
} from '@/application/usecases/CalculateMoveResultsUseCase'
import type { PokemonBattleState } from '@/application/usecases/CalculateDamageUseCase'
import { createDefaultBattleField } from '@/domain/models/BattleField'
import { createSpDistribution } from '@/domain/models/StatPoints'
import type { TypeName } from '@/domain/models/Pokemon'

const neutralNatures = { atk: 1.0, def: 1.0, spa: 1.0, spd: 1.0, spe: 1.0 }

function createAttacker(moves: MoveSelectionState['moves']): MoveSelectionState {
  return {
    baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 },
    types: ['ドラゴン', 'じめん'] as TypeName[],
    sp: createSpDistribution({ hp: 2, atk: 32, spe: 32 }),
    statNatures: neutralNatures,
    abilityName: 'すながくれ',
    itemName: null,
    ranks: {},
    status: null,
    weight: 95,
    moves,
    movePowers: [null, null, null, null],
  }
}

const defender: PokemonBattleState = {
  baseStats: { hp: 60, atk: 65, def: 60, spa: 170, spd: 95, spe: 130 },
  types: ['ゴースト', 'どく'] as TypeName[],
  sp: createSpDistribution({ spa: 32, spe: 32 }),
  statNatures: neutralNatures,
  abilityName: 'シャドータッグ',
  itemName: null,
  ranks: {},
  status: null,
  weight: 40.5,
}

describe('CalculateMoveResultsUseCase', () => {
  it('selected damaging moves are calculated from repository data', () => {
    const results = calculateMoveResults({
      attacker: createAttacker(['じしん', null, null, null]),
      defender,
      field: createDefaultBattleField(),
    })

    expect(results).toHaveLength(1)
    expect(results[0].moveName).toBe('じしん')
    expect(results[0].result.rolls).toHaveLength(16)
    expect(results[0].result.min).toBeGreaterThan(0)
  })

  it('empty and unknown move slots are ignored', () => {
    const results = calculateMoveResults({
      attacker: createAttacker(['じしん', null, 'missing-move', null]),
      defender,
      field: createDefaultBattleField(),
    })

    expect(results.map(result => result.moveName)).toEqual(['じしん'])
  })

  it('repository move data activates Sheer Force for Thunder Punch', () => {
    const normal = calculateMoveResults({
      attacker: createAttacker(['かみなりパンチ', null, null, null]),
      defender,
      field: createDefaultBattleField(),
    })[0].result
    const sheerForce = calculateMoveResults({
      attacker: {
        ...createAttacker(['かみなりパンチ', null, null, null]),
        abilityName: 'ちからずく',
      },
      defender,
      field: createDefaultBattleField(),
    })[0].result

    expect(sheerForce.max).toBeGreaterThan(normal.max)
  })

  it('Iron Fist boosts Thunder Punch but not Poison Jab', () => {
    const normalThunderPunch = calculateMoveResults({
      attacker: createAttacker(['かみなりパンチ', null, null, null]),
      defender,
      field: createDefaultBattleField(),
    })[0].result
    const ironFistThunderPunch = calculateMoveResults({
      attacker: {
        ...createAttacker(['かみなりパンチ', null, null, null]),
        abilityName: 'てつのこぶし',
      },
      defender,
      field: createDefaultBattleField(),
    })[0].result
    const normalPoisonJab = calculateMoveResults({
      attacker: createAttacker(['どくづき', null, null, null]),
      defender,
      field: createDefaultBattleField(),
    })[0].result
    const ironFistPoisonJab = calculateMoveResults({
      attacker: {
        ...createAttacker(['どくづき', null, null, null]),
        abilityName: 'てつのこぶし',
      },
      defender,
      field: createDefaultBattleField(),
    })[0].result

    expect(ironFistThunderPunch.max).toBeGreaterThan(normalThunderPunch.max)
    expect(Array.from(ironFistPoisonJab.rolls)).toEqual(Array.from(normalPoisonJab.rolls))
  })

  it('Guts boosts poisoned physical attacks and ignores the burn penalty', () => {
    const gutsAttacker = {
      ...createAttacker(['じしん', null, null, null]),
      abilityName: 'こんじょう',
    }
    const normal = calculateMoveResults({
      attacker: gutsAttacker,
      defender,
      field: createDefaultBattleField(),
    })[0].result
    const poisoned = calculateMoveResults({
      attacker: { ...gutsAttacker, status: 'どく' as const },
      defender,
      field: createDefaultBattleField(),
    })[0].result
    const burned = calculateMoveResults({
      attacker: { ...gutsAttacker, status: 'やけど' as const },
      defender,
      field: createDefaultBattleField(),
    })[0].result

    expect(poisoned.max).toBeGreaterThan(normal.max)
    expect(Array.from(burned.rolls)).toEqual(Array.from(poisoned.rolls))
  })
})
