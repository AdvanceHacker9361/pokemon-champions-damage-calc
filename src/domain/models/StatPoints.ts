import { SP_MAX_STAT, SP_MAX_TOTAL } from '@/domain/constants/spLimits'
import type { StatKey } from '@/domain/models/Pokemon'
import { STAT_KEYS } from '@/domain/models/Pokemon'

export interface SpDistribution {
  hp: number
  atk: number
  def: number
  spa: number
  spd: number
  spe: number
}

export type SpValidationError =
  | { type: 'stat-exceeds-max'; stat: StatKey; value: number; max: number }
  | { type: 'total-exceeds-max'; total: number; max: number }
  | { type: 'negative-value'; stat: StatKey; value: number }

export function createSpDistribution(partial?: Partial<SpDistribution>): SpDistribution {
  return {
    hp:  partial?.hp  ?? 0,
    atk: partial?.atk ?? 0,
    def: partial?.def ?? 0,
    spa: partial?.spa ?? 0,
    spd: partial?.spd ?? 0,
    spe: partial?.spe ?? 0,
  }
}

export function getTotalSp(sp: SpDistribution): number {
  return STAT_KEYS.reduce((sum, key) => sum + sp[key], 0)
}

export function getRemainingsSp(sp: SpDistribution): number {
  return SP_MAX_TOTAL - getTotalSp(sp)
}

export function validateSpDistribution(sp: SpDistribution): SpValidationError[] {
  const errors: SpValidationError[] = []

  for (const stat of STAT_KEYS) {
    const value = sp[stat]
    if (value < 0) {
      errors.push({ type: 'negative-value', stat, value })
    } else if (value > SP_MAX_STAT) {
      errors.push({ type: 'stat-exceeds-max', stat, value, max: SP_MAX_STAT })
    }
  }

  const total = getTotalSp(sp)
  if (total > SP_MAX_TOTAL) {
    errors.push({ type: 'total-exceeds-max', total, max: SP_MAX_TOTAL })
  }

  return errors
}

export function isValidSpDistribution(sp: SpDistribution): boolean {
  return validateSpDistribution(sp).length === 0
}

export function withStat(sp: SpDistribution, stat: StatKey, value: number): SpDistribution {
  return { ...sp, [stat]: Math.max(0, Math.min(SP_MAX_STAT, value)) }
}
