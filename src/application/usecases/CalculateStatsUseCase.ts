import { calculateHP, calculateNonHP, applyRankModifier } from '@/domain/calculators/StatCalculator'
import { getNatureModifier } from '@/domain/constants/natureModifiers'
import type { ComputedStats, StatKey, BaseStats } from '@/domain/models/Pokemon'
import type { SpDistribution } from '@/domain/models/StatPoints'
import { STAT_KEYS } from '@/domain/models/Pokemon'

export interface CalculateStatsInput {
  baseStats: BaseStats
  sp: SpDistribution
  natureName: string
  ranks?: Partial<Record<StatKey, number>>
}

export function calculateStats(input: CalculateStatsInput): ComputedStats {
  const { baseStats, sp, natureName, ranks = {} } = input

  const rawStats: ComputedStats = {
    hp:  calculateHP(baseStats.hp, sp.hp),
    atk: calculateNonHP(baseStats.atk, sp.atk, getNatureModifier(natureName, 'atk')),
    def: calculateNonHP(baseStats.def, sp.def, getNatureModifier(natureName, 'def')),
    spa: calculateNonHP(baseStats.spa, sp.spa, getNatureModifier(natureName, 'spa')),
    spd: calculateNonHP(baseStats.spd, sp.spd, getNatureModifier(natureName, 'spd')),
    spe: calculateNonHP(baseStats.spe, sp.spe, getNatureModifier(natureName, 'spe')),
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
