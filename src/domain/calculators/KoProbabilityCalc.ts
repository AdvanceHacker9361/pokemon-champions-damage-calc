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
 * 連続技（2〜5回ランダム）のKO確率と期待ダメージを計算
 * 回数分布: P(2)=1/3, P(3)=1/3, P(4)=1/6, P(5)=1/6
 */
export interface VariableMultiHitResult {
  /** 各ヒット数ごとのKO確率 */
  perHit: { hits: number; prob: number; koProbForHits: number }[]
  /** 全回数分布を加重平均したKO確率 */
  totalKoProb: number
  /** 最小ダメージ（2回最小ロール）*/
  minDmg: number
  /** 最大ダメージ（5回最大ロール）*/
  maxDmg: number
  /** 期待値ダメージ（加重平均） */
  expectedDmg: number
}

export const VARIABLE_MULTI_HIT_DIST: { hits: number; prob: number }[] = [
  { hits: 2, prob: 1 / 3 },
  { hits: 3, prob: 1 / 3 },
  { hits: 4, prob: 1 / 6 },
  { hits: 5, prob: 1 / 6 },
]

export function calcVariableMultiHitKo(
  rolls: number[],
  defenderHp: number,
): VariableMultiHitResult {
  const perHit = VARIABLE_MULTI_HIT_DIST.map(({ hits, prob }) => ({
    hits,
    prob,
    koProbForHits: calcKoProbabilityForNHits(rolls, defenderHp, hits),
  }))

  const totalKoProb = Math.min(
    1,
    perHit.reduce((sum, { prob, koProbForHits }) => sum + prob * koProbForHits, 0),
  )

  const minRoll = rolls[0]
  const maxRoll = rolls[rolls.length - 1]
  const minDmg = minRoll * 2
  const maxDmg = maxRoll * 5
  const expectedDmg = VARIABLE_MULTI_HIT_DIST.reduce(
    (sum, { hits, prob }) => sum + ((minRoll + maxRoll) / 2) * hits * prob,
    0,
  )

  return { perHit, totalKoProb, minDmg, maxDmg, expectedDmg }
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
