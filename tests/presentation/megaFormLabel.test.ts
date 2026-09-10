import { describe, it, expect } from 'vitest'
import { megaFormLabel } from '@/presentation/components/pokemon/MegaToggle'
import { PokemonRepository } from '@/data/repositories/PokemonRepository'

function mega(key: string) {
  const m = PokemonRepository.getMegaByKey(key)
  if (!m) throw new Error(`mega not found: ${key}`)
  return m
}

describe('megaFormLabel（複数メガ形態のボタン名）', () => {
  it('通常メガは「メガ」とだけ表示する', () => {
    expect(megaFormLabel(mega('mega-lucario'))).toBe('メガ')
    expect(megaFormLabel(mega('mega-absol'))).toBe('メガ')
    expect(megaFormLabel(mega('mega-garchomp'))).toBe('メガ')
  })

  it('Z / X / Y 形態は形態名だけを付ける', () => {
    expect(megaFormLabel(mega('mega-lucario-z'))).toBe('メガZ')
    expect(megaFormLabel(mega('mega-absol-z'))).toBe('メガZ')
    expect(megaFormLabel(mega('mega-garchomp-z'))).toBe('メガZ')
    expect(megaFormLabel(mega('mega-charizard-x'))).toBe('メガX')
    expect(megaFormLabel(mega('mega-charizard-y'))).toBe('メガY')
    expect(megaFormLabel(mega('mega-mewtwo-x'))).toBe('メガX')
    expect(megaFormLabel(mega('mega-raichu-y'))).toBe('メガY')
  })

  it('複数形態を持つ全種で、ラベルに英字の種族名や key 由来の文字列が混ざらない', () => {
    const byBase = new Map<number, string[]>()
    for (const m of PokemonRepository.getAllMega()) {
      byBase.set(m.basePokemonId, [...(byBase.get(m.basePokemonId) ?? []), m.key])
    }
    for (const [, keys] of byBase) {
      if (keys.length < 2) continue
      const labels = keys.map(k => megaFormLabel(mega(k)))
      for (const label of labels) expect(label).toMatch(/^メガ[XYZ]?$/)
      expect(new Set(labels).size).toBe(labels.length)
    }
  })
})
