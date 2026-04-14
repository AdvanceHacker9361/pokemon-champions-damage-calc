import { useMemo } from 'react'
import { calculateStats } from '@/application/usecases/CalculateStatsUseCase'
import type { ComputedStats, StatKey } from '@/domain/models/Pokemon'
import type { BaseStats } from '@/domain/models/Pokemon'
import type { SpDistribution } from '@/domain/models/StatPoints'

export function useStatCalc(
  baseStats: BaseStats,
  sp: SpDistribution,
  natureName: string,
  ranks: Partial<Record<StatKey, number>> = {},
): ComputedStats {
  return useMemo(
    () => calculateStats({ baseStats, sp, natureName, ranks }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      baseStats.hp, baseStats.atk, baseStats.def,
      baseStats.spa, baseStats.spd, baseStats.spe,
      sp.hp, sp.atk, sp.def, sp.spa, sp.spd, sp.spe,
      natureName,
      ranks.atk, ranks.def, ranks.spa, ranks.spd, ranks.spe, ranks.spe,
    ],
  )
}
