import { describe, it, expect } from 'vitest'
import {
  createSpDistribution,
  getTotalSp,
  getRemainingsSp,
  validateSpDistribution,
  withStat,
} from '@/domain/models/StatPoints'
import { SP_VALIDATION_TEST_CASES } from '../fixtures/testCases'

describe('StatPoints (SP system)', () => {
  describe('validateSpDistribution - 仕様書テストケース', () => {
    for (const tc of SP_VALIDATION_TEST_CASES) {
      it(tc.label, () => {
        const sp = createSpDistribution({ hp: tc.hp, atk: tc.atk, def: tc.def, spa: tc.spa, spd: tc.spd, spe: tc.spe })
        const errors = validateSpDistribution(sp)
        if (tc.valid) {
          expect(errors).toHaveLength(0)
        } else {
          expect(errors.length).toBeGreaterThan(0)
        }
      })
    }
  })

  describe('createSpDistribution', () => {
    it('デフォルト全0で作成できる', () => {
      const sp = createSpDistribution()
      expect(getTotalSp(sp)).toBe(0)
    })

    it('値を指定して作成できる', () => {
      const sp = createSpDistribution({ hp: 4, atk: 4, def: 4, spa: 4, spd: 4, spe: 4 })
      expect(getTotalSp(sp)).toBe(24)
    })

    it('部分的に指定できる', () => {
      const sp = createSpDistribution({ hp: 10, spe: 32 })
      expect(sp.hp).toBe(10)
      expect(sp.spe).toBe(32)
      expect(sp.atk).toBe(0)
    })
  })

  describe('getTotalSp', () => {
    it('合計が正しく計算される', () => {
      const sp = createSpDistribution({ hp: 10, atk: 8, def: 12, spa: 4, spd: 0, spe: 0 })
      expect(getTotalSp(sp)).toBe(34)
    })

    it('上限66まで使える', () => {
      const sp = createSpDistribution({ hp: 11, atk: 11, def: 11, spa: 11, spd: 11, spe: 11 })
      expect(getTotalSp(sp)).toBe(66)
    })
  })

  describe('getRemainingsSp', () => {
    it('残りポイントが正しく計算される', () => {
      const sp = createSpDistribution({ hp: 10, atk: 8, def: 12, spa: 4 })
      expect(getRemainingsSp(sp)).toBe(32)
    })

    it('上限まで使うと残り0', () => {
      const sp = createSpDistribution({ hp: 11, atk: 11, def: 11, spa: 11, spd: 11, spe: 11 })
      expect(getRemainingsSp(sp)).toBe(0)
    })
  })

  describe('withStat', () => {
    it('特定ステータスを変更できる', () => {
      const sp = createSpDistribution()
      const updated = withStat(sp, 'atk', 32)
      expect(updated.atk).toBe(32)
      expect(updated.hp).toBe(0)
    })

    it('上限(32)を超える値はクランプされる', () => {
      const sp = createSpDistribution()
      const updated = withStat(sp, 'hp', 50)
      expect(updated.hp).toBe(32)
    })

    it('負の値は0にクランプされる', () => {
      const sp = createSpDistribution({ hp: 10 })
      const updated = withStat(sp, 'hp', -5)
      expect(updated.hp).toBe(0)
    })
  })

  describe('エッジケース', () => {
    it('単体32超過を検出する', () => {
      const sp = createSpDistribution({ hp: 33 })
      const errors = validateSpDistribution(sp)
      expect(errors.some(e => e.type === 'stat-exceeds-max' && e.stat === 'hp')).toBe(true)
    })

    it('合計超過を検出する', () => {
      const sp = createSpDistribution({ hp: 12, atk: 12, def: 12, spa: 12, spd: 12, spe: 12 })
      const errors = validateSpDistribution(sp)
      expect(errors.some(e => e.type === 'total-exceeds-max')).toBe(true)
    })

    it('負の値を検出する', () => {
      const sp = createSpDistribution({ hp: -1 })
      const errors = validateSpDistribution(sp)
      expect(errors.some(e => e.type === 'negative-value' && e.stat === 'hp')).toBe(true)
    })
  })
})
