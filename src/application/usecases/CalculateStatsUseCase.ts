import { calculateHP, calculateNonHP, applyRankModifier } from '@/domain/calculators/StatCalculator'
import type { NatureModifier } from '@/domain/constants/natureModifiers'
import type { ComputedStats, StatKey, BaseStats } from '@/domain/models/Pokemon'
import type { SpDistribution } from '@/domain/models/StatPoints'
import { STAT_KEYS } from '@/domain/models/Pokemon'

export type StatNatures = Partial<Record<StatKey, number>>

export interface CalculateStatsInput {
  baseStats: BaseStats
  sp: SpDistribution
  /** per-stat 性格倍率 (0.9 / 1.0 / 1.1). HP は常に 1.0。未指定は 1.0 */
  statNatures?: StatNatures
  ranks?: Partial<Record<StatKey, number>>
}

export function calculateStats(input: CalculateStatsInput): ComputedStats {
  const { baseStats, sp, statNatures = {}, ranks = {} } = input

  const n = (stat: StatKey): NatureModifier =>
    (statNatures[stat] ?? 1.0) as NatureModifier

  const rawStats: ComputedStats = {
    hp:  calculateHP(baseStats.hp, sp.hp),
    atk: calculateNonHP(baseStats.atk, sp.atk, n('atk')),
    def: calculateNonHP(baseStats.def, sp.def, n('def')),
    spa: calculateNonHP(baseStats.spa, sp.spa, n('spa')),
    spd: calculateNonHP(baseStats.spd, sp.spd, n('spd')),
    spe: calculateNonHP(baseStats.spe, sp.spe, n('spe')),
  }

  // ランク補正を適用（HP以外）
  const result: ComputedStats = { ...rawStats }
  for (const stat of STAT_KEYS) {
    if (stat === 'hp') continue
    const rank = ranks[stat] ?? 0
    if (rank !== 0) {
      result[stat] = applyRankModifier(rawStats[stat], rank)
    }
  }

  return result
}
