/**
 * 急所ランクテーブル（ランク 0〜3+ を確率にマッピング）
 * ランク0=1/16, +1=1/8, +2=1/2, +3=確定
 */
const CRIT_RANK_TABLE: number[] = [1 / 16, 1 / 8, 1 / 2, 1.0]

/** 急所ランク +1 を与えるアイテム */
const CRIT_RANK_PLUS1_ITEMS = new Set(['ピントレンズ', 'するどいツメ'])

/** 急所ランク +1 を与える特性 */
const CRIT_RANK_PLUS1_ABILITIES = new Set(['きょううん'])

export interface CritRankParams {
  /** 技の急所ランク補正 (move.critChance: 0=通常, 1=高急所技) */
  moveCritBonus: number
  attackerAbility: string
  attackerItem: string | null
  /** きあいだめ状態（+2ランク） */
  focusEnergyActive: boolean
}

/**
 * 急所率を計算する
 * ランク加算: 高急所技+1 / きょううん+1 / ピントレンズ・するどいツメ+1 / きあいだめ+2
 */
export function calcCritChance(params: CritRankParams): number {
  const { moveCritBonus, attackerAbility, attackerItem, focusEnergyActive } = params

  let rank = 0
  if (moveCritBonus >= 1) rank += 1
  if (CRIT_RANK_PLUS1_ABILITIES.has(attackerAbility)) rank += 1
  if (attackerItem && CRIT_RANK_PLUS1_ITEMS.has(attackerItem)) rank += 1
  if (focusEnergyActive) rank += 2

  return CRIT_RANK_TABLE[Math.min(rank, CRIT_RANK_TABLE.length - 1)]
}
