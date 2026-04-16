import pokemonData from '@/data/json/pokemon.json'
import megaData from '@/data/json/pokemon-mega.json'
import type { PokemonRecord, MegaPokemonRecord } from '@/data/schemas/types'
import { toKatakana } from '../../utils/japanese'

const pokemon = pokemonData as PokemonRecord[]
const megaPokemon = megaData as MegaPokemonRecord[]

// 検索インデックス構築（ビルド時に一度だけ）
// jpKata: ひらがな入力でもカタカナ名にマッチするよう正規化
const searchIndex = pokemon.map(p => ({
  id: p.id,
  jp: p.name,
  jpKata: toKatakana(p.name),
  en: p.nameEn.toLowerCase(),
}))

const megaByKey = new Map(megaPokemon.map(m => [m.key, m]))
const megaByBaseId = new Map(megaPokemon.map(m => [m.basePokemonId, m]))

// 複数形態（リザードンX/Y等）対応
const megasByBaseId = new Map<number, MegaPokemonRecord[]>()
for (const m of megaPokemon) {
  const list = megasByBaseId.get(m.basePokemonId) ?? []
  list.push(m)
  megasByBaseId.set(m.basePokemonId, list)
}

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

  /** JP/EN 両対応インクリメンタルサーチ（ひらがな↔カタカナ変換対応） */
  search(query: string, limit = 20): PokemonRecord[] {
    if (!query.trim()) return pokemon.slice(0, limit)
    const q = query.trim()
    const qKata = toKatakana(q)   // ひらがな入力をカタカナに正規化
    const ql = q.toLowerCase()
    const results = searchIndex
      .filter(p => p.jp.includes(q) || p.jpKata.includes(qKata) || p.en.includes(ql))
      .slice(0, limit)
    return results.map(r => pokemon.find(p => p.id === r.id)!)
  },

  getMegaByKey(key: string): MegaPokemonRecord | undefined {
    return megaByKey.get(key)
  },

  getMegaByBaseId(pokemonId: number): MegaPokemonRecord | undefined {
    return megaByBaseId.get(pokemonId)
  },

  /** 複数形態対応: 該当ポケモンの全メガシンカ形態を返す */
  getMegasByBaseId(pokemonId: number): MegaPokemonRecord[] {
    return megasByBaseId.get(pokemonId) ?? []
  },

  getAllMega(): MegaPokemonRecord[] {
    return megaPokemon
  },
}
