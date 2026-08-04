import { describe, it, expect } from 'vitest'
import { calcDrainHeal, calcDrainRange, drainRateLabel } from '@/domain/calculators/DrainCalc'

describe('DrainCalc', () => {
  describe('calcDrainHeal', () => {
    it('与ダメ × 吸収率を切り捨て（BattleSequenceCalc と同一式）', () => {
      expect(calcDrainHeal(100, 0.5)).toBe(50)
      expect(calcDrainHeal(101, 0.5)).toBe(50)    // 50.5 → floor 50
      expect(calcDrainHeal(100, 0.75)).toBe(75)
      expect(calcDrainHeal(85, 0.75)).toBe(63)    // 63.75 → 63
    })

    it('最低1回復保証', () => {
      expect(calcDrainHeal(1, 0.5)).toBe(1)       // 0.5 → floor 0 → min 1
    })

    it('与ダメ0なら回復なし', () => {
      expect(calcDrainHeal(0, 0.5)).toBe(0)
    })
  })

  describe('calcDrainRange', () => {
    it('乱数幅の min/max それぞれに吸収率を適用', () => {
      const r = calcDrainRange(85, 100, 0.5, 999)
      expect(r.min).toBe(42)  // 42.5 → 42
      expect(r.max).toBe(50)
    })

    it('防御側最大HPでクランプ（オーバーキル分は回復に乗らない）', () => {
      const r = calcDrainRange(150, 300, 0.5, 175)
      expect(r.min).toBe(75)   // 150 × 0.5
      expect(r.max).toBe(87)   // min(300,175)=175 × 0.5 = 87.5 → floor 87
    })
  })

  describe('drainRateLabel', () => {
    it('代表的な吸収率を分数表示', () => {
      expect(drainRateLabel(0.5)).toBe('1/2')
      expect(drainRateLabel(0.75)).toBe('3/4')
    })
  })
})
