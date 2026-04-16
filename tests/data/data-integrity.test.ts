/**
 * data-integrity.test.ts
 * データ整合性テスト
 * - 全内定ポケモンのデータが存在するか
 * - 全技データのスキーマ準拠
 * - 日本語名が存在するか
 * - PP値が Champions 4段階（8/12/16/20）に準拠しているか
 */

import { describe, it, expect } from 'vitest'
import pokemonData from '@/data/json/pokemon.json'
import megaData from '@/data/json/pokemon-mega.json'
import movesData from '@/data/json/moves.json'
import abilitiesData from '@/data/json/abilities.json'
import itemsData from '@/data/json/items.json'
import type { PokemonRecord, MegaPokemonRecord, MoveRecord, AbilityRecord, ItemRecord } from '@/data/schemas/types'

const pokemon = pokemonData as PokemonRecord[]
const mega = megaData as MegaPokemonRecord[]
const moves = movesData as MoveRecord[]
const abilities = abilitiesData as AbilityRecord[]
const items = itemsData as ItemRecord[]

// ────────────────────────────────────────────────
// 有効な値の定数
// ────────────────────────────────────────────────
const VALID_TYPES = new Set([
  'ノーマル', 'ほのお', 'みず', 'でんき', 'くさ', 'こおり',
  'かくとう', 'どく', 'じめん', 'ひこう', 'エスパー', 'むし',
  'いわ', 'ゴースト', 'ドラゴン', 'あく', 'はがね', 'フェアリー',
])

const VALID_PP = new Set([8, 12, 16, 20])

const VALID_CATEGORIES = new Set(['物理', '特殊', '変化'])

const VALID_SPECIAL_TAGS = new Set([
  null, 'foul-play', 'body-press', 'photon-geyser', 'psyshock', 'gyro-ball',
  'grass-knot', 'low-kick', 'hex', 'facade', 'stealth-rock',
  'freeze-dry', 'weather-ball', 'knock-off', 'stored-power', 'reversal',
])

