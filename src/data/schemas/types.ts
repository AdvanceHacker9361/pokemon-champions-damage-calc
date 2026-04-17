import type { TypeName, StatKey } from '@/domain/models/Pokemon'
import type { SpecialMoveTag, MultiHitData } from '@/domain/models/Move'

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
  weight?: number
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
    recoil?: boolean
  }
  special: SpecialMoveTag | null
  multiHit?: MultiHitData | null
  /** 可変威力の選択肢（おはかまいり等） */
  powerOptions?: number[]
  /** 使用後の自ステータス低下（りゅうせいぐん=spa-2 等） */
  selfStatDrop?: { stat: StatKey; stages: number }
  /** 確定急所技（常に急所補正で計算） */
  alwaysCrit?: boolean
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
