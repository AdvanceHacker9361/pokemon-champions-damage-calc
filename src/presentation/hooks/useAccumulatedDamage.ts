import { useMemo } from 'react'
import { useProgressionStore } from '@/presentation/store/progressionStore'
import {
  runBattleSequence,
  extractDefenderDamageDistribution,
  type BattleSequenceResult,
  type SeqEvent,
} from '@/domain/calculators/BattleSequenceCalc'
import { expandAttackEvent, type AttackEvent } from '@/presentation/hooks/expandAttackEvent'
import { useBattleSequence } from '@/presentation/hooks/useBattleSequence'
import type { KoResult } from '@/domain/models/DamageResult'

export interface AccumulatedDamage {
  hasEntries: boolean
  hasAnything: boolean
  totalMin: number
  totalMax: number
  totalMinPct: number
  totalMaxPct: number
  combinedProb: number
  combinedProbWithCrit: number
  distribution: Map<number, number>
  accumKoResult: KoResult
}

/**
 * 攻撃イベントから通常パス・急所込みパスの SeqEvent を構築（累積モード＝攻撃側HP固定）。
 * 実体は `expandAttackEvent` の accumFixedAttacker モード。
 */
export function expandAttack(
  e: AttackEvent,
  isFirstOverall: boolean,
  firstHadMultiscale: boolean,
): { normal: SeqEvent[]; crit: SeqEvent[] } {
  return expandAttackEvent(e, { mode: 'accumFixedAttacker', isFirstOverall, firstHadMultiscale })
}

export function useAccumulatedDamage(defenderMaxHp: number): AccumulatedDamage {
  const events            = useProgressionStore(s => s.events)
  const constRecBerry     = useProgressionStore(s => s.constRecBerry)
  const berryThresholdPct = useProgressionStore(s => s.constRecBerryThresholdPct)
  const berryCudChew      = useProgressionStore(s => s.berryCudChew)
  const berryHarvestChance = useProgressionStore(s => s.berryHarvestChance)
  const passiveEffects    = useProgressionStore(s => s.passiveEffects)
  // 攻撃側HPに影響するイベントがある構成では、攻撃側HPを追跡する2Dシーケンスの
  // 結果をそのまま累積の出力として使う（累積とシミュレーションの食い違いを防ぐ）
  const seq = useBattleSequence()

  return useMemo(() => {
    const attackEvents = events.filter(e => e.kind === 'attack')
    const hasEntries = attackEvents.length > 0
    const hasAnything = events.length > 0 || passiveEffects.length > 0 || constRecBerry > 0

    /** 防御側ダメージ分布と撃破率から公開値を組み立てる（2パス共通の後段） */
    function finalize(
      distribution: Map<number, number>,
      combinedProb: number,
      combinedProbWithCrit: number,
    ): AccumulatedDamage {
      let totalMin = 0
      let totalMax = 0
      let mn = Infinity, mx = -Infinity
      for (const dmg of distribution.keys()) {
        if (dmg < mn) mn = dmg
        if (dmg > mx) mx = dmg
      }
      if (mn !== Infinity) { totalMin = mn; totalMax = mx }
      const totalMinPct = defenderMaxHp > 0 ? totalMin / defenderMaxHp * 100 : 0
      const totalMaxPct = defenderMaxHp > 0 ? totalMax / defenderMaxHp * 100 : 0

      const accumKoResult: KoResult =
        combinedProb >= 1.0 ? { type: 'guaranteed', hits: 1 }
        : combinedProb > 0 ? { type: 'chance', hits: 1, probability: combinedProb }
        : { type: 'no-ko' }

      return {
        hasEntries, hasAnything,
        totalMin, totalMax, totalMinPct, totalMaxPct,
        combinedProb, combinedProbWithCrit,
        distribution, accumKoResult,
      }
    }

    // --- 統合パス ---
    // 攻撃側HPに影響するイベント（被ダメ・痛み分け・攻撃側定数 等）がある構成では、
    // 攻撃側HPを追跡する2Dシーケンスの結果をそのまま累積の出力にする。
    // 攻撃側HP固定の近似（痛み分けの静的 attackerHp 等）はここでは使わない。
    // 常時効果（passiveEffects）は攻撃側HPも動かしうるため、1件でもあれば統合パスを使う
    const seqResult = seq.result
    if ((seq.showSequence || passiveEffects.length > 0)
        && seqResult !== null && seq.defenderMaxHp === defenderMaxHp) {
      const critRun: BattleSequenceResult = seq.critResult ?? seqResult
      return finalize(
        extractDefenderDamageDistribution(seqResult, defenderMaxHp),
        seqResult.defenderKoProb,
        critRun.defenderKoProb,
      )
    }

    // --- 攻撃側HP固定パス（純粋な累積: 与ダメと防御側効果のみ）---
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
          break
        }
        case 'painSplit': {
          // フォールバック専用（通常は痛み分けがあれば統合パスへ入る）。
          // 攻撃側HPを追跡できないため、保存済みの attackerHp（挿入時の攻撃側最大HP）で近似する。
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
        case 'setupTurn': {
          pushBoth({ kind: 'setupTurn', side: ev.side })
          break
        }
        case 'megaEvolve': {
          break
        }
        // incoming / attackerConst / attackerRecover は累積ビュー（防御側のみ）では効果なし
        // leechSeed（レガシーイベント）は復元時に常時効果へ移行済みのため扱わない
        case 'incoming':
        case 'attackerConst':
        case 'attackerRecover':
          break
      }
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
    if (normalEvents.length === 0) {
      return finalize(new Map([[0, 1.0]]), 0, 0)
    }
    const normalResult = runBattleSequence(normalEvents, ATT_DUMMY, defenderMaxHp, { defenderBerry })
    const critResult   = runBattleSequence(critEvents, ATT_DUMMY, defenderMaxHp, { defenderBerry })
    return finalize(
      extractDefenderDamageDistribution(normalResult, defenderMaxHp),
      normalResult.defenderKoProb,
      critResult.defenderKoProb,
    )
  }, [
    events, passiveEffects,
    constRecBerry, berryThresholdPct, berryCudChew, berryHarvestChance,
    defenderMaxHp, seq,
  ])
}
