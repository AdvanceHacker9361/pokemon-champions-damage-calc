import { calculateDamage } from '@/domain/calculators/DamageCalculator'
import { calculateHP, calculateNonHP, applyRankModifier } from '@/domain/calculators/StatCalculator'
import type { MoveData } from '@/domain/models/Move'
import type { BattleField } from '@/domain/models/BattleField'
import type { ComputedStats, TypeName, StatusCondition, StatKey, BaseStats } from '@/domain/models/Pokemon'
import type { SpDistribution } from '@/domain/models/StatPoints'
import type { StatNatures } from './CalculateStatsUseCase'
import { SP_MAX_STAT, SP_MAX_TOTAL } from '@/domain/constants/spLimits'

export interface DurabilitySearchInput {
  // 攻撃側（固定）
  attackerStats: ComputedStats
  attackerTypes: TypeName[]
  attackerAbility: string
  attackerItem: string | null
  attackerStatus: StatusCondition
  attackerAbilityActivated?: boolean
  attackerSupremeOverlordBoost?: number
  attackerProteanStab?: boolean
  attackerRankModifiers: Record<string, number>
  attackerWeight?: number
  // 技・フィールド
  move: MoveData
  field: BattleField
  // 防御側（最適化対象）
  defenderBaseStats: BaseStats
  defenderStatNatures: StatNatures
  defenderCurrentSp: SpDistribution
  defenderRanks: Partial<Record<StatKey, number>>
  defenderTypes: TypeName[]
  defenderAbility: string
  defenderItem: string | null
  defenderStatus: StatusCondition
  defenderAbilityActivated?: boolean
  defenderProteanType?: TypeName | null
  defenderWeight?: number
  // 最適化目標
  hitsToSurvive: 1 | 2
}

export interface DurabilityPoint {
  spH: number
  spDef: number
  defNature: 0.9 | 1.0 | 1.1
  hp: number
  defStat: number
  maxDmgPerHit: number
  remainHp: number
  totalSp: number
}

export interface DurabilitySearchResult {
  defStatLabel: 'B' | 'D'
  hitsToSurvive: 1 | 2
  budget: number
  currentMaxDmg: number
  points: DurabilityPoint[]
}

/** 防御側のSPをH + B/D に最適配分して確定耐えを達成する組み合わせを全列挙 */
export function findOptimalDurability(input: DurabilitySearchInput): DurabilitySearchResult {
  const isPhysical = input.move.category === '物理'
  const defStatKey: StatKey = isPhysical ? 'def' : 'spd'
  const defStatLabel = isPhysical ? 'B' : 'D'
  const baseDefStat = isPhysical ? input.defenderBaseStats.def : input.defenderBaseStats.spd
  const defRank = input.defenderRanks[defStatKey] ?? 0

  // H/B(or D) 以外のSPが使う合計（A, C, S と反対の防御ステ）
  const { hp: _hp, [defStatKey]: _def, ...otherSp } = input.defenderCurrentSp
  const fixedSpTotal = Object.values(otherSp).reduce((s, v) => s + v, 0)
  const budget = Math.max(0, SP_MAX_TOTAL - fixedSpTotal)

  // 現在設定でのmaxDmg
  const currentDefNature = input.defenderStatNatures[defStatKey] ?? 1.0
  const currentDefRaw = calculateNonHP(baseDefStat, input.defenderCurrentSp[defStatKey], currentDefNature as 0.9 | 1.0 | 1.1)
  const currentDefStat = defRank !== 0 ? applyRankModifier(currentDefRaw, defRank) : currentDefRaw
  const currentHp = calculateHP(input.defenderBaseStats.hp, input.defenderCurrentSp.hp)
  const currentMaxDmgResult = calculateDamage(buildCalcInput(input, currentDefStat, isPhysical, currentHp))
  const currentMaxDmg = currentMaxDmgResult.max

  const defNatures: (0.9 | 1.0 | 1.1)[] = [1.0, 1.1, 0.9]
  const results: DurabilityPoint[] = []
  const seen = new Set<string>()

  for (const defNature of defNatures) {
    for (let spDef = 0; spDef <= Math.min(SP_MAX_STAT, budget); spDef++) {
      const defRaw = calculateNonHP(baseDefStat, spDef, defNature)
      const defStat = defRank !== 0 ? applyRankModifier(defRaw, defRank) : defRaw

      const dmgResult = calculateDamage(buildCalcInput(input, defStat, isPhysical, 9999))
      const maxDmgPerHit = dmgResult.max
      if (maxDmgPerHit === 0) continue

      const targetHp = maxDmgPerHit * input.hitsToSurvive

      // 最小spHを二分探索
      let lo = 0, hi = SP_MAX_STAT, minSpH = -1
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2)
        if (calculateHP(input.defenderBaseStats.hp, mid) > targetHp) {
          minSpH = mid; hi = mid - 1
        } else {
          lo = mid + 1
        }
      }
      if (minSpH === -1) continue
      if (minSpH + spDef > budget) continue

      const hp = calculateHP(input.defenderBaseStats.hp, minSpH)
      const key = `${minSpH}-${spDef}-${defNature}`
      if (seen.has(key)) continue
      seen.add(key)

      results.push({
        spH: minSpH, spDef, defNature,
        hp, defStat,
        maxDmgPerHit,
        remainHp: hp - targetHp,
        totalSp: minSpH + spDef,
      })
    }
  }

  // 総SP昇順・残HP降順でソート
  results.sort((a, b) => a.totalSp - b.totalSp || b.remainHp - a.remainHp)

  return { defStatLabel, hitsToSurvive: input.hitsToSurvive, budget, currentMaxDmg, points: results }
}

function buildCalcInput(
  input: DurabilitySearchInput,
  defStat: number,
  isPhysical: boolean,
  hp: number,
) {
  const baseAtk = calculateNonHP(input.defenderBaseStats.atk, 0, 1.0)
  const baseSpa = calculateNonHP(input.defenderBaseStats.spa, 0, 1.0)
  const baseSpe = calculateNonHP(input.defenderBaseStats.spe, 0, 1.0)
  const baseDef = isPhysical
    ? defStat
    : calculateNonHP(input.defenderBaseStats.def, 0, 1.0)
  const baseSpd = isPhysical
    ? calculateNonHP(input.defenderBaseStats.spd, 0, 1.0)
    : defStat

  const defenderStats: ComputedStats = { hp, atk: baseAtk, def: baseDef, spa: baseSpa, spd: baseSpd, spe: baseSpe }

  return {
    attackerStats:              input.attackerStats,
    attackerTypes:              input.attackerTypes,
    attackerAbility:            input.attackerAbility,
    attackerItem:               input.attackerItem,
    attackerStatus:             input.attackerStatus,
    attackerAbilityActivated:   input.attackerAbilityActivated,
    attackerSupremeOverlordBoost: input.attackerSupremeOverlordBoost,
    attackerProteanStab:        input.attackerProteanStab,
    attackerRankModifiers:      input.attackerRankModifiers,
    attackerWeight:             input.attackerWeight,
    defenderStats,
    defenderTypes:              input.defenderTypes,
    defenderAbility:            input.defenderAbility,
    defenderItem:               input.defenderItem,
    defenderStatus:             input.defenderStatus,
    defenderAbilityActivated:   input.defenderAbilityActivated,
    defenderProteanType:        input.defenderProteanType,
    defenderWeight:             input.defenderWeight,
    move: input.move,
    field: input.field,
    isCritical: false,
  }
}
