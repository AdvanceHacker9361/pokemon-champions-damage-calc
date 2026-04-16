import { describe, it, expect } from 'vitest'
import { calculateDamage } from '@/domain/calculators/DamageCalculator'
import type { DamageCalcInput } from '@/domain/calculators/DamageCalculator'
import type { ComputedStats } from '@/domain/models/Pokemon'
import type { MoveData } from '@/domain/models/Move'
import { createDefaultBattleField } from '@/domain/models/BattleField'

function makeStats(hp: number, atk: number, def: number, spa: number, spd: number, spe: number): ComputedStats {
  return { hp, atk, def, spa, spd, spe }
}

function makePhysicalMove(name: string, type: string, power: number): MoveData {
  return {
    name,
    nameEn: name,
    type: type as MoveData['type'],
    category: '物理',
    power,
    accuracy: 100,
    pp: 16,
    priority: 0,
    flags: { contact: true, sound: false, bullet: false, pulse: false, punch: false, bite: false, slice: false },
    special: null,
  }
}

function makeSpecialMove(name: string, type: string, power: number): MoveData {
  return {
    name,
    nameEn: name,
    type: type as MoveData['type'],
    category: '特殊',
    power,
    accuracy: 100,
    pp: 16,
    priority: 0,
    flags: { contact: false, sound: false, bullet: false, pulse: false, punch: false, bite: false, slice: false },
    special: null,
  }
}

// テスト用の基本入力（ガブリアスのスペック相当）
const garchompStats = makeStats(184, 200, 125, 101, 111, 154) // いじっぱりAS想定
const gengárStats = makeStats(155, 79, 75, 222, 121, 200)    // メガゲンガーCS想定

const baseInput: Omit<DamageCalcInput, 'move'> = {
  attackerStats: garchompStats,
  attackerTypes: ['ドラゴン', 'じめん'],
  attackerAbility: 'すながくれ',
  attackerItem: null,
  attackerStatus: null,
  attackerRankModifiers: {},
  attackerWeight: 95,
  defenderStats: gengárStats,
  defenderTypes: ['ゴースト', 'どく'],
  defenderAbility: 'シャドータッグ',
  defenderItem: null,
  defenderStatus: null,
  defenderWeight: 40.5,
  field: createDefaultBattleField(),
}

