import { useMemo } from 'react'
import { useAccumStore } from '@/presentation/store/accumStore'
import {
  calcCombinedKoProbability,
  calcCombinedDamageDistribution,
  calcCombinedKoProbabilityWithCrit,
} from '@/domain/calculators/KoProbabilityCalc'
import type { AttackRollsWithCrit } from '@/domain/calculators/KoProbabilityCalc'
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
  /** 急所込み（各エントリの急所率で混合）KO確率 */
  combinedProbWithCrit: number
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

    // 最初のエントリがマルチスケイル半減済みの場合、2発目以降は素ダメを使う
    const firstHadMultiscale = entries.length > 0 && entries[0].hadMultiscale

    let moveMin = 0, moveMax = 0
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      if (firstHadMultiscale) {
        if (i === 0) {
          // 最初のエントリ: 1発目は半減済み、2発目以降は素ダメ
          moveMin += e.minDmg + e.rawMin * (e.usages - 1)
          moveMax += e.maxDmg + e.rawMax * (e.usages - 1)
        } else {
          // 2エントリ目以降: HP満タンでないので常に素ダメ
          moveMin += e.rawMin * e.usages
          moveMax += e.rawMax * e.usages
        }
      } else {
        moveMin += e.minDmg * e.usages
        moveMax += e.maxDmg * e.usages
      }
    }

    const totalMin = moveMin + totalConst
    const totalMax = moveMax + totalConst
    const totalMinPct = defenderMaxHp > 0 ? totalMin / defenderMaxHp * 100 : 0
    const totalMaxPct = defenderMaxHp > 0 ? totalMax / defenderMaxHp * 100 : 0

    // ロールセット: 最初エントリがマルチスケイル発動時は、先頭1発だけ半減ロール、残りは素ダメロール
    const rollSets: number[][] = []
    const attackRollsWithCrit: AttackRollsWithCrit[] = []
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      for (let u = 0; u < e.usages; u++) {
        const isVeryFirst = i === 0 && u === 0
        const useRaw = !isVeryFirst && firstHadMultiscale
        const normalRolls = useRaw ? e.rawRolls : e.rolls
        const critRolls  = useRaw ? e.rawCritRolls : e.critRolls
        rollSets.push(normalRolls)

        if (e.pbChildRolls !== undefined) {
          // おやこあい: 親と子を独立スロットに分割して急所込み計算
          // 通常KO確率（rollSets）は合算ロール（e.rolls）のまま変えない
          const parentNorm = useRaw ? (e.pbParentRawRolls ?? normalRolls) : (e.pbParentRolls ?? normalRolls)
          const parentCrit = useRaw ? (e.pbParentRawCritRolls ?? critRolls) : (e.pbParentCritRolls ?? critRolls)
          const childNorm = e.pbChildRolls
          const childCrit = e.pbChildCritRolls ?? childNorm
          if (e.isForcedCrit) {
            attackRollsWithCrit.push({ rolls: parentNorm, critChance: 0 })
            attackRollsWithCrit.push({ rolls: childNorm, critChance: 0 })
          } else {
            attackRollsWithCrit.push({ rolls: parentNorm, critRolls: parentCrit, critChance: e.critChance })
            attackRollsWithCrit.push({ rolls: childNorm, critRolls: childCrit, critChance: e.critChance })
          }
        } else if (e.isForcedCrit) {
          // 急所強制エントリは再混合せず normalRolls をそのまま
          attackRollsWithCrit.push({ rolls: normalRolls, critChance: 0 })
        } else {
          attackRollsWithCrit.push({
            rolls: normalRolls,
            critRolls,
            critChance: e.critChance,
          })
        }
      }
    }
    const combinedProb = hasEntries
      ? calcCombinedKoProbability(rollSets, effectiveHp)
      : totalConst >= defenderMaxHp ? 1 : 0

    const combinedProbWithCrit = hasEntries
      ? calcCombinedKoProbabilityWithCrit(attackRollsWithCrit, effectiveHp)
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
      combinedProb, combinedProbWithCrit,
      distribution, accumKoResult,
    }
  }, [entries, constDmg, constRec, poisonTurns, defenderMaxHp])
}
