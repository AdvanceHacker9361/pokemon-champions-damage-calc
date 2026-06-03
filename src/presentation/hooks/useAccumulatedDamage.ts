import { useMemo } from 'react'
import { useProgressionStore } from '@/presentation/store/progressionStore'
import type { ProgressionEvent } from '@/presentation/store/progressionStore'
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
  combinedProbWithCrit: number
  distribution: Map<number, number>
  accumKoResult: KoResult
}

/** 通常ロール + 急所ロールを critChance で混合した1発分の分布Map */
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
 * 攻撃イベントから通常パス・急所込みパスの SeqEvent を構築（usages 展開・マルチスケイル継承）。
 * 旧 useAccumulatedDamage のロジックそのまま。
 */
function expandAttack(
  e: Extract<ProgressionEvent, { kind: 'attack' }>,
  isFirstOverall: boolean,
  firstHadMultiscale: boolean,
): { normal: SeqEvent[]; crit: SeqEvent[] } {
  const normal: SeqEvent[] = []
  const crit: SeqEvent[] = []
  for (let u = 0; u < e.usages; u++) {
    const isVeryFirst = isFirstOverall && u === 0
    const useRaw = !isVeryFirst && firstHadMultiscale
    const normalRolls = useRaw ? e.rawRolls : e.rolls
    const critRolls   = useRaw ? e.rawCritRolls : e.critRolls

    if (e.variableHitDist) {
      const hit1Rolls = normalRolls
      const hit2plusRolls = e.rawRolls
      const dist = calcVariableHitsSingleUsageDist(hit1Rolls, e.variableHitDist, hit2plusRolls)
      normal.push({ kind: 'attack', dmg: dist })
      if (e.isForcedCrit) {
        const critDist = calcVariableHitsSingleUsageDist(critRolls, e.variableHitDist, e.rawCritRolls)
        crit.push({ kind: 'attack', dmg: critDist })
      } else {
        const distWithCrit = calcVariableHitsSingleUsageDistWithCrit(
          hit1Rolls, critRolls, e.critChance, e.variableHitDist, hit2plusRolls, e.rawCritRolls,
        )
        crit.push({ kind: 'attack', dmg: distWithCrit })
      }
      continue
    }

    normal.push({ kind: 'attack', dmg: normalRolls })

    if (e.pbChildRolls !== undefined) {
      const parentNorm = useRaw ? (e.pbParentRawRolls ?? normalRolls) : (e.pbParentRolls ?? normalRolls)
      const parentCrit = useRaw ? (e.pbParentRawCritRolls ?? critRolls) : (e.pbParentCritRolls ?? critRolls)
      const childNorm = e.pbChildRolls
      const childCrit = e.pbChildCritRolls ?? childNorm
      if (e.isForcedCrit) {
        crit.push({ kind: 'attack', dmg: parentNorm })
        crit.push({ kind: 'attack', dmg: childNorm })
      } else {
        crit.push({ kind: 'attack', dmg: mixToMap(parentNorm, parentCrit, e.critChance) })
        crit.push({ kind: 'attack', dmg: mixToMap(childNorm, childCrit, e.critChance) })
      }
    } else if (e.isForcedCrit) {
      crit.push({ kind: 'attack', dmg: normalRolls })
    } else {
      crit.push({ kind: 'attack', dmg: mixToMap(normalRolls, critRolls, e.critChance) })
    }
  }
  return { normal, crit }
}

export function useAccumulatedDamage(defenderMaxHp: number): AccumulatedDamage {
  const events      = useProgressionStore(s => s.events)
  const constDmg    = useProgressionStore(s => s.constDmg)
  const constRec    = useProgressionStore(s => s.constRec)
  const poisonTurns = useProgressionStore(s => s.poisonTurns)

  return useMemo(() => {
    const poisonPerTurn = Array.from({ length: poisonTurns }, (_, i) =>
      Math.max(1, Math.floor(defenderMaxHp * (i + 1) / 16))
    )
    const poisonTotal = poisonPerTurn.reduce((s, v) => s + v, 0)
    const totalConst = constDmg + poisonTotal - constRec

    const attackEvents = events.filter(e => e.kind === 'attack')
    const hasEntries = attackEvents.length > 0
    const hasAnything = events.length > 0 || totalConst !== 0

    // 最初の attack イベントがマルチスケイル発動中なら、2発目以降は素ダメ
    const firstAttack = attackEvents[0]
    const firstHadMultiscale = firstAttack?.hadMultiscale ?? false

    // 通常パス / 急所込みパスのイベント列を構築
    // 背景効果（定数ダメ/回復・もうどく）は「末尾」で適用する。
    // 先頭で回復を適用すると満タン時にクランプされて無効化されるため、
    // 攻撃で削れた後に乗せる（残飯は被弾後に回復するゲーム挙動とも一致）。
    const normalEvents: SeqEvent[] = []
    const critEvents: SeqEvent[] = []

    // 攻撃イベントの累積モード変換（incoming/attackerConst/attackerRecover は累積では無視）
    let attackIdx = 0
    for (const ev of events) {
      switch (ev.kind) {
        case 'attack': {
          const isFirstOverall = attackIdx === 0
          attackIdx++
          const { normal, crit } = expandAttack(ev, isFirstOverall, firstHadMultiscale)
          normalEvents.push(...normal)
          critEvents.push(...crit)
          break
        }
        case 'painSplit': {
          // 累積モード: 攻撃側HPは入力値で固定
          normalEvents.push({ kind: 'painSplit', attackerHp: ev.attackerHp })
          critEvents.push({ kind: 'painSplit', attackerHp: ev.attackerHp })
          break
        }
        case 'defenderConst': {
          normalEvents.push({ kind: 'defenderConst', amount: ev.amount })
          critEvents.push({ kind: 'defenderConst', amount: ev.amount })
          break
        }
        case 'defenderRecover': {
          normalEvents.push({ kind: 'defenderRecover', amount: ev.amount })
          critEvents.push({ kind: 'defenderRecover', amount: ev.amount })
          break
        }
        // incoming / attackerConst / attackerRecover は累積ビュー（防御側のみ）では効果なし
        case 'incoming':
        case 'attackerConst':
        case 'attackerRecover':
          break
      }
    }

    // 背景効果（定数ダメ/回復・もうどく合計）を末尾で適用
    if (totalConst > 0) {
      normalEvents.push({ kind: 'defenderConst', amount: totalConst })
      critEvents.push({ kind: 'defenderConst', amount: totalConst })
    } else if (totalConst < 0) {
      normalEvents.push({ kind: 'defenderRecover', amount: -totalConst })
      critEvents.push({ kind: 'defenderRecover', amount: -totalConst })
    }

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
  }, [events, constDmg, constRec, poisonTurns, defenderMaxHp])
}
