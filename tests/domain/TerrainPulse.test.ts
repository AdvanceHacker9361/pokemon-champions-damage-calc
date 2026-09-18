import { describe, it, expect } from 'vitest'
import { calculateDamage } from '@/domain/calculators/DamageCalculator'
import type { DamageCalcInput } from '@/domain/calculators/DamageCalculator'
import {
  resolveAttackerGrounded,
  resolveTerrainPulseType,
  resolveWeatherAwareMoveType,
} from '@/domain/calculators/MoveResolution'
import type { ComputedStats, TerrainField, TypeName } from '@/domain/models/Pokemon'
import type { MoveData } from '@/domain/models/Move'
import { createDefaultBattleField } from '@/domain/models/BattleField'

function makeStats(hp: number, atk: number, def: number, spa: number, spd: number, spe: number): ComputedStats {
  return { hp, atk, def, spa, spd, spe }
}

const attackerStats = makeStats(155, 79, 75, 222, 121, 200)
const defenderStats = makeStats(184, 200, 125, 101, 111, 154)

/** だいちのはどう相当（ノーマル/特殊/威力50/はどう）。special タグの有無だけ差し替えられる */
function makeMove(
  name: string,
  type: TypeName,
  power: number,
  special: MoveData['special'] = null,
): MoveData {
  return {
    name,
    nameEn: name,
    type,
    category: '特殊',
    power,
    accuracy: 100,
    pp: 12,
    priority: 0,
    flags: { contact: false, sound: false, bullet: false, pulse: true, punch: false, bite: false, slice: false },
    special,
  }
}

const terrainPulse = makeMove('だいちのはどう', 'ノーマル', 50, 'terrain-pulse')

/** フィールド → だいちのはどうが変化するタイプ */
const TERRAIN_TYPES: [TerrainField, TypeName][] = [
  ['エレキ', 'でんき'],
  ['グラス', 'くさ'],
  ['サイコ', 'エスパー'],
  ['ミスト', 'フェアリー'],
]

const baseInput: Omit<DamageCalcInput, 'move'> = {
  attackerStats,
  // でんき/くさ/エスパー/フェアリー/ノーマル いずれとも一致しない＝STABの影響を受けないタイプ
  attackerTypes: ['みず'],
  attackerAbility: 'ふゆうせい',
  attackerItem: null,
  attackerStatus: null,
  attackerRankModifiers: {},
  attackerWeight: 40.5,
  defenderStats,
  // すべての比較タイプが等倍になる防御側
  defenderTypes: ['ノーマル'],
  defenderAbility: 'てんのめぐみ',
  defenderItem: null,
  defenderStatus: null,
  defenderWeight: 95,
  field: createDefaultBattleField(),
}

function rolls(input: DamageCalcInput): number[] {
  return Array.from(calculateDamage(input).rolls)
}

