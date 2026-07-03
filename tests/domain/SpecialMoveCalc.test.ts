import { describe, it, expect } from 'vitest'
import { resolveReversalPower } from '@/domain/calculators/SpecialMoveCalc'

describe('resolveReversalPower（きしかいせい・じたばた）', () => {
  it('p=9 (境界値) は威力100を返す (maxHP=192, currentHP=38)', () => {
    // ratio = floor(48 * 38 / 192) = floor(9.5) = 9
    expect(resolveReversalPower(38, 192)).toBe(100)
  })

  it('p=10 (境界値) は威力80を返す (maxHP=48, currentHP=10)', () => {
    // ratio = floor(48 * 10 / 48) = floor(10) = 10
    expect(resolveReversalPower(10, 48)).toBe(80)
  })

  it('p<2 は威力200を返す', () => {
    // ratio = floor(48 * 1 / 100) = 0
    expect(resolveReversalPower(1, 100)).toBe(200)
  })

  it('p<5 は威力150を返す', () => {
    // ratio = floor(48 * 8 / 100) = 3
    expect(resolveReversalPower(8, 100)).toBe(150)
  })

  it('p<17 は威力80を返す', () => {
    // ratio = floor(48 * 30 / 100) = 14
    expect(resolveReversalPower(30, 100)).toBe(80)
  })

  it('p<33 は威力40を返す', () => {
    // ratio = floor(48 * 60 / 100) = 28
    expect(resolveReversalPower(60, 100)).toBe(40)
  })

  it('p>=33 は威力20を返す', () => {
    // ratio = floor(48 * 90 / 100) = 43
    expect(resolveReversalPower(90, 100)).toBe(20)
  })

  it('maxHP<=0 は威力20を返す', () => {
    expect(resolveReversalPower(10, 0)).toBe(20)
  })
})
