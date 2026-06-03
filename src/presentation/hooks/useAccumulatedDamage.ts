import { useMemo } from 'react'
import { useProgressionStore } from '@/presentation/store/progressionStore'
import type { ProgressionEvent } from '@/presentation/store/progressionStore'
import { useAttackerStore } from '@/presentation/store/pokemonStore'
import {
  calcVariableHitsSingleUsageDist,
  calcVariableHitsSingleUsageDistWithCrit,
} from '@/domain/calculators/KoProbabilityCalc'
import {
  runBattleSequence,
  extractDefenderDamageDistribution,
  type SeqEvent,
} from '@/domain/calculators/BattleSequenceCalc'
import { calculateHP } from '@/domain/calculators/StatCalculator'
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
  const events            = useProgressionStore(s => s.events)
  const constDmg          = useProgressionStore(s => s.constDmg)
  const constRec          = useProgressionStore(s => s.constRec)
  const constRecBerry     = useProgressionStore(s => s.constRecBerry)
  const berryThresholdPct = useProgressionStore(s => s.constRecBerryThresholdPct)
  const berryCudChew      = useProgressionStore(s => s.berryCudChew)
  const berryHarvestChance = useProgressionStore(s => s.berryHarvestChance)
  const poisonTurns       = useProgressionStore(s => s.poisonTurns)
  // 宿り木: 防御側→攻撃側 ティックで「攻撃側最大HPの1/8」を防御側回復として使用
  const attackerBaseHp    = useAttackerStore(s => s.baseStats.hp)
  const attackerSpHp      = useAttackerStore(s => s.sp.hp)

  return useMemo(() => {
    const poisonPerTurn = Array.from({ length: poisonTurns }, (_, i) =>
      Math.max(1, Math.floor(defenderMaxHp * (i + 1) / 16))
    )
    const poisonTotal = poisonPerTurn.reduce((s, v) => s + v, 0)
    // 定数ダメ・もうどくは累計で末尾適用（砂/毒/火傷の合計）。
    // 定数回復（たべのこし等）は各与ダメ攻撃の直後に毎回適用。
    // オボン回復は HP≤50% で1回限り自動発動（runBattleSequence の defenderBerry オプションで）。
    const bgDamageTotal = constDmg + poisonTotal
    const totalConst = bgDamageTotal - constRec - constRecBerry

    const attackEvents = events.filter(e => e.kind === 'attack')
    const hasEntries = attackEvents.length > 0
    const hasAnything = events.length > 0 || totalConst !== 0

    // 最初の attack イベントがマルチスケイル発動中なら、2発目以降は素ダメ
    const firstAttack = attackEvents[0]
    const firstHadMultiscale = firstAttack?.hadMultiscale ?? false

    const normalEvents: SeqEvent[] = []
    const critEvents: SeqEvent[] = []

    function pushBoth(ev: SeqEvent) {
      normalEvents.push(ev)
      critEvents.push(ev)
    }

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
          // 攻撃直後に定数回復（たべのこし等の per-turn 回復）を適用
          if (constRec > 0) {
            pushBoth({ kind: 'defenderRecover', amount: constRec })
          }
          break
        }
        case 'painSplit': {
          // 累積モード: 攻撃側HPは入力値で固定
          pushBoth({ kind: 'painSplit', attackerHp: ev.attackerHp })
          break
        }
        case 'defenderConst': {
          pushBoth({ kind: 'defenderConst', amount: ev.amount })
          break
        }
        case 'defenderRecover': {
          pushBoth({ kind: 'defenderRecover', amount: ev.amount })
          break
        }
        case 'rearmBerry': {
          pushBoth({ kind: 'rearmBerry' })
          break
        }
        case 'leechSeed': {
          // 累積モード（防御側のみ追跡）: 攻撃側のHP変化は無視し、防御側へのダメ/回復のみ
          if (ev.direction === 'fromAttacker') {
            const dmg = Math.max(1, Math.floor(defenderMaxHp / 8))
            pushBoth({ kind: 'defenderConst', amount: dmg })
          } else {
            // 防→攻: 攻撃側の実最大HPの1/8を防御側回復として適用
            const aMax = attackerBaseHp > 0 ? calculateHP(attackerBaseHp, attackerSpHp) : 0
            if (aMax > 0) {
              const heal = Math.max(1, Math.floor(aMax / 8))
              pushBoth({ kind: 'defenderRecover', amount: heal })
            }
          }
          break
        }
        // incoming / attackerConst / attackerRecover は累積ビュー（防御側のみ）では効果なし
        case 'incoming':
        case 'attackerConst':
        case 'attackerRecover':
          break
      }
    }

    // 背景の累計ダメ（砂・もうどく・固定の定数ダメ）を末尾で適用
    if (bgDamageTotal > 0) {
      pushBoth({ kind: 'defenderConst', amount: bgDamageTotal })
    }
    // 攻撃が無いときは定数回復を末尾でも適用（取りこぼし防止）
    if (attackEvents.length === 0 && constRec > 0) {
      pushBoth({ kind: 'defenderRecover', amount: constRec })
    }

    // オボン/混乱実: HP≤しきい値 で1回限り自動発動（はんすう=2回・しゅうかく=再装填対応）
    const defenderBerry = constRecBerry > 0
      ? {
          threshold: Math.floor(defenderMaxHp * berryThresholdPct / 100),
          amount: constRecBerry,
          cudChew: berryCudChew,
          harvestChance: berryHarvestChance,
        }
      : undefined

    const ATT_DUMMY = 1
    let distribution: Map<number, number>
    let combinedProb: number
    let combinedProbWithCrit: number

    if (normalEvents.length === 0) {
      distribution = new Map([[0, 1.0]])
      combinedProb = 0
      combinedProbWithCrit = 0
    } else {
      const normalResult = runBattleSequence(normalEvents, ATT_DUMMY, defenderMaxHp, { defenderBerry })
      const critResult   = runBattleSequence(critEvents, ATT_DUMMY, defenderMaxHp, { defenderBerry })
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
  }, [events, constDmg, constRec, constRecBerry, berryThresholdPct, berryCudChew, berryHarvestChance, poisonTurns, defenderMaxHp, attackerBaseHp, attackerSpHp])
}
