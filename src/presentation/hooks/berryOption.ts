import type { BerryConfig } from '@/presentation/store/progressionStore'
import type { BerryOption } from '@/domain/calculators/BattleSequenceCalc'

/**
 * ストアのきのみ設定（しきい値は最大HP%）を
 * `runBattleSequence` の実HPしきい値オプションへ変換する。
 * 回復量が 0（= きのみなし）のときは undefined を返す。
 */
export function toBerryOption(cfg: BerryConfig, maxHp: number): BerryOption | undefined {
  if (cfg.amount <= 0) return undefined
  return {
    threshold: Math.floor(maxHp * cfg.thresholdPct / 100),
    amount: cfg.amount,
    cudChew: cfg.cudChew,
    harvestChance: cfg.harvestChance,
  }
}
