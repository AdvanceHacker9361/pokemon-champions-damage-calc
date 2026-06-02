import { useMemo } from 'react'
import { useAccumStore } from '@/presentation/store/accumStore'
import {
  calcCombinedDamageDistribution,
  calcCombinedDamageDistributionWithCrit,
  calcVariableHitsSingleUsageDist,
  calcVariableHitsSingleUsageDistWithCrit,
  applyPainSplitToDmgDist,
} from '@/domain/calculators/KoProbabilityCalc'
import type { AttackSlot } from '@/domain/calculators/KoProbabilityCalc'
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

interface Segment {
  rollSets: (number[] | Map<number, number>)[]
  attackRollsWithCrit: AttackSlot[]
  /** このセグメント終端で発動する痛み分けの攻撃側HP（連続適用） */
  painSplitAttackerHps: number[]
}

export function useAccumulatedDamage(defenderMaxHp: number): AccumulatedDamage {
  const entries     = useAccumStore(s => s.entries)
  const painSplits  = useAccumStore(s => s.painSplits)
  const constDmg    = useAccumStore(s => s.constDmg)
  const constRec    = useAccumStore(s => s.constRec)
  const poisonTurns = useAccumStore(s => s.poisonTurns)

  return useMemo(() => {
    const poisonPerTurn = Array.from({ length: poisonTurns }, (_, i) =>
      Math.max(1, Math.floor(defenderMaxHp * (i + 1) / 16))
    )
    const poisonTotal = poisonPerTurn.reduce((s, v) => s + v, 0)
    const totalConst = constDmg + poisonTotal - constRec

    const hasEntries = entries.length > 0
    const hasAnything = hasEntries || totalConst !== 0

    // 最初のエントリがマルチスケイル半減済みの場合、2発目以降は素ダメを使う
    const firstHadMultiscale = entries.length > 0 && entries[0].hadMultiscale

    // 各 entry id → そのエントリ後に発動する痛み分けの配列（挿入順）
    const painSplitsByEntryId = new Map<string, number[]>()
    for (const ps of painSplits) {
      const arr = painSplitsByEntryId.get(ps.afterEntryId) ?? []
      arr.push(ps.attackerHp)
      painSplitsByEntryId.set(ps.afterEntryId, arr)
    }

    // ロールセット: 最初エントリがマルチスケイル発動時は、先頭1発だけ半減ロール、残りは素ダメロール
    // 変動連続技（variableHitDist あり）は1使用分の分布を事前計算してスロットに入れる
    // 痛み分けが挿入されているエントリの後ろで segment を切る
    const segments: Segment[] = [{ rollSets: [], attackRollsWithCrit: [], painSplitAttackerHps: [] }]
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      const seg = segments[segments.length - 1]
      for (let u = 0; u < e.usages; u++) {
        const isVeryFirst = i === 0 && u === 0
        const useRaw = !isVeryFirst && firstHadMultiscale
        const normalRolls = useRaw ? e.rawRolls : e.rolls
        const critRolls  = useRaw ? e.rawCritRolls : e.critRolls

        if (e.variableHitDist) {
          // 変動連続技: 1使用分のダメージ分布（ヒット数加重）を precomputed Map として 1スロットに集約
          // hit1 はマルチスケイル/半減実の影響を受けるロール（useRaw 時は素ダメ）、hit2+ は常に素ダメ
          const hit1Rolls = normalRolls
          const hit2plusRolls = e.rawRolls
          const dist = calcVariableHitsSingleUsageDist(hit1Rolls, e.variableHitDist, hit2plusRolls)
          seg.rollSets.push(dist)

          if (e.isForcedCrit) {
            // 急所強制（確定急所技 or 急所モードで加算）: 急所ロールで分布を構築
            const hit1CritRolls = critRolls
            const hit2plusCritRolls = e.rawCritRolls
            const critDist = calcVariableHitsSingleUsageDist(hit1CritRolls, e.variableHitDist, hit2plusCritRolls)
            seg.attackRollsWithCrit.push({ precomputed: critDist })
          } else {
            // 各発で独立に急所判定して通常/急所ロールを混合
            const distWithCrit = calcVariableHitsSingleUsageDistWithCrit(
              hit1Rolls,
              critRolls,
              e.critChance,
              e.variableHitDist,
              hit2plusRolls,
              e.rawCritRolls,
            )
            seg.attackRollsWithCrit.push({ precomputed: distWithCrit })
          }
          continue
        }

        seg.rollSets.push(normalRolls)

        if (e.pbChildRolls !== undefined) {
          // おやこあい: 親と子を独立スロットに分割して急所込み計算
          // 通常KO確率（rollSets）は合算ロール（e.rolls）のまま変えない
          const parentNorm = useRaw ? (e.pbParentRawRolls ?? normalRolls) : (e.pbParentRolls ?? normalRolls)
          const parentCrit = useRaw ? (e.pbParentRawCritRolls ?? critRolls) : (e.pbParentCritRolls ?? critRolls)
          const childNorm = e.pbChildRolls
          const childCrit = e.pbChildCritRolls ?? childNorm
          if (e.isForcedCrit) {
            seg.attackRollsWithCrit.push({ rolls: parentNorm, critChance: 0 })
            seg.attackRollsWithCrit.push({ rolls: childNorm, critChance: 0 })
          } else {
            seg.attackRollsWithCrit.push({ rolls: parentNorm, critRolls: parentCrit, critChance: e.critChance })
            seg.attackRollsWithCrit.push({ rolls: childNorm, critRolls: childCrit, critChance: e.critChance })
          }
        } else if (e.isForcedCrit) {
          // 急所強制エントリは再混合せず normalRolls をそのまま
          seg.attackRollsWithCrit.push({ rolls: normalRolls, critChance: 0 })
        } else {
          seg.attackRollsWithCrit.push({
            rolls: normalRolls,
            critRolls,
            critChance: e.critChance,
          })
        }
      }

      // このエントリの全 usages 終了後に痛み分け挿入があれば、セグメントを切る
      const splitsAfter = painSplitsByEntryId.get(e.id)
      if (splitsAfter && splitsAfter.length > 0) {
        seg.painSplitAttackerHps.push(...splitsAfter)
        segments.push({ rollSets: [], attackRollsWithCrit: [], painSplitAttackerHps: [] })
      }
    }

    // セグメント毎に DP を順次実行
    let distribution: Map<number, number> = new Map([[totalConst, 1.0]])
    let distributionCrit: Map<number, number> = new Map([[totalConst, 1.0]])
    for (const seg of segments) {
      if (seg.rollSets.length > 0) {
        distribution = calcCombinedDamageDistribution(seg.rollSets, distribution)
      }
      if (seg.attackRollsWithCrit.length > 0) {
        distributionCrit = calcCombinedDamageDistributionWithCrit(seg.attackRollsWithCrit, distributionCrit)
      }
      for (const aHp of seg.painSplitAttackerHps) {
        distribution = applyPainSplitToDmgDist(distribution, defenderMaxHp, aHp)
        distributionCrit = applyPainSplitToDmgDist(distributionCrit, defenderMaxHp, aHp)
      }
    }

    // KO確率は最終分布から
    function koProbFromDist(d: Map<number, number>): number {
      let p = 0
      for (const [dmg, prob] of d) {
        if (dmg >= defenderMaxHp) p += prob
      }
      return Math.min(1, p)
    }
    const combinedProb = hasEntries
      ? koProbFromDist(distribution)
      : totalConst >= defenderMaxHp ? 1 : 0
    const combinedProbWithCrit = hasEntries
      ? koProbFromDist(distributionCrit)
      : totalConst >= defenderMaxHp ? 1 : 0

    // totalMin / totalMax は最終分布の key 範囲から
    // 痛み分けで残HPが変動するため、単純な moveMin + totalConst では算出不可
    let totalMin = totalConst
    let totalMax = totalConst
    if (hasEntries) {
      let mn = Infinity, mx = -Infinity
      for (const dmg of distribution.keys()) {
        if (dmg < mn) mn = dmg
        if (dmg > mx) mx = dmg
      }
      totalMin = mn === Infinity ? totalConst : mn
      totalMax = mx === -Infinity ? totalConst : mx
    }
    const totalMinPct = defenderMaxHp > 0 ? totalMin / defenderMaxHp * 100 : 0
    const totalMaxPct = defenderMaxHp > 0 ? totalMax / defenderMaxHp * 100 : 0

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
  }, [entries, painSplits, constDmg, constRec, poisonTurns, defenderMaxHp])
}
