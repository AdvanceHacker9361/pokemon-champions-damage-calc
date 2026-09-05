import { describe, it, expect } from 'vitest'
import { resolveBasePower } from '@/domain/calculators/MovePowerResolution'
import type { BasePowerContext } from '@/domain/calculators/MovePowerResolution'
import { calculateDamage } from '@/domain/calculators/DamageCalculator'
import type { DamageCalcInput } from '@/domain/calculators/DamageCalculator'
import type { ComputedStats } from '@/domain/models/Pokemon'
import type { MoveData, SpecialMoveTag } from '@/domain/models/Move'
import { createDefaultBattleField } from '@/domain/models/BattleField'

function makeStats(hp: number, atk: number, def: number, spa: number, spd: number, spe: number): ComputedStats {
  return { hp, atk, def, spa, spd, spe }
}

const attackerStats = makeStats(184, 200, 125, 101, 111, 154)
const defenderStats = makeStats(155, 79, 75, 222, 121, 200)

function makeMove(
  power: number | null,
  special: SpecialMoveTag | null,
  overrides: Partial<MoveData> = {},
): MoveData {
  return {
    name: 'テスト技',
    nameEn: 'Test Move',
    type: 'ノーマル',
    category: '物理',
    power,
    accuracy: 100,
    pp: 16,
    priority: 0,
    flags: { contact: true, sound: false, bullet: false, pulse: false, punch: false, bite: false, slice: false },
    special,
    ...overrides,
  }
}

function ctx(overrides: Partial<BasePowerContext> & Pick<BasePowerContext, 'move'>): BasePowerContext {
  return {
    attackerStats,
    defenderStats,
    weather: null,
    ...overrides,
  }
}

describe('resolveBasePower（共有の基本威力リゾルバ）', () => {
  describe('けたぐり / くさむすび（相手の体重）', () => {
    const lowKick = makeMove(1, 'low-kick')

    it('体重 95.0kg → 威力80', () => {
      expect(resolveBasePower(ctx({ move: lowKick, defenderWeight: 95.0 }))).toBe(80)
    })

    it('体重 5kg → 威力20', () => {
      expect(resolveBasePower(ctx({ move: lowKick, defenderWeight: 5 }))).toBe(20)
    })

    it('体重 250kg → 威力120', () => {
      expect(resolveBasePower(ctx({ move: lowKick, defenderWeight: 250 }))).toBe(120)
    })

    it('くさむすび も同じ体重テーブルを使う', () => {
      const grassKnot = makeMove(1, 'grass-knot')
      expect(resolveBasePower(ctx({ move: grassKnot, defenderWeight: 95.0 }))).toBe(80)
    })
  })

  describe('ヘビーボンバー（体重比）', () => {
    const heavySlam = makeMove(1, 'heavy-slam')

    function power(attackerWeight: number, defenderWeight: number): number {
      return resolveBasePower(ctx({ move: heavySlam, attackerWeight, defenderWeight }))
    }

    it('比 5倍以上 → 威力120', () => {
      expect(power(500, 100)).toBe(120)
      expect(power(501, 100)).toBe(120)
    })

    it('比 2倍以上3倍未満 → 威力60', () => {
      expect(power(200, 100)).toBe(60)
      expect(power(299, 100)).toBe(60)
    })

    it('比 2倍未満 → 威力40', () => {
      expect(power(199, 100)).toBe(40)
      expect(power(50, 100)).toBe(40)
    })
  })

  describe('ジャイロボール（S比）', () => {
    const gyroBall = makeMove(1, 'gyro-ball')

    it('自分S=50 / 相手S=200 → 威力100', () => {
      expect(resolveBasePower(ctx({
        move: gyroBall,
        attackerStats: makeStats(150, 100, 100, 100, 100, 50),
        defenderStats: makeStats(150, 100, 100, 100, 100, 200),
      }))).toBe(100)
    })

    it('威力は150で頭打ちになる', () => {
      expect(resolveBasePower(ctx({
        move: gyroBall,
        attackerStats: makeStats(150, 100, 100, 100, 100, 1),
        defenderStats: makeStats(150, 100, 100, 100, 100, 300),
      }))).toBe(150)
    })

    it('自分の方が圧倒的に速い場合でも最低威力1', () => {
      expect(resolveBasePower(ctx({
        move: gyroBall,
        attackerStats: makeStats(150, 100, 100, 100, 100, 300),
        defenderStats: makeStats(150, 100, 100, 100, 100, 1),
      }))).toBe(1)
    })
  })

  describe('つけあがる / アシストパワー（自分のランク上昇）', () => {
    it('ランク {atk:+2, spa:+1, def:-1} → 威力80（低下は無視）', () => {
      const storedPower = makeMove(20, 'stored-power')
      expect(resolveBasePower(ctx({
        move: storedPower,
        attackerRankModifiers: { atk: 2, spa: 1, def: -1 },
      }))).toBe(80)
    })

    it('ランク上昇なし → 威力20', () => {
      const storedPower = makeMove(20, 'stored-power')
      expect(resolveBasePower(ctx({ move: storedPower, attackerRankModifiers: {} }))).toBe(20)
    })
  })

  describe('からげんき（状態異常）', () => {
    const facade = makeMove(70, 'facade')

    it('やけど時 → 威力140', () => {
      expect(resolveBasePower(ctx({ move: facade, attackerStatus: 'やけど' }))).toBe(140)
    })

    it('状態異常なし → 威力70', () => {
      expect(resolveBasePower(ctx({ move: facade, attackerStatus: null }))).toBe(70)
    })
  })

  describe('ウェザーボール（天候）', () => {
    const weatherBall = makeMove(50, 'weather-ball')

    it('はれ → 威力100', () => {
      expect(resolveBasePower(ctx({ move: weatherBall, weather: 'はれ' }))).toBe(100)
    })

    it('天候なし → 威力50', () => {
      expect(resolveBasePower(ctx({ move: weatherBall, weather: null }))).toBe(50)
    })
  })

  it('特殊タグを持たない通常技は moves.json の威力をそのまま返す', () => {
    expect(resolveBasePower(ctx({ move: makeMove(90, null) }))).toBe(90)
  })

  it('威力 null の技は 0 を返す', () => {
    expect(resolveBasePower(ctx({ move: makeMove(null, null) }))).toBe(0)
  })
})

