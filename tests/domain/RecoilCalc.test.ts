import { describe, it, expect } from 'vitest'
import {
  recoilRateForMove,
  calcRecoilDamage,
  calcRecoilRange,
  recoilRateLabel,
} from '@/domain/calculators/RecoilCalc'

describe('RecoilCalc', () => {
  describe('recoilRateForMove', () => {
    it('反動技は反動率を返す', () => {
      expect(recoilRateForMove({ recoil: 1 / 3 }, 'いかく')).toBeCloseTo(1 / 3)
      expect(recoilRateForMove({ recoil: 0.25 }, null)).toBe(0.25)
    })

    it('反動なし技は undefined', () => {
      expect(recoilRateForMove({ recoil: undefined }, 'いかく')).toBeUndefined()
      expect(recoilRateForMove(undefined, 'いかく')).toBeUndefined()
    })

    it('いしあたま / マジックガードは反動無効', () => {
      expect(recoilRateForMove({ recoil: 1 / 3 }, 'いしあたま')).toBeUndefined()
      expect(recoilRateForMove({ recoil: 1 / 3 }, 'マジックガード')).toBeUndefined()
    })
  })

  describe('calcRecoilDamage', () => {
    it('与ダメ × 反動率を四捨五入（BattleSequenceCalc と同一式）', () => {
      expect(calcRecoilDamage(100, 1 / 3)).toBe(33)   // 33.33 → 33
      expect(calcRecoilDamage(101, 1 / 3)).toBe(34)   // 33.67 → 34
      expect(calcRecoilDamage(50, 0.5)).toBe(25)
      expect(calcRecoilDamage(82, 0.25)).toBe(21)     // 20.5 → 21 (Math.round)
    })

    it('最低1ダメージ保証', () => {
      expect(calcRecoilDamage(1, 0.25)).toBe(1)       // 0.25 → round=0 → min 1
    })

    it('与ダメ0なら反動なし', () => {
      expect(calcRecoilDamage(0, 1 / 3)).toBe(0)
    })
  })

  describe('calcRecoilRange', () => {
    it('乱数幅の min/max それぞれに反動率を適用', () => {
      const r = calcRecoilRange(85, 100, 1 / 3, 999)
      expect(r.min).toBe(28)  // 28.33 → 28
      expect(r.max).toBe(33)
    })

    it('防御側最大HPでクランプ（オーバーキル分に反動は乗らない）', () => {
      const r = calcRecoilRange(150, 300, 0.5, 175)
      expect(r.min).toBe(75)   // 150 × 0.5
      expect(r.max).toBe(88)   // min(300,175)=175 × 0.5 = 87.5 → 88
    })
  })

  describe('recoilRateLabel', () => {
    it('代表的な反動率を分数表示', () => {
      expect(recoilRateLabel(1 / 3)).toBe('1/3')
      expect(recoilRateLabel(0.25)).toBe('1/4')
      expect(recoilRateLabel(0.5)).toBe('1/2')
    })
  })
})