describe('だいちのはどう（Terrain Pulse）', () => {
  describe('タイプ解決', () => {
    it.each(TERRAIN_TYPES)('%s フィールド中（接地）はタイプが %s になる', (terrain, expected) => {
      expect(resolveWeatherAwareMoveType({
        moveType: 'ノーマル',
        moveSpecial: 'terrain-pulse',
        weather: null,
        terrain,
      })).toBe(expected)
      expect(resolveTerrainPulseType(terrain)).toBe(expected)
    })

    it('フィールドなしでは ノーマル のまま', () => {
      expect(resolveWeatherAwareMoveType({
        moveType: 'ノーマル',
        moveSpecial: 'terrain-pulse',
        weather: null,
        terrain: null,
      })).toBe('ノーマル')
      expect(resolveTerrainPulseType(null)).toBeNull()
    })

    it('使用者が接地していない場合はフィールドがあっても ノーマル のまま', () => {
      expect(resolveWeatherAwareMoveType({
        moveType: 'ノーマル',
        moveSpecial: 'terrain-pulse',
        weather: null,
        terrain: 'エレキ',
        attackerGrounded: false,
      })).toBe('ノーマル')
    })
  })

  describe('接地判定', () => {
    it('通常のポケモンは接地している', () => {
      expect(resolveAttackerGrounded({ types: ['みず'], ability: 'げきりゅう', item: null })).toBe(true)
    })

    it('ひこうタイプ / ふゆう系特性 / ふうせん所持 は接地していない', () => {
      expect(resolveAttackerGrounded({ types: ['でんき', 'ひこう'] })).toBe(false)
      expect(resolveAttackerGrounded({ types: ['エスパー'], ability: 'ふゆう' })).toBe(false)
      expect(resolveAttackerGrounded({ types: ['でんき'], ability: 'うなぎのぼり' })).toBe(false)
      expect(resolveAttackerGrounded({ types: ['ほのお'], item: 'ふうせん' })).toBe(false)
    })

    it('じゅうりょく中は浮いていても接地扱い', () => {
      expect(resolveAttackerGrounded({ types: ['ひこう'], ability: 'ふゆう', item: 'ふうせん', isGravity: true }))
        .toBe(true)
    })
  })

  describe('エンジン: フィールド中はタイプ変化 + 威力2倍（フィールド補正込み）', () => {
    it.each(TERRAIN_TYPES)(
      '%s フィールド中は 威力100 の %s 特殊技と完全に同じ16ロールになる',
      (terrain, expectedType) => {
        const field = { ...createDefaultBattleField(), terrain }
        const actual = rolls({ ...baseInput, field, move: terrainPulse })
        const reference = rolls({
          ...baseInput,
          field,
          move: makeMove('比較用', expectedType, 100),
        })
        expect(actual).toEqual(reference)
      },
    )

    it('フィールドなしでは 威力50 の ノーマル特殊技と同じ', () => {
      const actual = rolls({ ...baseInput, move: terrainPulse })
      const reference = rolls({ ...baseInput, move: makeMove('比較用', 'ノーマル', 50) })
      expect(actual).toEqual(reference)
    })

    it('エレキフィールドの ×1.3 補正が乗っている（フィールドなしの威力100より強い）', () => {
      const boosted = rolls({
        ...baseInput,
        field: { ...createDefaultBattleField(), terrain: 'エレキ' },
        move: terrainPulse,
      })
      const plain = rolls({ ...baseInput, move: makeMove('比較用', 'でんき', 100) })
      expect(boosted[15]).toBeGreaterThan(plain[15])
    })

    it('ミストフィールドではフェアリーになるがフィールドの威力補正はない', () => {
      const inMisty = rolls({
        ...baseInput,
        field: { ...createDefaultBattleField(), terrain: 'ミスト' },
        move: terrainPulse,
      })
      const plainNoTerrain = rolls({ ...baseInput, move: makeMove('比較用', 'フェアリー', 100) })
      expect(inMisty).toEqual(plainNoTerrain)
    })

    it('basePower がフィールドの有無で 100 / 50 に切り替わる', () => {
      expect(calculateDamage({
        ...baseInput,
        field: { ...createDefaultBattleField(), terrain: 'グラス' },
        move: terrainPulse,
      }).basePower).toBe(100)
      expect(calculateDamage({ ...baseInput, move: terrainPulse }).basePower).toBe(50)
    })
  })

  describe('接地していない使用者', () => {
    const inElectric = { ...createDefaultBattleField(), terrain: 'エレキ' as const }
    const normal50 = makeMove('比較用', 'ノーマル', 50)

    it('ひこうタイプの使用者はフィールド中でも ノーマル威力50 のまま', () => {
      const flying = { ...baseInput, attackerTypes: ['ひこう'] as TypeName[] }
      expect(rolls({ ...flying, field: inElectric, move: terrainPulse }))
        .toEqual(rolls({ ...flying, field: inElectric, move: normal50 }))
    })

    it('ふゆうの使用者はフィールド中でも ノーマル威力50 のまま', () => {
      const levitate = { ...baseInput, attackerAbility: 'ふゆう' }
      expect(rolls({ ...levitate, field: inElectric, move: terrainPulse }))
        .toEqual(rolls({ ...levitate, field: inElectric, move: normal50 }))
    })

    it('ふうせん所持の使用者はフィールド中でも ノーマル威力50 のまま', () => {
      const balloon = { ...baseInput, attackerItem: 'ふうせん' }
      expect(rolls({ ...balloon, field: inElectric, move: terrainPulse }))
        .toEqual(rolls({ ...balloon, field: inElectric, move: normal50 }))
    })

    it('じゅうりょく中はひこうタイプの使用者でも発動する', () => {
      const gravityField = { ...inElectric, isGravity: true }
      const flying = { ...baseInput, attackerTypes: ['ひこう'] as TypeName[] }
      expect(rolls({ ...flying, field: gravityField, move: terrainPulse }))
        .toEqual(rolls({ ...flying, field: gravityField, move: makeMove('比較用', 'でんき', 100) }))
      expect(calculateDamage({ ...flying, field: gravityField, move: terrainPulse }).basePower).toBe(100)
    })
  })

  describe('スキン特性との関係', () => {
    const skinInput = { ...baseInput, attackerAbility: 'フェアリースキン' }

    it('フィールドなしでは従来どおりスキンが変換し ×1.2 も乗る', () => {
      expect(resolveWeatherAwareMoveType({
        moveType: 'ノーマル',
        moveSpecial: 'terrain-pulse',
        weather: null,
        terrain: null,
        attackerAbility: 'フェアリースキン',
      })).toBe('フェアリー')

      // special タグだけを外した同一の技（＝従来の挙動）と完全に一致する
      expect(rolls({ ...skinInput, move: terrainPulse }))
        .toEqual(rolls({ ...skinInput, move: makeMove('比較用', 'ノーマル', 50) }))
    })

    it('フィールド中はフィールドのタイプが優先され、スキンの ×1.2 は乗らない', () => {
      const field = { ...createDefaultBattleField(), terrain: 'エレキ' as const }
      expect(resolveWeatherAwareMoveType({
        moveType: 'ノーマル',
        moveSpecial: 'terrain-pulse',
        weather: null,
        terrain: 'エレキ',
        attackerAbility: 'フェアリースキン',
      })).toBe('でんき')

      // でんき技（スキン対象外）とまったく同じ = ×1.2 が乗っていない
      expect(rolls({ ...skinInput, field, move: terrainPulse }))
        .toEqual(rolls({ ...skinInput, field, move: makeMove('比較用', 'でんき', 100) }))
    })
  })

  describe('メガランチャー（はどうフラグ）', () => {
    const launcher = { ...baseInput, attackerAbility: 'メガランチャー' }
    const field = { ...createDefaultBattleField(), terrain: 'エレキ' as const }

    it('フィールド中でも はどう技の ×1.5 が乗る', () => {
      const withLauncher = rolls({ ...launcher, field, move: terrainPulse })
      const withoutLauncher = rolls({ ...baseInput, field, move: terrainPulse })
      expect(withLauncher[15]).toBeGreaterThan(withoutLauncher[15])
      // 威力100のでんき はどう技 + メガランチャー と完全一致
      expect(withLauncher)
        .toEqual(rolls({ ...launcher, field, move: makeMove('比較用', 'でんき', 100) }))
    })
  })
})

describe('だいちのはどう: くろいてっきゅう所持者の接地', () => {
  it('ひこう / ふゆう系でも くろいてっきゅう を持てば接地扱いになる', () => {
    expect(resolveAttackerGrounded({ types: ['でんき', 'ひこう'], item: 'くろいてっきゅう' })).toBe(true)
    expect(resolveAttackerGrounded({ types: ['エスパー'], ability: 'ふゆう', item: 'くろいてっきゅう' })).toBe(true)
  })
})
