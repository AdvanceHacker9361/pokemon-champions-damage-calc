import type { TypeName } from '@/domain/models/Pokemon'

/** タイプ色（彩度を一段落とした版・§2.3） */
export const TYPE_HEX: Record<TypeName, string> = {
  ノーマル:  '#9c9c8e',
  ほのお:    '#c7472b',
  みず:      '#3a7ab8',
  でんき:    '#c2a430',
  くさ:      '#5a9242',
  こおり:    '#6ab3c2',
  かくとう:  '#a83a2b',
  どく:      '#8e3a8e',
  じめん:    '#b87842',
  ひこう:    '#7896c2',
  エスパー:  '#c25a85',
  むし:      '#8aa033',
  いわ:      '#a89255',
  ゴースト:  '#5a4a85',
  ドラゴン:  '#4a5db8',
  あく:      '#3a2e23',
  はがね:    '#7a8a95',
  フェアリー:'#c280a0',
}

/** 背景色の明度からコントラストの高い文字色（黒/白）を選ぶ */
export function pickTextColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 150 ? '#1a1b1f' : '#ffffff'
}

/** タイプ色のバッジ用 style（背景＋自動文字色） */
export function typeBadgeStyle(type: TypeName): { backgroundColor: string; color: string } {
  const bg = TYPE_HEX[type] ?? '#5d626c'
  return { backgroundColor: bg, color: pickTextColor(bg) }
}

/** タイプの代表色（縦バー等に使用） */
export function typeColor(type: TypeName): string {
  return TYPE_HEX[type] ?? '#5d626c'
}
