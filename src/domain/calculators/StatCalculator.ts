import type { NatureModifier } from '@/domain/constants/natureModifiers'

/**
 * Champions HP 計算式
 * floor((種族値×2 + 31 + SP) × 50 ÷ 100 + 60)
 * ※レベル50固定、IV31固定、HPのSPはそのまま加算（非HP統計の半分の効率）
 */
export function calculateHP(base: number, sp: number): number {
  return Math.floor((base * 2 + 31 + sp) * 50 / 100 + 60)
}

/**
 * Champions HP以外 計算式
 * floor(floor((種族値×2 + 31 + SP×2) × 50 ÷ 100 + 5) × 性格補正)
 * ※レベル50固定、IV31固定
 */
export function calculateNonHP(base: number, sp: number, nature: NatureModifier): number {
  const base_stat = Math.floor((base * 2 + 31 + sp * 2) * 50 / 100 + 5)
  return Math.floor(base_stat * nature)
}

/** ランク補正テーブル (-6 〜 +6) */
const RANK_TABLE: Record<number, number[]> = {
  '-6': [2, 8],
  '-5': [2, 7],
  '-4': [2, 6],
  '-3': [2, 5],
  '-2': [2, 4],
  '-1': [2, 3],
  '0':  [2, 2],
  '1':  [3, 2],
  '2':  [4, 2],
  '3':  [5, 2],
  '4':  [6, 2],
  '5':  [7, 2],
  '6':  [8, 2],
}

export function applyRankModifier(stat: number, rank: number): number {
  const [num, den] = RANK_TABLE[rank] ?? [2, 2]
  return Math.floor(stat * num / den)
}