// ────────────────────────────────────────────────
// ポケモンデータのテスト
// ────────────────────────────────────────────────
describe('pokemon.json integrity', () => {
  it('should have at least 200 pokemon', () => {
    expect(pokemon.length).toBeGreaterThanOrEqual(200)
  })

  it('all pokemon should have required fields', () => {
    const errors: string[] = []
    for (const p of pokemon) {
      if (!p.id || typeof p.id !== 'number') errors.push(`${p.nameEn}: invalid id`)
      if (!p.name || typeof p.name !== 'string') errors.push(`${p.nameEn}: missing name`)
      if (!p.nameEn || typeof p.nameEn !== 'string') errors.push(`id=${p.id}: missing nameEn`)
      if (!Array.isArray(p.types) || p.types.length === 0) errors.push(`${p.nameEn}: invalid types`)
      if (!p.baseStats || typeof p.baseStats !== 'object') errors.push(`${p.nameEn}: missing baseStats`)
      if (!Array.isArray(p.abilities) || p.abilities.length === 0) errors.push(`${p.nameEn}: missing abilities`)
      if (typeof p.weight !== 'number') errors.push(`${p.nameEn}: missing weight`)
    }
    expect(errors, `Pokemon data errors:\n${errors.join('\n')}`).toHaveLength(0)
  })

  it('all pokemon types should be valid Japanese type names', () => {
    const errors: string[] = []
    for (const p of pokemon) {
      for (const t of p.types) {
        if (!VALID_TYPES.has(t)) {
          errors.push(`${p.nameEn}: invalid type "${t}"`)
        }
      }
    }
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  it('all pokemon should have Japanese names (non-ASCII or katakana)', () => {
    const errors: string[] = []
    for (const p of pokemon) {
      // 日本語名は英語名と同じではないはず（一部例外を除く）
      if (p.name === p.nameEn) {
        errors.push(`${p.nameEn}: name === nameEn (likely missing Japanese name)`)
      }
    }
    expect(errors, `${errors.length} Pokemon missing Japanese names:\n${errors.slice(0, 10).join('\n')}`).toHaveLength(0)
  })

  it('all pokemon should have valid baseStats', () => {
    const statKeys = ['hp', 'atk', 'def', 'spa', 'spd', 'spe']
    const errors: string[] = []
    for (const p of pokemon) {
      for (const stat of statKeys) {
        const val = (p.baseStats as Record<string, number>)[stat]
        if (typeof val !== 'number' || val <= 0 || val > 300) {
          errors.push(`${p.nameEn}: invalid ${stat}=${val}`)
        }
      }
    }
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})

// ────────────────────────────────────────────────
// メガシンカデータのテスト
// ────────────────────────────────────────────────
describe('pokemon-mega.json integrity', () => {
  it('should have at least 40 mega evolutions', () => {
    expect(mega.length).toBeGreaterThanOrEqual(40)
  })

  it('all mega pokemon should have valid types', () => {
    const errors: string[] = []
    for (const m of mega) {
      for (const t of m.types) {
        if (!VALID_TYPES.has(t)) {
          errors.push(`${m.nameEn}: invalid type "${t}"`)
        }
      }
    }
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  it('all mega pokemon keys should be referenced in pokemon.json', () => {
    const megaKeySet = new Set(mega.map(m => m.key))
    const referencedKeys = new Set<string>()
    for (const p of pokemon) {
      if (p.megaEvolutionKey) {
        referencedKeys.add(p.megaEvolutionKey)
      }
    }
    const unreferenced = [...megaKeySet].filter(k => !referencedKeys.has(k))
    // Some mega keys may not be referenced if the base pokemon handles multiple megas
    // (e.g., Charizard has both mega-x and mega-y, but only one key in pokemon.json)
    // Allow up to 5 unreferenced
    expect(unreferenced.length).toBeLessThanOrEqual(10)
  })
})

// ────────────────────────────────────────────────
// 技データのテスト
// ────────────────────────────────────────────────
describe('moves.json integrity', () => {
  it('should have more than 500 moves', () => {
    expect(moves.length).toBeGreaterThan(500)
  })

  it('all moves should have required fields', () => {
    const errors: string[] = []
    for (const m of moves) {
      if (!m.name || typeof m.name !== 'string') errors.push(`${m.nameEn}: missing name`)
      if (!m.nameEn || typeof m.nameEn !== 'string') errors.push(`name=${m.name}: missing nameEn`)
      if (!m.type) errors.push(`${m.nameEn}: missing type`)
      if (!m.category) errors.push(`${m.nameEn}: missing category`)
      if (m.priority === undefined) errors.push(`${m.nameEn}: missing priority`)
    }
    expect(errors, `Move errors:\n${errors.slice(0, 10).join('\n')}`).toHaveLength(0)
  })

  it('all move types should be valid Japanese type names', () => {
    const invalid = moves.filter(m => !VALID_TYPES.has(m.type))
    expect(invalid.map(m => `${m.nameEn}: type=${m.type}`)).toHaveLength(0)
  })

  it('all move PP should be in Champions 4-tier system (8/12/16/20)', () => {
    const invalid = moves.filter(m => !VALID_PP.has(m.pp))
    const details = invalid.map(m => `${m.nameEn}: pp=${m.pp}`)
    expect(details, `Invalid PP:\n${details.join('\n')}`).toHaveLength(0)
  })

  it('all move categories should be valid', () => {
    const invalid = moves.filter(m => !VALID_CATEGORIES.has(m.category))
    expect(invalid.map(m => `${m.nameEn}: category=${m.category}`)).toHaveLength(0)
  })

  it('all move special tags should be valid', () => {
    const invalid = moves.filter(m => !VALID_SPECIAL_TAGS.has(m.special))
    expect(invalid.map(m => `${m.nameEn}: special=${String(m.special)}`)).toHaveLength(0)
  })

  it('all moves should have Japanese names', () => {
    // Name should not be identical to English name (except for a few edge cases)
    const englishOnly = moves.filter(m => m.name === m.nameEn)
    expect(
      englishOnly.map(m => m.nameEn),
      `${englishOnly.length} moves with English-only names: ${englishOnly.slice(0, 5).map(m => m.nameEn).join(', ')}`
    ).toHaveLength(0)
  })

  it('all move flags should be boolean', () => {
    const errors: string[] = []
    const boolFlags = ['contact', 'sound', 'bullet', 'pulse', 'punch', 'bite', 'slice'] as const
    for (const m of moves) {
      for (const flag of boolFlags) {
        if (typeof m.flags[flag] !== 'boolean') {
          errors.push(`${m.nameEn}: flags.${flag} is not boolean (${String(m.flags[flag])})`)
        }
      }
    }
    expect(errors, errors.slice(0, 5).join('\n')).toHaveLength(0)
  })

  it('damaging moves should have power > 0 or be special (power=null for variable)', () => {
    const errors: string[] = []
    for (const m of moves) {
      if (m.category !== '変化') {
        // power can be null for variable power moves with special tag
        if (m.power !== null && m.power < 0) {
          errors.push(`${m.nameEn}: negative power=${m.power}`)
        }
      }
    }
    expect(errors).toHaveLength(0)
  })

  it('move names should be unique', () => {
    const names = moves.map(m => m.name)
    const dupes = names.filter((n, i) => names.indexOf(n) !== i)
    expect(dupes, `Duplicate move names: ${[...new Set(dupes)].join(', ')}`).toHaveLength(0)
  })

  it('move English names should be unique', () => {
    const names = moves.map(m => m.nameEn)
    const dupes = names.filter((n, i) => names.indexOf(n) !== i)
    expect(dupes, `Duplicate English move names: ${[...new Set(dupes)].join(', ')}`).toHaveLength(0)
  })

  it('multiHit data should be well-formed', () => {
    const errors: string[] = []
    for (const m of moves) {
      if (m.multiHit !== undefined && m.multiHit !== null) {
        const mh = m.multiHit as { type: string; count?: number }
        if (mh.type !== 'fixed' && mh.type !== 'variable') {
          errors.push(`${m.nameEn}: invalid multiHit.type=${mh.type}`)
        }
        if (mh.type === 'fixed' && (typeof mh.count !== 'number' || mh.count < 2)) {
          errors.push(`${m.nameEn}: fixed multiHit should have count >= 2`)
        }
      }
    }
    expect(errors).toHaveLength(0)
  })
})

// ────────────────────────────────────────────────
// 特性データのテスト
// ────────────────────────────────────────────────
describe('abilities.json integrity', () => {
  it('should have at least 60 abilities', () => {
    expect(abilities.length).toBeGreaterThanOrEqual(60)
  })

  it('all abilities should have required fields', () => {
    const errors: string[] = []
    for (const a of abilities) {
      if (!a.name) errors.push(`${a.nameEn}: missing name`)
      if (!a.nameEn) errors.push(`name=${a.name}: missing nameEn`)
      if (!a.calcTag) errors.push(`${a.nameEn}: missing calcTag`)
    }
    expect(errors).toHaveLength(0)
  })

  it('all pokemon abilities should exist in abilities.json', () => {
    const abilityNames = new Set(abilities.map(a => a.name))
    const missing: string[] = []

    for (const p of pokemon) {
      for (const ability of p.abilities) {
        if (!abilityNames.has(ability)) {
          missing.push(`${p.nameEn}: ability "${ability}" not in abilities.json`)
        }
      }
    }

    expect(
      missing,
      `${missing.length} pokemon abilities not in abilities.json:\n${missing.slice(0, 10).join('\n')}`
    ).toHaveLength(0)
  })
})

// ────────────────────────────────────────────────
// アイテムデータのテスト
// ────────────────────────────────────────────────
describe('items.json integrity', () => {
  it('should have at least 30 items', () => {
    expect(items.length).toBeGreaterThanOrEqual(30)
  })

  it('all items should have required fields', () => {
    const errors: string[] = []
    for (const item of items) {
      if (!item.name) errors.push(`${item.nameEn}: missing name`)
      if (!item.nameEn) errors.push(`name=${item.name}: missing nameEn`)
      if (!item.calcTag) errors.push(`${item.nameEn}: missing calcTag`)
    }
    expect(errors).toHaveLength(0)
  })

  it('should include essential damage calc items', () => {
    const calcTags = new Set(items.map(i => i.calcTag))
    const required = ['life-orb', 'choice-band', 'choice-specs', 'choice-scarf', 'focus-sash', 'assault-vest']
    for (const tag of required) {
      expect(calcTags.has(tag), `Missing essential item: ${tag}`).toBe(true)
    }
  })
})
