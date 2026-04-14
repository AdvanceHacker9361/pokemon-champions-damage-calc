import pokemonData from '@/data/json/pokemon.json'
import megaData from '@/data/json/pokemon-mega.json'
import type { PokemonRecord, MegaPokemonRecord } from '@/data/schemas/types'

const pokemon = pokemonData as PokemonRecord[]
const megaPokemon = megaData as MegaPokemonRecord[]

// 検索インデックス構築（ビルド時に一度だけ）
const searchIndex = pokemon.map(p => ({
  id: p.id,
  jp: p.name,
  en: p.nameEn.toLowerCase(),
}))

const megaByKey = new Map(megaPokemon.map(m => [m.key, m]))
const megaByBaseId = new Map(megaPokemon.map(m => [m.basePokemonId, m]))

export const PokemonRepository = {
  getAll(): PokemonRecord[] {
    return pokemon
  },

  findById(id: number): PokemonRecord | undefined {
    return pokemon.find(p => p.id === id)
  },

  findByName(name: string): PokemonRecord | undefined {
    return pokemon.find(p => p.name === name)
  },

  /** JP/EN 両対応インクリメンタルサーチ */
  search(query: string, limit = 20): PokemonRecord[] {
    if (!query.trim()) return pokemon.slice(0, limit)
    const q = query.trim()
    const ql = q.toLowerCase()
    const results = searchIndex
      .filter(p => p.jp.includes(q) || p.en.includes(ql))
      .slice(0, limit)
    return results.map(r => pokemon.find(p => p.id === r.id)!)
  },

  getMegaByKey(key: string): MegaPokemonRecord | undefined {
    return megaByKey.get(key)
  },

  getMegaByBaseId(pokemonId: number): MegaPokemonRecord | undefined {
    return megaByBaseId.get(pokemonId)
  },

  getAllMega(): MegaPokemonRecord[] {
    return megaPokemon
  },
}