describe('calculateDamage(...).basePower は共有リゾルバと一致する', () => {
  const baseInput: Omit<DamageCalcInput, 'move'> = {
    attackerStats,
    attackerTypes: ['ドラゴン', 'じめん'],
    attackerAbility: 'すながくれ',
    attackerItem: null,
    attackerStatus: null,
    attackerRankModifiers: {},
    attackerWeight: 95,
    defenderStats,
    defenderTypes: ['ゴースト', 'どく'],
    defenderAbility: 'シャドータッグ',
    defenderItem: null,
    defenderStatus: null,
    defenderWeight: 40.5,
    field: createDefaultBattleField(),
  }

  function sharedPower(move: MoveData): number {
    return resolveBasePower({
      move,
      attackerStats: baseInput.attackerStats,
      defenderStats: baseInput.defenderStats,
      attackerWeight: baseInput.attackerWeight,
      defenderWeight: baseInput.defenderWeight,
      attackerStatus: baseInput.attackerStatus,
      attackerRankModifiers: baseInput.attackerRankModifiers,
      weather: baseInput.field.weather,
      attackerAbility: baseInput.attackerAbility,
      defenderAbility: baseInput.defenderAbility,
    })
  }

  it('けたぐり（相手体重 40.5kg → 威力60）', () => {
    const move = makeMove(1, 'low-kick', { name: 'けたぐり', type: 'かくとう' })
    const result = calculateDamage({ ...baseInput, move })
    expect(sharedPower(move)).toBe(60)
    expect(result.basePower).toBe(sharedPower(move))
  })

  it('通常技（威力そのまま）', () => {
    const move = makeMove(100, null, { name: 'じしん', type: 'じめん' })
    const result = calculateDamage({ ...baseInput, move })
    expect(result.basePower).toBe(100)
    expect(result.basePower).toBe(sharedPower(move))
  })

  it('じゅうでん等の後掛け倍率は basePower に含まれない', () => {
    const move = makeMove(90, null, { name: '10まんボルト', type: 'でんき', category: '特殊' })
    const result = calculateDamage({ ...baseInput, move, attackerChargeActive: true })
    expect(result.basePower).toBe(90)
  })
})
