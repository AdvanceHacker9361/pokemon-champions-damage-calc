import { PokemonRepository } from '@/data/repositories/PokemonRepository'
import type { PokemonRecord } from '@/data/schemas/types'

export function searchPokemon(query: string, limit = 20): PokemonRecord[] {
  return PokemonRepository.search(query, limit)
}
