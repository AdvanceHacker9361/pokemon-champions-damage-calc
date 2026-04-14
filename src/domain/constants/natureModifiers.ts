import type { StatKey } from '@/domain/models/Pokemon'

export type NatureModifier = 1.0 | 1.1 | 0.9

export interface NatureData {
  name: string
  nameEn: string
  up: StatKey | null
  down: StatKey | null
}

/** 性格名 → {上昇/下降} ステータスキー */
export const NATURE_TABLE: Record<string, NatureData> = {
  がんばりや: { name: 'がんばりや', nameEn: 'Hardy',   up: null,   down: null },
  さみしがり: { name: 'さみしがり', nameEn: 'Lonely',  up: 'atk',  down: 'def' },
  いじっぱり: { name: 'いじっぱり', nameEn: 'Adamant', up: 'atk',  down: 'spa' },
  やんちゃ:   { name: 'やんちゃ',   nameEn: 'Naughty', up: 'atk',  down: 'spd' },
  ゆうかん:   { name: 'ゆうかん',   nameEn: 'Brave',   up: 'atk',  down: 'spe' },
  ずぶとい:   { name: 'ずぶとい',   nameEn: 'Bold',    up: 'def',  down: 'atk' },
  がんじょう: { name: 'がんじょう', nameEn: 'Impish',  up: 'def',  down: 'spa' },
  わんぱく:   { name: 'わんぱく',   nameEn: 'Lax',     up: 'def',  down: 'spd' },
  のんき:     { name: 'のんき',     nameEn: 'Relaxed', up: 'def',  down: 'spe' },
  ひかえめ:   { name: 'ひかえめ',   nameEn: 'Modest',  up: 'spa',  down: 'atk' },
  おっとり:   { name: 'おっとり',   nameEn: 'Mild',    up: 'spa',  down: 'def' },
  うっかりや: { name: 'うっかりや', nameEn: 'Rash',    up: 'spa',  down: 'spd' },
  れいせい:   { name: 'れいせい',   nameEn: 'Quiet',   up: 'spa',  down: 'spe' },
  おだやか:   { name: 'おだやか',   nameEn: 'Calm',    up: 'spd',  down: 'atk' },
  おとなしい: { name: 'おとなしい', nameEn: 'Gentle',  up: 'spd',  down: 'def' },
  しんちょう: { name: 'しんちょう', nameEn: 'Careful', up: 'spd',  down: 'spa' },
  なまいき:   { name: 'なまいき',   nameEn: 'Sassy',   up: 'spd',  down: 'spe' },
  おくびょう: { name: 'おくびょう', nameEn: 'Timid',   up: 'spe',  down: 'atk' },
  せっかち:   { name: 'せっかち',   nameEn: 'Hasty',   up: 'spe',  down: 'def' },
  ようき:     { name: 'ようき',     nameEn: 'Jolly',   up: 'spe',  down: 'spa' },
  むじゃき:   { name: 'むじゃき',   nameEn: 'Naive',   up: 'spe',  down: 'spd' },
  てれや:     { name: 'てれや',     nameEn: 'Bashful', up: null,   down: null },
  きまぐれ:   { name: 'きまぐれ',   nameEn: 'Quirky',  up: null,   down: null },
  すなお:     { name: 'すなお',     nameEn: 'Docile',  up: null,   down: null },
  まじめ:     { name: 'まじめ',     nameEn: 'Serious', up: null,   down: null },
}

export function getNatureModifier(natureName: string, stat: StatKey): NatureModifier {
  const nature = NATURE_TABLE[natureName]
  if (!nature) return 1.0
  if (nature.up === stat) return 1.1
  if (nature.down === stat) return 0.9
  return 1.0
}