describe('DamageCalculator', () => {
  describe('基本ダメージ計算', () => {
    it('物理技が正のダメージを返す', () => {
      const move = makePhysicalMove('じしん', 'じめん', 100)
      const result = calculateDamage({ ...baseInput, move })
      expect(result.min).toBeGreaterThan(0)
      expect(result.max).toBeGreaterThanOrEqual(result.min)
    })

    it('特殊技が正のダメージを返す', () => {
      const move = makeSpecialMove('りゅうせいぐん', 'ドラゴン', 130)
      const result = calculateDamage({ ...baseInput, move })
      expect(result.min).toBeGreaterThan(0)
    })

    it('Champions仕様: 15段階の乱数ロールを返す（86〜100、85は出現しない）', () => {
      const move = makePhysicalMove('じしん', 'じめん', 100)
      const result = calculateDamage({ ...baseInput, move })
      expect(result.rolls).toHaveLength(15)
      // ロールは昇順
      for (let i = 1; i < 15; i++) {
        expect(result.rolls[i]).toBeGreaterThanOrEqual(result.rolls[i - 1])
      }
    })

    it('defenderMaxHp が防御側HPと一致', () => {
      const move = makePhysicalMove('じしん', 'じめん', 100)
      const result = calculateDamage({ ...baseInput, move })
      expect(result.defenderMaxHp).toBe(gengárStats.hp)
    })
  })

  // ── Champions仕様の乱数15段階 検証テスト ──────────────────────────────
  // 参照: https://saburoh326.hatenablog.com/entry/2026/04/15/220949
  describe('Champions乱数仕様 検証', () => {
    it('検証1: ガブリアス ドラゴンクロー → ラウドボーン (STAB一致、15段階ロール)', () => {
      // 攻撃側: ガブリアス A=182 (無補正32振り)
      // 防御側: ラウドボーン B=120 (無補正無振り)
      // 技: ドラゴンクロー 威力80 タイプ一致
      // 期待: [70,70,72,72,73,75,75,76,76,78,78,79,79,81,82]（85乱数は出現しない）
      const attacker = makeStats(184, 182, 125, 101, 111, 154)
      const defender = makeStats(185, 70, 120, 70, 70, 70)
      const move = makePhysicalMove('ドラゴンクロー', 'ドラゴン', 80)
      const result = calculateDamage({
        ...baseInput,
        attackerStats: attacker,
        attackerTypes: ['ドラゴン', 'じめん'],
        defenderStats: defender,
        defenderTypes: ['ノーマル'],
        move,
      })
      expect(Array.from(result.rolls)).toEqual([70, 70, 72, 72, 73, 75, 75, 76, 76, 78, 78, 79, 79, 81, 82])
      expect(result.rolls).toHaveLength(15)
      expect(result.min).toBe(70)
      expect(result.max).toBe(82)
    })

    it('検証2: ボスゴドラ すてみタックル → ランクルス (タイプ不一致、乱数前値=100)', () => {
      // 攻撃側: ボスゴドラ A=158 (いじっぱり14振り相当)
      // 防御側: ランクルス B=85 (無補正無振り)
      // 技: すてみタックル 威力120 タイプ不一致
      // 乱数前の値=100 → 期待: [86,87,...,100]（15段階、85は出現しない）
      const attacker = makeStats(180, 158, 100, 60, 80, 100)
      const defender = makeStats(160, 60, 85, 160, 120, 70)
      const move: import('@/domain/models/Move').MoveData = {
        name: 'すてみタックル', nameEn: 'Double-Edge',
        type: 'ノーマル', category: '物理', power: 120, accuracy: 100,
        pp: 16, priority: 0,
        flags: { contact: true, sound: false, bullet: false, pulse: false, punch: false, bite: false, slice: false },
        special: null,
      }
      const result = calculateDamage({
        ...baseInput,
        attackerStats: attacker,
        attackerTypes: ['はがね', 'いわ'],
        defenderStats: defender,
        defenderTypes: ['エスパー'],
        move,
      })
      expect(Array.from(result.rolls)).toEqual([86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100])
      expect(result.rolls).toHaveLength(15)
      expect(result.min).toBe(86)
      expect(result.max).toBe(100)
    })
  })

  describe('タイプ無効', () => {
    it('無効タイプには0ダメージを返す', () => {
      // ゴーストに対してノーマル技は無効
      const move = makePhysicalMove('たいあたり', 'ノーマル', 40)
      const result = calculateDamage({ ...baseInput, move })
      expect(result.min).toBe(0)
      expect(result.max).toBe(0)
    })
  })

  describe('STAB補正', () => {
    it('タイプ一致技は威力1.5倍相当になる', () => {
      const stabMove = makePhysicalMove('じしん', 'じめん', 100)  // ガブリアスのSTAB
      const noStabMove = makePhysicalMove('ストーンエッジ', 'いわ', 100) // 非STAB

      const stabResult = calculateDamage({ ...baseInput, move: stabMove })
      const noStabResult = calculateDamage({ ...baseInput, move: noStabMove })

      // STABありの方がダメージが高い
      expect(stabResult.max).toBeGreaterThan(noStabResult.max)
    })
  })

  describe('天候補正', () => {
    it('はれでほのお技が1.5倍になる', () => {
      const move = makeSpecialMove('かえんほうしゃ', 'ほのお', 90)
      const normalResult = calculateDamage({
        ...baseInput,
        attackerTypes: ['ほのお'],
        move,
        field: createDefaultBattleField(),
      })
      const sunResult = calculateDamage({
        ...baseInput,
        attackerTypes: ['ほのお'],
        move,
        field: { ...createDefaultBattleField(), weather: 'はれ' },
      })
      expect(sunResult.max).toBeGreaterThan(normalResult.max)
    })

    it('あめでみず技が1.5倍になる', () => {
      const move = makeSpecialMove('なみのり', 'みず', 90)
      const normalResult = calculateDamage({
        ...baseInput,
        attackerTypes: ['みず'],
        move,
        field: createDefaultBattleField(),
      })
      const rainResult = calculateDamage({
        ...baseInput,
        attackerTypes: ['みず'],
        move,
        field: { ...createDefaultBattleField(), weather: 'あめ' },
      })
      expect(rainResult.max).toBeGreaterThan(normalResult.max)
    })
  })

  describe('やけど補正', () => {
    it('やけど状態で物理技が0.5倍になる', () => {
      const move = makePhysicalMove('じしん', 'じめん', 100)
      const normalResult = calculateDamage({ ...baseInput, move })
      const burnResult = calculateDamage({ ...baseInput, move, attackerStatus: 'やけど' })
      expect(burnResult.max).toBeLessThan(normalResult.max)
    })

    it('やけど状態で特殊技は影響なし', () => {
      const move = makeSpecialMove('りゅうせいぐん', 'ドラゴン', 130)
      const normalResult = calculateDamage({ ...baseInput, move })
      const burnResult = calculateDamage({ ...baseInput, move, attackerStatus: 'やけど' })
      expect(burnResult.max).toBe(normalResult.max)
    })
  })

  describe('壁補正', () => {
    it('リフレクター下で物理技が0.5倍になる', () => {
      const move = makePhysicalMove('じしん', 'じめん', 100)
      const normalResult = calculateDamage({ ...baseInput, move })
      const wallResult = calculateDamage({
        ...baseInput, move,
        field: { ...createDefaultBattleField(), isReflect: true },
      })
      expect(wallResult.max).toBeLessThan(normalResult.max)
    })

    it('ひかりのかべ下で特殊技が0.5倍になる', () => {
      const move = makeSpecialMove('りゅうせいぐん', 'ドラゴン', 130)
      const normalResult = calculateDamage({ ...baseInput, move })
      const wallResult = calculateDamage({
        ...baseInput, move,
        field: { ...createDefaultBattleField(), isLightScreen: true },
      })
      expect(wallResult.max).toBeLessThan(normalResult.max)
    })
  })

  describe('いのちのたま', () => {
    it('いのちのたまでダメージが約1.3倍になる', () => {
      const move = makePhysicalMove('じしん', 'じめん', 100)
      const normalResult = calculateDamage({ ...baseInput, move })
      const loResult = calculateDamage({ ...baseInput, move, attackerItem: 'いのちのたま' })
      // floor(max * 1.3) >= max * 1.29
      expect(loResult.max).toBeGreaterThan(normalResult.max)
      expect(loResult.max).toBeLessThanOrEqual(Math.ceil(normalResult.max * 1.3))
    })
  })

  describe('パーセント表示', () => {
    it('percentMax が max / defenderMaxHp * 100 と一致', () => {
      const move = makePhysicalMove('じしん', 'じめん', 100)
      const result = calculateDamage({ ...baseInput, move })
      const expected = (result.max / result.defenderMaxHp) * 100
      expect(result.percentMax).toBeCloseTo(expected, 1)
    })
  })
})
