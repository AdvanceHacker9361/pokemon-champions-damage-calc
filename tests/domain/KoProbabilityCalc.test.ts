import { describe, it, expect } from 'vitest'
import { calcKoProbability } from '@/domain/calculators/KoProbabilityCalc'

describe('KoProbabilityCalc', () => {
  describe('確定1発KO', () => {
    it('全ロールが防御側HPを超える場合', () => {
      const rolls = Array(16).fill(100) as number[]
      const result = calcKoProbability(rolls, 100)
      expect(result.type).toBe('guaranteed')
      if (result.type === 'guaranteed') {
        expect(result.hits).toBe(1)
      }
    })

    it('最小ロールもHPを超える場合', () => {
      const rolls = Array.from({ length: 16 }, (_, i) => 101 + i) as number[]
      const result = calcKoProbability(rolls, 100)
      expect(result.type).toBe('guaranteed')
      if (result.type === 'guaranteed') {
        expect(result.hits).toBe(1)
      }
    })
  })

  describe('確定2発KO', () => {
    it('2回で確実に倒せる場合', () => {
      // 各ロール50, HP=100 → 50+50=100 ≥ 100 → 確定2発
      const rolls = Array(16).fill(50) as number[]
      const result = calcKoProbability(rolls, 100)
      expect(result.type).toBe('guaranteed')
      if (result.type === 'guaranteed') {
        expect(result.hits).toBe(2)
      }
    })

    it('1発では届かないが2発で必ず倒せる場合', () => {
      // 各ロール70, HP=100 → 1発:70<100(NG), 2発:140≥100(OK) → 確定2発
      const rolls = Array(16).fill(70) as number[]
      const result = calcKoProbability(rolls, 100)
      expect(result.type).toBe('guaranteed')
      if (result.type === 'guaranteed') {
        expect(result.hits).toBe(2)
      }
    })
  })

  describe('乱数KO', () => {
    it('最大累積ダメージはHP以上だが最小は届かない (乱数2発)', () => {
      // HP=100, ロール: 8個が40 (2発:80<100), 8個が55 (2発:110≥100)
      // minTotal(hits=2) = 40*2=80 < 100 → 確定ではない
      // maxTotal(hits=2) = 55*2=110 ≥ 100 → 乱数2発
      // P(55+55=110≥100) = (8/16)*(8/16) = 0.25
      const rolls = [
        40, 40, 40, 40, 40, 40, 40, 40,
        55, 55, 55, 55, 55, 55, 55, 55,
      ] as number[]
      const result = calcKoProbability(rolls, 100)
      expect(result.type).toBe('chance')
      if (result.type === 'chance') {
        expect(result.hits).toBe(2)
        expect(result.probability).toBeCloseTo(0.25, 5)
      }
    })
  })

  describe('確定3発KO', () => {
    it('3回で確実に倒せる場合', () => {
      // 各ロール34, HP=100 → 34+34+34=102 ≥ 100 → 確定3発
      const rolls = Array(16).fill(34) as number[]
      const result = calcKoProbability(rolls, 100)
      expect(result.type).toBe('guaranteed')
      if (result.type === 'guaranteed') {
        expect(result.hits).toBe(3)
      }
    })
  })

  describe('倒せない', () => {
    it('maxHits内に倒せない場合', () => {
      // ダメージ=1, HP=100, maxHits=4 → 4発で4ダメージ < 100 → 倒せない
      const rolls = Array(16).fill(1) as number[]
      const result = calcKoProbability(rolls, 100, 4)
      expect(result.type).toBe('no-ko')
    })
  })

  describe('ゼロダメージ', () => {
    it('無効技は倒せない', () => {
      const rolls = Array(16).fill(0) as number[]
      const result = calcKoProbability(rolls, 100)
      expect(result.type).toBe('no-ko')
    })
  })
})
