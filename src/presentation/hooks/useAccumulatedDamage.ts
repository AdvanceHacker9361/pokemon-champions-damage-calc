import { useMemo } from 'react'
import { useAccumStore } from '@/presentation/store/accumStore'
import {
  calcCombinedKoProbability,
  calcCombinedDamageDistribution,
} from '@/domain/calculators/KoProbabilityCalc'
import type { KoResult } from '@/domain/models/DamageResult'

export interface AccumulatedDamage {
  hasEntries: boolean
  hasAnything: boolean
  totalMin: number
  totalMax: number
  totalMinPct: number
  totalMaxPct: number
  totalConst: number
  poisonTotal: number
  poisonPerTurn: number[]
  combinedProb: number
  distribution: Map<number, number>
  accumKoResult: KoResult
}

export function useAccumulatedDamage(defenderMaxHp: number): AccumulatedDamage {
  const entries     = useAccumStore(s => s.entries)
  const constDmg    = useAccumStore(s => s.constDmg)
  const constRec    = useAccumStore(s => s.constRec)
  const poisonTurns = useAccumStore(s => s.poisonTurns)

  return useMemo(() => {
    const poisonPerTurn = Array.from({ length: poisonTurns }, (_, i) =>
      Math.max(1, Math.floor(defenderMaxHp * (i + 1) / 16))
    )
    const poisonTotal = poisonPerTurn.reduce((s, v) => s + v, 0)
    const totalConst = constDmg + poisonTotal - constRec
    const effectiveHp = Math.max(1, defenderMaxHp - totalConst)

    const hasEntries = entries.length > 0
    const hasAnything = hasEntries || totalConst !== 0

    const moveMin = entries.reduce((s, e) => s + e.minDmg * e.usages, 0)
    const moveMax = entries.reduce((s, e) => s + e.maxDmg * e.usages, 0)
    const totalMin = moveMin + totalConst
    const totalMax = moveMax + totalConst
    const totalMinPct = defenderMaxHp > 0 ? totalMin / defenderMaxHp * 100 : 0
    const totalMaxPct = defenderMaxHp > 0 ? totalMax / defenderMaxHp * 100 : 0

    const rollSets = entries.flatMap(e => Array<number[]>(e.usages).fill(e.rolls))
    const combinedProb = hasEntries
      ? calcCombinedKoProbability(rollSets, effectiveHp)
      : totalConst >= defenderMaxHp ? 1 : 0

    const distribution = hasEntries
      ? calcCombinedDamageDistribution(rollSets, totalConst)
      : new Map<number, number>([[totalConst, 1.0]])

    const accumKoResult: KoResult =
      combinedProb >= 1.0 ? { type: 'guaranteed', hits: 1 }
      : combinedProb > 0 ? { type: 'chance', hits: 1, probability: combinedProb }
      : { type: 'no-ko' }

    return {
      hasEntries, hasAnything,
      totalMin, totalMax, totalMinPct, totalMaxPct,
      totalConst, poisonTotal, poisonPerTurn,
      combinedProb, distribution, accumKoResult,
    }
  }, [entries, constDmg, constRec, poisonTurns, defenderMaxHp])
}
