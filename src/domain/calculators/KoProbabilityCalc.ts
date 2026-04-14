import type { KoResult } from '@/domain/models/DamageResult'

/**
 * n発KO確率を動的計画法で計算する
 * @param rolls - 16段階の乱数ロール（昇順）
 * @param defenderHp - 防御側HP実数値
 * @param maxHits - 最大何発まで計算するか
 */
export function calcKoProbability(
  rolls: number[],
  defenderHp: number,
  maxHits = 4,
): KoResult {
  const nRolls = rolls.length
  const minRoll = rolls[0]
  const maxRoll = rolls[nRolls - 1]

  // 確定1発チェック
  if (minRoll >= defenderHp) {
    return { type: 'guaranteed', hits: 1 }
  }

  // nHKOを確認
  for (let hits = 2; hits <= maxHits; hits++) {
    const minTotal = minRoll * hits
    const maxTotal = maxRoll * hits

    if (minTotal >= defenderHp) {
      return { type: 'guaranteed', hits }
    }

    if (maxTotal >= defenderHp) {
      // 乱数n発 — 確率を計算
      const probability = calcKoProbabilityForNHits(rolls, defenderHp, hits)
      return { type: 'chance', hits, probability }
    }
  }

  return { type: 'no-ko' }
}

/**
 * n発でKOできる確率をDP計算（各乱数は等確率 1/16）
 * 外部から直接呼び出せるよう export
 */
export function calcKoProbabilityForNHits(
  rolls: number[],
  defenderHp: number,
  hits: number,
): number {
  const n = rolls.length
  // dp[i] = i 発目までの累積ダメージが各値になる確率
  // キーは累積ダメージ、値は確率
  let dp: Map<number, number> = new Map([[0, 1.0]])

  for (let hit = 0; hit < hits; hit++) {
    const next: Map<number, number> = new Map()
    for (const [dmg, prob] of dp) {
      for (const roll of rolls) {
        const newDmg = dmg + roll
        const rollProb = 1 / n
        next.set(newDmg, (next.get(newDmg) ?? 0) + prob * rollProb)
      }
    }
    dp = next
  }

  let koProb = 0
  for (const [dmg, prob] of dp) {
    if (dmg >= defenderHp) {
      koProb += prob
    }
  }
  return Math.min(1, koProb)
}

/**
 * 複数の技・ポケモンによる複合ダメージのKO確率をDP計算
 * 各rollSetから1ロールずつ独立に選んだ合計がdefenderHp以上になる確率
 */
export function calcCombinedKoProbability(
  rollSets: number[][],
  defenderHp: number,
): number {
  if (rollSets.length === 0) return 0

  let dp: Map<number, number> = new Map([[0, 1.0]])

  for (const rolls of rollSets) {
    const n = rolls.length
    const next: Map<number, number> = new Map()
    for (const [dmg, prob] of dp) {
      for (const roll of rolls) {
        const newDmg = dmg + roll
        next.set(newDmg, (next.get(newDmg) ?? 0) + prob / n)
      }
    }
    dp = next
  }

  let koProb = 0
  for (const [dmg, prob] of dp) {
    if (dmg >= defenderHp) koProb += prob
  }
  return Math.min(1, koProb)
}
