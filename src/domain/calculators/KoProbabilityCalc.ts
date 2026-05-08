import type { KoResult } from '@/domain/models/DamageResult'

/**
 * n発KO確率を動的計画法で計算する
 * @param rolls - Champions仕様: 16段階の乱数ロール（昇順、85〜100）
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
 * @param rawRolls - 2発目以降に使うロール列。
 *   - `number[]`: 全ての2発目以降に同じロールを使用
 *   - `number[][]`: ヒット番号ごとの個別ロール（[hit2, hit3, hit4, ...]）。
 *     エントリ数が足りない場合は最後のエントリを再利用する。
 */
export function calcKoProbabilityForNHits(
  rolls: number[],
  defenderHp: number,
  hits: number,
  rawRolls?: number[] | number[][],
): number {
  // 与えられた hit 番号（1-indexed）に対応するロール列を返す
  const isPerHit = Array.isArray(rawRolls) && rawRolls.length > 0 && Array.isArray(rawRolls[0])
  function getHitRolls(hitNum: number): number[] {
    if (hitNum === 1) return rolls
    if (!rawRolls) return rolls
    if (isPerHit) {
      const arr = rawRolls as number[][]
      const idx = Math.min(hitNum - 2, arr.length - 1)
      return arr[idx]
    }
    return rawRolls as number[]
  }

  // dp[i] = i 発目までの累積ダメージが各値になる確率
  let dp: Map<number, number> = new Map([[0, 1.0]])

  for (let hit = 0; hit < hits; hit++) {
    const hitRolls = getHitRolls(hit + 1)
    const n = hitRolls.length
    const next: Map<number, number> = new Map()
    for (const [dmg, prob] of dp) {
      for (const roll of hitRolls) {
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
  /**
   * 2発目以降に使うロール列。
   * - `number[]`: 全ての2発目以降に同じロールを使用
   * - `number[][]`: ヒット番号ごとの個別ロール（[hit2, hit3, hit4, ...]）。
   *   くだけるよろい段階低下のように、各発で異なるロールが必要な場合に使用。
   */
  rawRolls?: number[] | number[][],
): VariableMultiHitResult {
  const perHit = dist.map(({ hits, prob }) => ({
    hits,
    prob,
    koProbForHits: calcKoProbabilityForNHits(rolls, defenderHp, hits, rawRolls),
  }))

  const totalKoProb = Math.min(
    1,
    perHit.reduce((sum, { prob, koProbForHits }) => sum + prob * koProbForHits, 0),
  )

  const isPerHit = Array.isArray(rawRolls) && rawRolls.length > 0 && Array.isArray(rawRolls[0])
  function getHitRolls(hitNum: number): number[] {
    if (hitNum === 1) return rolls
    if (!rawRolls) return rolls
    if (isPerHit) {
      const arr = rawRolls as number[][]
      const idx = Math.min(hitNum - 2, arr.length - 1)
      return arr[idx]
    }
    return rawRolls as number[]
  }

  function sumOverHits(numHits: number, picker: (rolls: number[]) => number): number {
    let total = 0
    for (let h = 1; h <= numHits; h++) total += picker(getHitRolls(h))
    return total
  }

  const minHits = dist[0].hits
  const maxHits = dist[dist.length - 1].hits
  const minDmg = sumOverHits(minHits, r => r[0])
  const maxDmg = sumOverHits(maxHits, r => r[r.length - 1])
  const expectedDmg = dist.reduce(
    (sum, { hits, prob }) => sum + sumOverHits(hits, r => (r[0] + r[r.length - 1]) / 2) * prob,
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
 * @param rollSets 各技の乱数ロール配列（16段階）
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

/**
 * 変動連続技の急所込みKO確率と期待ダメージ。
 * - ヒット数分布で重み付け
 * - 各発で独立に急所判定（critChance）して通常/急所ロールを混合
 * - rawRolls / rawCritRolls が `number[][]` の場合はヒット番号ごとの個別ロール
 *   （くだけるよろい段階低下: B-1, B-2, B-3, B-4）に対応
 */
export function calcVariableMultiHitKoWithCrit(
  rolls: number[],
  critRolls: number[],
  critChance: number,
  defenderHp: number,
  dist = VARIABLE_MULTI_HIT_DIST,
  rawRolls?: number[] | number[][],
  rawCritRolls?: number[] | number[][],
): VariableMultiHitResult {
  function isPerHit(r?: number[] | number[][]): boolean {
    return Array.isArray(r) && r.length > 0 && Array.isArray(r[0])
  }
  function getHitRolls(
    base: number[],
    raw: number[] | number[][] | undefined,
    hitNum: number,
  ): number[] {
    if (hitNum === 1) return base
    if (!raw) return base
    if (isPerHit(raw)) {
      const arr = raw as number[][]
      const idx = Math.min(hitNum - 2, arr.length - 1)
      return arr[idx]
    }
    return raw as number[]
  }

  const perHit = dist.map(({ hits, prob }) => {
    const attacks: AttackRollsWithCrit[] = Array.from({ length: hits }, (_, i) => ({
      rolls: getHitRolls(rolls, rawRolls, i + 1),
      critRolls: getHitRolls(critRolls, rawCritRolls, i + 1),
      critChance,
    }))
    const koProbForHits = calcCombinedKoProbabilityWithCrit(attacks, defenderHp)
    return { hits, prob, koProbForHits }
  })

  const totalKoProb = Math.min(
    1,
    perHit.reduce((sum, { prob, koProbForHits }) => sum + prob * koProbForHits, 0),
  )

  // 期待ダメ・min/max は急所込み（critChance で通常/急所を加重平均）
  function avgPerHit(hitNum: number): number {
    const r = getHitRolls(rolls, rawRolls, hitNum)
    const cr = getHitRolls(critRolls, rawCritRolls, hitNum)
    const avgNormal = (r[0] + r[r.length - 1]) / 2
    const avgCrit = (cr[0] + cr[cr.length - 1]) / 2
    return critChance * avgCrit + (1 - critChance) * avgNormal
  }

  const minHits = dist[0].hits
  const maxHits = dist[dist.length - 1].hits
  // min/max は通常ロール基準（pessimistic）/ 急所最大ロール基準（optimistic）
  let minDmg = 0
  for (let h = 1; h <= minHits; h++) minDmg += getHitRolls(rolls, rawRolls, h)[0]
  let maxDmg = 0
  for (let h = 1; h <= maxHits; h++) {
    const cr = getHitRolls(critRolls, rawCritRolls, h)
    maxDmg += cr[cr.length - 1]
  }

  const expectedDmg = dist.reduce((sum, { hits, prob }) => {
    let avgTotal = 0
    for (let h = 1; h <= hits; h++) avgTotal += avgPerHit(h)
    return sum + avgTotal * prob
  }, 0)

  return { perHit, totalKoProb, minDmg, maxDmg, expectedDmg }
}
