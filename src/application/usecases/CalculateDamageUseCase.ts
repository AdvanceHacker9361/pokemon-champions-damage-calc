import { calculateDamage } from '@/domain/calculators/DamageCalculator'
import { calculateStats } from '@/application/usecases/CalculateStatsUseCase'
import type { StatNatures } from '@/application/usecases/CalculateStatsUseCase'
import type { DamageResult } from '@/domain/models/DamageResult'
import type { MoveData } from '@/domain/models/Move'
import type { BattleField } from '@/domain/models/BattleField'
import type { StatusCondition, StatKey, TypeName } from '@/domain/models/Pokemon'
import type { SpDistribution } from '@/domain/models/StatPoints'
import type { BaseStats } from '@/domain/models/Pokemon'

export interface PokemonBattleState {
  baseStats: BaseStats
  types: TypeName[]
  sp: SpDistribution
  statNatures?: StatNatures
  abilityName: string
  itemName: string | null
  ranks: Partial<Record<StatKey, number>>
  status: StatusCondition
  abilityActivated?: boolean
  supremeOverlordBoost?: number
  proteanType?: TypeName | null
  proteanStab?: boolean
  weight?: number
}

export interface CalculateDamageInput {
  attacker: PokemonBattleState
  defender: PokemonBattleState
  move: MoveData
  field: BattleField
  isCritical?: boolean
}

export function executeDamageCalculation(
  input: CalculateDamageInput,
): DamageResult {
  /** かたやぶり系: 相手の特性を無効化する特性 */
  const MOLD_BREAKER_ABILITIES = new Set(['かたやぶり', 'ターボブレイズ', 'テラボルテージ'])
  const attackerHasMoldBreaker = MOLD_BREAKER_ABILITIES.has(input.attacker.abilityName)

  // てんねん: 相手の攻撃/防御ランク補正を無効化して実数値を再計算
  // ただし攻撃側がかたやぶり系の場合はてんねんを無視してランク補正をそのまま採用
  const attackerRanks =
    input.defender.abilityName === 'てんねん' && !attackerHasMoldBreaker
      ? { ...input.attacker.ranks, atk: 0, spa: 0 }
      : input.attacker.ranks

  const defenderRanks =
    input.attacker.abilityName === 'てんねん'
      ? { ...input.defender.ranks, def: 0, spd: 0 }
      : input.defender.ranks

  const attackerStats = calculateStats({
    baseStats: input.attacker.baseStats,
    sp: input.attacker.sp,
    statNatures: input.attacker.statNatures,
    ranks: attackerRanks,
  })

  const defenderStats = calculateStats({
    baseStats: input.defender.baseStats,
    sp: input.defender.sp,
    statNatures: input.defender.statNatures,
    ranks: defenderRanks,
  })

  return calculateDamage({
    attackerStats,
    attackerTypes: input.attacker.types,
    attackerAbility: input.attacker.abilityName,
    attackerItem: input.attacker.itemName,
    attackerStatus: input.attacker.status,
    attackerAbilityActivated: input.attacker.abilityActivated,
    attackerSupremeOverlordBoost: input.attacker.supremeOverlordBoost,
    attackerProteanStab: input.attacker.proteanStab,
    attackerRankModifiers: input.attacker.ranks as Record<string, number>,
    attackerWeight: input.attacker.weight,
    defenderStats,
    defenderTypes: input.defender.types,
    defenderAbility: input.defender.abilityName,
    defenderItem: input.defender.itemName,
    defenderStatus: input.defender.status,
    defenderAbilityActivated: input.defender.abilityActivated,
    defenderProteanType: input.defender.proteanType,
    defenderWeight: input.defender.weight,
    move: input.move,
    field: input.field,
    isCritical: input.isCritical,
  })
}
