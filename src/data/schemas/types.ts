import type { TypeName, StatKey } from '@/domain/models/Pokemon'
import type { SpecialMoveTag } from '@/domain/models/Move'

export interface PokemonRecord {
  id: number
  name: string
  nameEn: string
  types: TypeName[]
  baseStats: Record<StatKey, number>
  abilities: string[]
  megaEvolutionKey?: string
  weight: number
}

export interface MegaPokemonRecord {
  key: string
  basePokemonId: number
  name: string
  nameEn: string
  types: TypeName[]
  baseStats: Record<StatKey, number>
  ability: string
}

export interface MoveRecord {
  name: string
  nameEn: string
  type: TypeName
  category: '物理' | '特殊' | '変化'
  power: number | null
  accuracy: number | null
  pp: 8 | 12 | 16 | 20
  priority: number
  flags: {
    contact: boolean
    sound: boolean
    bullet: boolean
    pulse: boolean
    punch: boolean
    bite: boolean
    slice: boolean
  }
  special: SpecialMoveTag | null
}

export interface AbilityRecord {
  name: string
  nameEn: string
  calcTag: string
  description?: string
}

export interface ItemRecord {
  name: string
  nameEn: string
  calcTag: string
  description?: string
}

export interface NatureRecord {
  name: string
  nameEn: string
  up: StatKey | null
  down: StatKey | null
}
