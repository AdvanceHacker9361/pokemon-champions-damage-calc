import type { KoResult } from '@/domain/models/DamageResult'

/**
 * n発KO確率を動的計画法で計算する
 * @param rolls - Champions仕様: 15段階の乱数ロール（昇順、86〜100）
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

  // 乱数1発チェック（最大ロールは届くが最小ロールは届かない）
  if (maxRoll >= defenderHp) {
    const probability = calcKoProbabilityForNHits(rolls, defenderHp, 1)
    return { type: 'chance', hits: 1, probability }
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

/** 標準: 2〜5回ランダム（P(2)=1/3, P(3)=1/3, P(4)=1/6, P(5)=1/6） */
export const VARIABLE_MULTI_HIT_DIST: { hits: number; prob: number }[] = [
  { hits: 2, prob: 1 / 3 },
  { hits: 3, prob: 1 / 3 },
  { hits: 4, prob: 1 / 6 },
  { hits: 5, prob: 1 / 6 },
]

/** スキルリンク: 確定5発 */
export const VARIABLE_MULTI_HIT_DIST_SKILL_LINK: { hits: number; prob: number }[] = [
  { hits: 5, prob: 1.0 },
]

/** いかさまダイス: 4発/5発 各50% */
export const VARIABLE_MULTI_HIT_DIST_LOADED_DICE: { hits: number; prob: number }[] = [
  { hits: 4, prob: 0.5 },
  { hits: 5, prob: 0.5 },
]

/**
 * 特性・持ち物に応じた変動連続技ヒット分布を返す
 * @param attackerAbility 攻撃側の特性名
 * @param attackerItem    攻撃側の持ち物名
 */
export function getVariableMultiHitDist(
  attackerAbility: string,
  attackerItem: string | null,
): { hits: number; prob: number }[] {
  if (attackerAbility === 'スキルリンク') return VARIABLE_MULTI_HIT_DIST_SKILL_LINK
  if (attackerItem === 'いかさまダイス') return VARIABLE_MULTI_HIT_DIST_LOADED_DICE
  return VARIABLE_MULTI_HIT_DIST
}

export function calcVariableMultiHitKo(
  rolls: number[],
  defenderHp: number,
  dist = VARIABLE_MULTI_HIT_DIST,
): VariableMultiHitResult {
  const perHit = dist.map(({ hits, prob }) => ({
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
  const minHits = dist[0].hits
  const maxHits = dist[dist.length - 1].hits
  const minDmg = minRoll * minHits
  const maxDmg = maxRoll * maxHits
  const expectedDmg = dist.reduce(
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

/**
 * 複数の技・ポケモンによる複合ダメージの分布をDPで計算
 * @param rollSets 各技の乱数ロール配列（15段階）
 * @param offset 定数ダメージ（毒・砂嵐・残飯等の減算済み値）
 * @returns 累積ダメージ値 -> 確率 のMap
 */
export function calcCombinedDamageDistribution(
  rollSets: number[][],
  offset = 0,
): Map<number, number> {
  let dp: Map<number, number> = new Map([[offset, 1.0]])
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
  return dp
}

/**
 * 急所込みの攻撃スロット。
 * 通常ロールと急所ロールを急所率で混合する。
 * critRolls を省略または critChance=0 のときは通常ロールのみ採用（確定急所技や急所強制エントリ向け）。
 */
export interface AttackRollsWithCrit {
  rolls: number[]
  critRolls?: number[]
  /** 急所率 0〜1（例: 1/16 ≒ 0.0625, 1/8 = 0.125）。critRolls なしなら無視 */
  critChance: number
}

/**
 * 急所を確率的に混合した複合ダメージ分布をDPで計算
 */
export function calcCombinedDamageDistributionWithCrit(
  attacks: AttackRollsWithCrit[],
  offset = 0,
): Map<number, number> {
  let dp: Map<number, number> = new Map([[offset, 1.0]])
  for (const atk of attacks) {
    const { rolls, critRolls, critChance } = atk
    const useCrit = critRolls != null && critChance > 0
    const pNormal = useCrit ? 1 - critChance : 1
    const pCrit = useCrit ? critChance : 0
    const nNormal = rolls.length
    const nCrit = critRolls?.length ?? 0

    const next: Map<number, number> = new Map()
    for (const [dmg, prob] of dp) {
      if (pNormal > 0) {
        for (const roll of rolls) {
          const newDmg = dmg + roll
          next.set(newDmg, (next.get(newDmg) ?? 0) + (prob * pNormal) / nNormal)
        }
      }
      if (pCrit > 0 && critRolls) {
        for (const roll of critRolls) {
          const newDmg = dmg + roll
          next.set(newDmg, (next.get(newDmg) ?? 0) + (prob * pCrit) / nCrit)
        }
      }
    }
    dp = next
  }
  return dp
}

/**
 * 急所込み複合KO確率（分布から直接算出）
 */
export function calcCombinedKoProbabilityWithCrit(
  attacks: AttackRollsWithCrit[],
  defenderHp: number,
  offset = 0,
): number {
  const dist = calcCombinedDamageDistributionWithCrit(attacks, offset)
  let koProb = 0
  for (const [dmg, prob] of dist) {
    if (dmg >= defenderHp) koProb += prob
  }
  return Math.min(1, koProb)
}
