import { describe, it, expect } from 'vitest'
import { calculateDamage } from '@/domain/calculators/DamageCalculator'
import type { DamageCalcInput } from '@/domain/calculators/DamageCalculator'

const foulPlayMove = {
  name: 'イカサマ', nameEn: 'Foul Play',
  type: 'あく' as const, category: '物理' as const, power: 95, accuracy: 100, pp: 16 as const, priority: 0,
  flags: { contact: true, sound: false, bullet: false, pulse: false, punch: false, bite: false, slice: false },
  special: 'foul-play' as const,
}
const field = { weather: null, terrain: null, isReflect: false, isLightScreen: false, isAuroraVeil: false, isTrickRoom: false }

describe('イカサマ', () => {
  it('防御側のAを参照する（攻撃側のAではない）', () => {
    const base: Omit<DamageCalcInput, 'attackerStats' | 'defenderStats'> = {
      attackerTypes: ['あく'], attackerAbility: '', attackerItem: null,
      attackerStatus: null, attackerRankModifiers: {}, attackerWeight: 50,
      defenderTypes: ['ノーマル'], defenderAbility: '', defenderItem: null,
      defenderStatus: null, move: foulPlayMove, field,
    }
    // Case1: 攻撃側A=200, 防御側A=50 → 防御側Aを参照するなら小ダメージ
    const r1 = calculateDamage({
      ...base,
      attackerStats: { hp: 184, atk: 200, def: 125, spa: 101, spd: 111, spe: 154 },
      defenderStats:  { hp: 155, atk: 50,  def: 75,  spa: 222, spd: 121, spe: 200 },
    })
    // Case2: 攻撃側A=50, 防御側A=200 → 防御側Aを参照するなら大ダメージ
    const r2 = calculateDamage({
      ...base,
      attackerStats: { hp: 184, atk: 50,  def: 125, spa: 101, spd: 111, spe: 154 },
      defenderStats:  { hp: 155, atk: 200, def: 75,  spa: 222, spd: 121, spe: 200 },
    })
    // 防御側A=200のCase2の方がダメージが大きいはず
    expect(r2.max).toBeGreaterThan(r1.max)
    // おおよそ4倍の差になるはず (200/50=4)
    expect(r2.max).toBeGreaterThanOrEqual(r1.max * 3.5)
  })
})
