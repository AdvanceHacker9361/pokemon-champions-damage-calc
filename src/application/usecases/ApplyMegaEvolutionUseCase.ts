import { PokemonRepository } from '@/data/repositories/PokemonRepository'
import type { PokemonRecord, MegaPokemonRecord } from '@/data/schemas/types'

export interface MegaEvolutionResult {
  record: PokemonRecord | MegaPokemonRecord
  isMega: boolean
}

export function applyMegaEvolution(
  basePokemonId: number,
  enable: boolean,
): MegaEvolutionResult {
  if (!enable) {
    const base = PokemonRepository.findById(basePokemonId)
    if (!base) throw new Error(`Pokemon ${basePokemonId} not found`)
    return { record: base, isMega: false }
  }

  const mega = PokemonRepository.getMegaByBaseId(basePokemonId)
  if (!mega) {
    const base = PokemonRepository.findById(basePokemonId)
    if (!base) throw new Error(`Pokemon ${basePokemonId} not found`)
    return { record: base, isMega: false }
  }

  return { record: mega, isMega: true }
}

export function hasMegaEvolution(pokemonId: number): boolean {
  return PokemonRepository.getMegaByBaseId(pokemonId) !== undefined
}
