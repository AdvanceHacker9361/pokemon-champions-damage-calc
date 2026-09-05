import type { MoveRecord } from '@/data/schemas/types'
import type { SpecialMoveTag } from '@/domain/models/Move'

/**
 * moves.json 上の power が実値ではなくプレースホルダー（1）になっている特殊技。
 * 攻守の文脈（体重・S）が無い場面では数値を出さず「威力可変」と表示する。
 */
const PLACEHOLDER_POWER_TAGS = new Set<SpecialMoveTag>([
  'low-kick', 'grass-knot', 'gyro-ball', 'heavy-slam',
])

/**
 * 技チップに出す威力ラベル。
 * `selectedPower` には計算エンジンと同じ `resolveBasePower` で解決した威力を渡す想定。
 * 渡されない（検索結果など文脈がない）場合のみ静的データにフォールバックする。
 */
export function getPowerLabel(move: MoveRecord, selectedPower?: number | null): string | null {
  if (selectedPower != null) return `威力${selectedPower}`
  if (move.powerOptions && move.powerOptions.length > 0) return `威力${move.powerOptions.join('/')}`
  if (move.multiHit?.type === 'escalating') return `威力${move.multiHit.powers.join('→')}`
  if (move.special && PLACEHOLDER_POWER_TAGS.has(move.special)) return '威力可変'
  if (move.power != null) return `威力${move.power}`
  if (move.category === '変化') return null
  if (move.special) return '威力可変'
  return null
}
