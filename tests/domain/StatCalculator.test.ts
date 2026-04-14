import { describe, it, expect } from 'vitest'
import { calculateHP, calculateNonHP, applyRankModifier } from '@/domain/calculators/StatCalculator'
import { STAT_TEST_CASES } from '../fixtures/testCases'

describe('StatCalculator', () => {
  describe('仕様書テストケース', () => {
    for (const tc of STAT_TEST_CASES) {
      it(tc.label, () => {
        const result = tc.isHP
          ? calculateHP(tc.base, tc.sp)
          : calculateNonHP(tc.base, tc.sp, tc.natureModifier)
        expect(result).toBe(tc.expected)
      })
    }
  })

  describe('calculateHP', () => {
    it('SP=0 の時の基礎値計算 (ガブリアス)', () => {
      // HP: floor((108*2 + 31 + 0) * 50/100 + 60) = floor(247*0.5 + 60) = floor(183.5) = 183
      expect(calculateHP(108, 0)).toBe(183)
    })

    it('SP=32 の時の最大値計算 (ガブリアス)', () => {
      // HP: floor((108*2 + 31 + 32) * 50/100 + 60) = floor(279*0.5 + 60) = floor(139.5 + 60) = 199
      expect(calculateHP(108, 32)).toBe(199)
    })

    it('SP=2 の検証 (仕様書: ガブリアス HP=184)', () => {
      expect(calculateHP(108, 2)).toBe(184)
    })
  })

  describe('calculateNonHP', () => {
    it('補正なし(1.0)の計算', () => {
      // base=102, sp=0, nature=1.0
      // floor(floor((204+31+0)*0.5 + 5) * 1.0) = floor(floor(117.5+5)) = floor(122) = 122
      expect(calculateNonHP(102, 0, 1.0)).toBe(122)
    })

    it('上昇補正(1.1)の計算', () => {
      // base=130, sp=0, nature=1.1
      // floor(floor((260+31+0)*0.5 + 5) * 1.1) = floor(floor(145.5+5)*1.1) = floor(150*1.1) = floor(165) = 165
      expect(calculateNonHP(130, 0, 1.1)).toBe(165)
    })

    it('下降補正(0.9)の計算', () => {
      // base=130, sp=0, nature=0.9
      // floor(150 * 0.9) = floor(135) = 135
      expect(calculateNonHP(130, 0, 0.9)).toBe(135)
    })

    it('SP=32 上昇補正 (仕様書: ガブリアス A=200)', () => {
      // base=130, sp=32, nature=1.1
      // floor(floor((260+31+64)*0.5+5)*1.1) = floor(177*1.1) = floor(200.2-1? no...)
      // floor(355*0.5) = floor(177.5) = 177, 177+5=182, floor(182*1.1)=floor(200.2)=200
      expect(calculateNonHP(130, 32, 1.1)).toBe(200)
    })
  })

  describe('applyRankModifier', () => {
    it('ランク0は等倍', () => {
      expect(applyRankModifier(100, 0)).toBe(100)
    })

    it('ランク+1は1.5倍', () => {
      expect(applyRankModifier(100, 1)).toBe(150)
    })

    it('ランク+2は2.0倍', () => {
      expect(applyRankModifier(100, 2)).toBe(200)
    })

    it('ランク+6は4.0倍', () => {
      expect(applyRankModifier(100, 6)).toBe(400)
    })

    it('ランク-1は0.67倍（floor適用）', () => {
      // floor(100 * 2/3) = floor(66.6...) = 66
      expect(applyRankModifier(100, -1)).toBe(66)
    })

    it('ランク-6は0.25倍', () => {
      expect(applyRankModifier(100, -6)).toBe(25)
    })
  })
})
