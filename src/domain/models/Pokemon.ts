export type StatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe'

export const STAT_KEYS: StatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe']

export const STAT_LABEL: Record<StatKey, string> = {
  hp:  'H',
  atk: 'A',
  def: 'B',
  spa: 'C',
  spd: 'D',
  spe: 'S',
}

export const STAT_LABEL_LONG: Record<StatKey, string> = {
  hp:  'HP',
  atk: 'こうげき',
  def: 'ぼうぎょ',
  spa: 'とくこう',
  spd: 'とくぼう',
  spe: 'すばやさ',
}

export type TypeName =
  | 'ノーマル' | 'ほのお' | 'みず' | 'でんき' | 'くさ' | 'こおり'
  | 'かくとう' | 'どく' | 'じめん' | 'ひこう' | 'エスパー' | 'むし'
  | 'いわ' | 'ゴースト' | 'ドラゴン' | 'あく' | 'はがね' | 'フェアリー'

export const ALL_TYPE_NAMES: TypeName[] = [
  'ノーマル', 'ほのお', 'みず', 'でんき', 'くさ', 'こおり',
  'かくとう', 'どく', 'じめん', 'ひこう', 'エスパー', 'むし',
  'いわ', 'ゴースト', 'ドラゴン', 'あく', 'はがね', 'フェアリー',
]

export type MoveCategory = '物理' | '特殊' | '変化'
export type Weather = 'はれ' | 'あめ' | 'すなあらし' | 'ゆき' | null
export type TerrainField = 'エレキ' | 'グラス' | 'サイコ' | 'ミスト' | null
export type StatusCondition = 'やけど' | 'まひ' | 'どく' | 'もうどく' | 'ねむり' | null

export interface BaseStats {
  hp: number
  atk: number
  def: number
  spa: number
  spd: number
  spe: number
}

export interface ComputedStats {
  hp: number
  atk: number
  def: number
  spa: number
  spd: number
  spe: number
}

export function zeroStats(): BaseStats {
  return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
}
