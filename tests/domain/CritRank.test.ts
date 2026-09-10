import { describe, it, expect } from 'vitest'
import { calcCritChance } from '@/domain/calculators/CritRank'

const base = {
  moveCritBonus: 0,
  attackerAbility: 'いかく',
  attackerItem: null as string | null,
  focusEnergyActive: false,
}

describe('calcCritChance', () => {
  it('補正なしはランク0（1/24）', () => {
    expect(calcCritChance(base)).toBeCloseTo(1 / 24)
  })

  it('ピントレンズ / するどいツメ はランク+1（1/8）', () => {
    expect(calcCritChance({ ...base, attackerItem: 'ピントレンズ' })).toBeCloseTo(1 / 8)
    expect(calcCritChance({ ...base, attackerItem: 'するどいツメ' })).toBeCloseTo(1 / 8)
  })

  it('ながねぎ + カモネギ系 はランク+2（1/2）', () => {
    for (const name of ['カモネギ', 'ガラルカモネギ', 'ネギガナイト']) {
      expect(calcCritChance({
        ...base, attackerItem: 'ながねぎ', attackerPokemonName: name,
      })).toBeCloseTo(1 / 2)
    }
  })

  it('ながねぎ でも対象外の種族なら補正なし', () => {
    expect(calcCritChance({
      ...base, attackerItem: 'ながねぎ', attackerPokemonName: 'ピカチュウ',
    })).toBeCloseTo(1 / 24)
    expect(calcCritChance({ ...base, attackerItem: 'ながねぎ' })).toBeCloseTo(1 / 24)
    expect(calcCritChance({
      ...base, attackerItem: 'ながねぎ', attackerPokemonName: null,
    })).toBeCloseTo(1 / 24)
  })

  it('種族名だけでアイテムを持っていなければ補正なし', () => {
    expect(calcCritChance({ ...base, attackerPokemonName: 'ネギガナイト' })).toBeCloseTo(1 / 24)
  })

  it('ながねぎ + 高急所技 はランク3（確定急所）', () => {
    expect(calcCritChance({
      ...base, moveCritBonus: 1, attackerItem: 'ながねぎ', attackerPokemonName: 'ネギガナイト',
    })).toBe(1)
  })

  it('きあいだめ・きょううん との併用が従来どおり累積する', () => {
    expect(calcCritChance({ ...base, focusEnergyActive: true })).toBeCloseTo(1 / 2)
    expect(calcCritChance({ ...base, attackerAbility: 'きょううん' })).toBeCloseTo(1 / 8)
    expect(calcCritChance({
      ...base, attackerAbility: 'きょううん', focusEnergyActive: true,
    })).toBe(1)
  })
})
