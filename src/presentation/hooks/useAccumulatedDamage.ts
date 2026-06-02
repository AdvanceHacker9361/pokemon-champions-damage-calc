import { useMemo } from 'react'
import { useAccumStore } from '@/presentation/store/accumStore'
import {
  calcVariableHitsSingleUsageDist,
  calcVariableHitsSingleUsageDistWithCrit,
} from '@/domain/calculators/KoProbabilityCalc'
import {
  runBattleSequence,
  extractDefenderDamageDistribution,
  type SeqEvent,
} from '@/domain/calculators/BattleSequenceCalc'
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

/** 通常ロール + 急所ロールを critChance で混合した1発分の分布Map（攻撃ごとに独立急所判定） */
function mixToMap(rolls: number[], critRolls: number[] | undefined, critChance: number): Map<number, number> {
  const m = new Map<number, number>()
  const useCrit = critRolls != null && critChance > 0
  const pN = useCrit ? 1 - critChance : 1
  const nN = rolls.length
  for (const r of rolls) m.set(r, (m.get(r) ?? 0) + pN / nN)
  if (useCrit && critRolls) {
    const nC = critRolls.length
    for (const r of critRolls) m.set(r, (m.get(r) ?? 0) + critChance / nC)
  }
  return m
}

/**
 * 総合累積を「バトルシーケンス2Dエンジン」経由で計算する。
 * 攻撃側HPは固定（被ダメなし）の特殊ケースとして扱い、防御側HPの周辺分布を導出する。
 * 痛み分けはエントリ末尾で attackerHp 指定の painSplit イベントとして挿入。
 */
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

    // 各 entry id → そのエントリ後に発動する痛み分けの攻撃側HP配列
    const painSplitsByEntryId = new Map<string, number[]>()
    for (const ps of painSplits) {
      const arr = painSplitsByEntryId.get(ps.afterEntryId) ?? []
      arr.push(ps.attackerHp)
      painSplitsByEntryId.set(ps.afterEntryId, arr)
    }

    // 通常パス / 急所込みパスのイベント列を構築
    // 定数ダメ/回復は先頭に適用（痛み分けより前 = 現行と同じく初期オフセット相当）
    const normalEvents: SeqEvent[] = []
    const critEvents: SeqEvent[] = []
    if (totalConst > 0) {
      normalEvents.push({ kind: 'defenderConst', amount: totalConst })
      critEvents.push({ kind: 'defenderConst', amount: totalConst })
    } else if (totalConst < 0) {
      normalEvents.push({ kind: 'defenderRecover', amount: -totalConst })
      critEvents.push({ kind: 'defenderRecover', amount: -totalConst })
    }

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      for (let u = 0; u < e.usages; u++) {
        const isVeryFirst = i === 0 && u === 0
        const useRaw = !isVeryFirst && firstHadMultiscale
        const normalRolls = useRaw ? e.rawRolls : e.rolls
        const critRolls   = useRaw ? e.rawCritRolls : e.critRolls

        if (e.variableHitDist) {
          // 変動連続技: 1使用分のヒット数加重分布を precomputed Map として1イベントに集約
          const hit1Rolls = normalRolls
          const hit2plusRolls = e.rawRolls
          const dist = calcVariableHitsSingleUsageDist(hit1Rolls, e.variableHitDist, hit2plusRolls)
          normalEvents.push({ kind: 'attack', dmg: dist })

          if (e.isForcedCrit) {
            const critDist = calcVariableHitsSingleUsageDist(critRolls, e.variableHitDist, e.rawCritRolls)
            critEvents.push({ kind: 'attack', dmg: critDist })
          } else {
            const distWithCrit = calcVariableHitsSingleUsageDistWithCrit(
              hit1Rolls, critRolls, e.critChance, e.variableHitDist, hit2plusRolls, e.rawCritRolls,
            )
            critEvents.push({ kind: 'attack', dmg: distWithCrit })
          }
          continue
        }

        // 通常パス: 合算ロール（おやこあいは親+子合算の e.rolls）
        normalEvents.push({ kind: 'attack', dmg: normalRolls })

        // 急所込みパス
        if (e.pbChildRolls !== undefined) {
          // おやこあい: 親・子を独立イベントに分割して各発で独立急所判定
          const parentNorm = useRaw ? (e.pbParentRawRolls ?? normalRolls) : (e.pbParentRolls ?? normalRolls)
          const parentCrit = useRaw ? (e.pbParentRawCritRolls ?? critRolls) : (e.pbParentCritRolls ?? critRolls)
          const childNorm = e.pbChildRolls
          const childCrit = e.pbChildCritRolls ?? childNorm
          if (e.isForcedCrit) {
            critEvents.push({ kind: 'attack', dmg: parentNorm })
            critEvents.push({ kind: 'attack', dmg: childNorm })
          } else {
            critEvents.push({ kind: 'attack', dmg: mixToMap(parentNorm, parentCrit, e.critChance) })
            critEvents.push({ kind: 'attack', dmg: mixToMap(childNorm, childCrit, e.critChance) })
          }
        } else if (e.isForcedCrit) {
          critEvents.push({ kind: 'attack', dmg: normalRolls })
        } else {
          critEvents.push({ kind: 'attack', dmg: mixToMap(normalRolls, critRolls, e.critChance) })
        }
      }

      // このエントリ末尾の痛み分け（攻撃側HP固定）
      const splitsAfter = painSplitsByEntryId.get(e.id)
      if (splitsAfter) {
        for (const aHp of splitsAfter) {
          normalEvents.push({ kind: 'painSplit', attackerHp: aHp })
          critEvents.push({ kind: 'painSplit', attackerHp: aHp })
        }
      }
    }

    // 2Dエンジン実行（攻撃側HPは固定＝被ダメなし。痛み分けは attackerHp 指定で防御側のみ変換）
    // attackerMaxHp は使わないため 1 で十分（faintProb は常に0）
    const ATT_DUMMY = 1
    let distribution: Map<number, number>
    let combinedProb: number
    let combinedProbWithCrit: number

    if (normalEvents.length === 0) {
      distribution = new Map([[0, 1.0]])
      combinedProb = 0
      combinedProbWithCrit = 0
    } else {
      const normalResult = runBattleSequence(normalEvents, ATT_DUMMY, defenderMaxHp)
      const critResult   = runBattleSequence(critEvents, ATT_DUMMY, defenderMaxHp)
      distribution = extractDefenderDamageDistribution(normalResult, defenderMaxHp)
      combinedProb = normalResult.defenderKoProb
      combinedProbWithCrit = critResult.defenderKoProb
    }

    // totalMin / totalMax は分布の key 範囲から（撃破時はしきい値 defenderMaxHp に集約）
    let totalMin = totalConst
    let totalMax = totalConst
    {
      let mn = Infinity, mx = -Infinity
      for (const dmg of distribution.keys()) {
        if (dmg < mn) mn = dmg
        if (dmg > mx) mx = dmg
      }
      if (mn !== Infinity) { totalMin = mn; totalMax = mx }
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
