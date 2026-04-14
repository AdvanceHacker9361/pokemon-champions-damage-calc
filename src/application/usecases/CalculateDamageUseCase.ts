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
  const attackerStats = calculateStats({
    baseStats: input.attacker.baseStats,
    sp: input.attacker.sp,
    statNatures: input.attacker.statNatures,
    ranks: input.attacker.ranks,
  })

  const defenderStats = calculateStats({
    baseStats: input.defender.baseStats,
    sp: input.defender.sp,
    statNatures: input.defender.statNatures,
    ranks: input.defender.ranks,
  })

  return calculateDamage({
    attackerStats,
    attackerTypes: input.attacker.types,
    attackerAbility: input.attacker.abilityName,
    attackerItem: input.attacker.itemName,
    attackerStatus: input.attacker.status,
    attackerRankModifiers: input.attacker.ranks as Record<string, number>,
    attackerWeight: input.attacker.weight,
    defenderStats,
    defenderTypes: input.defender.types,
    defenderAbility: input.defender.abilityName,
    defenderItem: input.defender.itemName,
    defenderStatus: input.defender.status,
    defenderWeight: input.defender.weight,
    move: input.move,
    field: input.field,
    isCritical: input.isCritical,
  })
}
