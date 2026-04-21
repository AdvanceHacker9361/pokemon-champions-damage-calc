import { calculateHP } from '@/domain/calculators/StatCalculator'
import { SP_MAX_STAT, SP_MAX_TOTAL } from '@/domain/constants/spLimits'
import type { SpDistribution } from '@/domain/models/StatPoints'

export interface AccumDurabilityInput {
  defenderBaseHp: number
  defenderCurrentSp: SpDistribution
  /** 現在の防御側設定に対する、技のみ最大合計 (usages 込み、定数・毒は除く) */
  movesMaxTotal: number
  /** 現在の防御側設定に対する、技のみ最小合計 */
  movesMinTotal: number
  constDmg: number
  constRec: number
  poisonTurns: number
}

export interface AccumDurabilityPoint {
  spH: number
  hp: number
  poisonTotal: number
  maxEffectiveDmg: number
  minEffectiveDmg: number
  remainHpWorst: number
  remainHpBest: number
  survivesMax: boolean
}

export interface AccumDurabilitySearchResult {
  budget: number
  currentSpH: number
  currentHp: number
  currentMaxDmg: number
  currentSurvives: boolean
  minSurvivingSpH: number | null
  points: AccumDurabilityPoint[]
}

function calcPoisonTotal(hp: number, turns: number): number {
  let sum = 0
  for (let i = 1; i <= turns; i++) {
    sum += Math.max(1, Math.floor((hp * i) / 16))
  }
  return sum
}

export function findOptimalAccumDurability(input: AccumDurabilityInput): AccumDurabilitySearchResult {
  const { hp: _hp, ...otherSp } = input.defenderCurrentSp
  const fixedSpTotal = Object.values(otherSp).reduce((s, v) => s + v, 0)
  const budget = Math.max(0, SP_MAX_TOTAL - fixedSpTotal)
  const spHMax = Math.min(SP_MAX_STAT, budget)

  const points: AccumDurabilityPoint[] = []
  for (let spH = 0; spH <= spHMax; spH++) {
    const hp = calculateHP(input.defenderBaseHp, spH)
    const poisonTotal = calcPoisonTotal(hp, input.poisonTurns)
    const maxEffectiveDmg = input.movesMaxTotal + input.constDmg - input.constRec + poisonTotal
    const minEffectiveDmg = input.movesMinTotal + input.constDmg - input.constRec + poisonTotal
    points.push({
      spH,
      hp,
      poisonTotal,
      maxEffectiveDmg,
      minEffectiveDmg,
      remainHpWorst: hp - maxEffectiveDmg,
      remainHpBest: hp - minEffectiveDmg,
      survivesMax: hp > maxEffectiveDmg,
    })
  }

  const minSurvivingPoint = points.find(p => p.survivesMax)
  const minSurvivingSpH = minSurvivingPoint ? minSurvivingPoint.spH : null

  const currentSpH = input.defenderCurrentSp.hp
  const currentPoint = points[Math.min(currentSpH, points.length - 1)]
  const currentHp = currentPoint?.hp ?? calculateHP(input.defenderBaseHp, currentSpH)
  const currentMaxDmg = currentPoint?.maxEffectiveDmg ?? 0
  const currentSurvives = currentPoint?.survivesMax ?? false

  return {
    budget,
    currentSpH,
    currentHp,
    currentMaxDmg,
    currentSurvives,
    minSurvivingSpH,
    points,
  }
}
