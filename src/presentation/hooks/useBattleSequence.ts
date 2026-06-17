import { useMemo } from 'react'
import { useAttackerStore, useDefenderStore, type PokemonStore } from '@/presentation/store/pokemonStore'
import { useFieldStore } from '@/presentation/store/fieldStore'
import {
  useProgressionStore,
  hasSequenceImpact,
  type ProgressionEvent,
} from '@/presentation/store/progressionStore'
import { executeDamageCalculation, type PokemonBattleState } from '@/application/usecases/CalculateDamageUseCase'
import { MoveRepository } from '@/data/repositories/MoveRepository'
import { calculateHP } from '@/domain/calculators/StatCalculator'
import {
  runBattleSequence,
  type SeqEvent,
  type BattleSequenceResult,
} from '@/domain/calculators/BattleSequenceCalc'
import {
  calcVariableHitsSingleUsageDist,
} from '@/domain/calculators/KoProbabilityCalc'

export interface ResolvedEvent {
  event: ProgressionEvent
  label: string
  /** このイベントが解決できなかった理由 */
  error?: string
}

export interface BattleSequenceComputed {
  /** シーケンス出力（生存率・各ステップHP）を表示すべきか */
  showSequence: boolean
  attackerMaxHp: number
  defenderMaxHp: number
  resolved: ResolvedEvent[]
  result: BattleSequenceResult | null
}

function toBattleState(s: PokemonStore): PokemonBattleState {
  return {
    baseStats: s.baseStats,
    types: s.types,
    sp: s.sp,
    statNatures: s.statNatures,
    abilityName: s.effectiveAbility,
    itemName: s.itemName,
    ranks: s.ranks,
    status: s.status,
    abilityActivated: s.abilityActivated,
    supremeOverlordBoost: s.supremeOverlordBoost,
    proteanType: s.proteanType,
    proteanStab: s.proteanStab,
    weight: s.weight,
    chargeActive: s.chargeActive,
    metronomeMultiplier: s.metronomeMultiplier,
    grounded: s.grounded,
  }
}

export function useBattleSequence(): BattleSequenceComputed {
  const attacker = useAttackerStore()
  const defender = useDefenderStore()
  const field = useFieldStore()
  const events = useProgressionStore(s => s.events)
  const constDmg = useProgressionStore(s => s.constDmg)
  const constRec = useProgressionStore(s => s.constRec)
  const constRecBerry = useProgressionStore(s => s.constRecBerry)
  const berryThresholdPct = useProgressionStore(s => s.constRecBerryThresholdPct)
  const berryCudChew = useProgressionStore(s => s.berryCudChew)
  const berryHarvestChance = useProgressionStore(s => s.berryHarvestChance)
  const poisonTurns = useProgressionStore(s => s.poisonTurns)
  const attackerDirectDmg = useProgressionStore(s => s.attackerDirectDmg)
  const attackerDirectRec = useProgressionStore(s => s.attackerDirectRec)
  const defenderDirectDmg = useProgressionStore(s => s.defenderDirectDmg)
  const defenderDirectRec = useProgressionStore(s => s.defenderDirectRec)
  const attackerStartHp = useProgressionStore(s => s.attackerStartHp)
  const defenderStartHp = useProgressionStore(s => s.defenderStartHp)

  return useMemo(() => {
    const attackerMaxHp = attacker.baseStats.hp > 0
      ? calculateHP(attacker.baseStats.hp, attacker.sp.hp) : 0
    const defenderMaxHp = defender.baseStats.hp > 0
      ? calculateHP(defender.baseStats.hp, defender.sp.hp) : 0

    const showSequence = hasSequenceImpact({ events, attackerStartHp, attackerDirectDmg, attackerDirectRec })

    if (!showSequence || !attacker.pokemonId || !defender.pokemonId) {
      return { showSequence: false, attackerMaxHp, defenderMaxHp, resolved: [], result: null }
    }

    const battleField = {
      weather: field.weather,
      terrain: field.terrain,
      isReflect: field.isReflect,
      isLightScreen: field.isLightScreen,
      isAuroraVeil: field.isAuroraVeil,
      isTrickRoom: field.isTrickRoom,
      isGravity: field.isGravity,
    }

    // 防御側の技（攻守入替）で攻撃側への被ダメロールを算出
    function incomingRolls(moveName: string, crit: boolean): number[] | null {
      const move = MoveRepository.findByName(moveName)
      if (!move || move.category === '変化') return null

      let m = move
      const slot = defender.moves.indexOf(moveName)
      const powerOverride = slot >= 0 ? defender.movePowers[slot] : null
      if (powerOverride !== null && m.powerOptions?.includes(powerOverride)) {
        m = { ...m, power: powerOverride }
      }

      try {
        const res = executeDamageCalculation({
          attacker: toBattleState(defender),
          defender: toBattleState(attacker),
          move: m,
          field: battleField,
          isCritical: crit || m.alwaysCrit === true,
        })
        return Array.from(res.rolls)
      } catch {
        return null
      }
    }

    // 定数ダメ・もうどくは末尾で累計適用、定数回復はオボン相当の1回限り条件回復として扱う
    const poisonPerTurn = Array.from({ length: poisonTurns }, (_, i) =>
      Math.max(1, Math.floor(defenderMaxHp * (i + 1) / 16))
    )
    const poisonTotal = poisonPerTurn.reduce((s, v) => s + v, 0)
    const bgDamageTotal = constDmg + poisonTotal

    const seqEvents: SeqEvent[] = []
    const labels: string[] = []
    const resolved: ResolvedEvent[] = []

    function pushSeq(ev: SeqEvent, label: string) {
      seqEvents.push(ev)
      labels.push(label)
    }

    let firstHadMultiscale = false
    let attackSeen = 0

    for (const ev of events) {
      switch (ev.kind) {
        case 'attack': {
          if (attackSeen === 0) firstHadMultiscale = ev.hadMultiscale
          attackSeen++
          // 吸収率: 加算時に保存した技名から取得（label はポケモン名込みのため不可）
          const drainRate = ev.moveName
            ? MoveRepository.findByName(ev.moveName)?.drain
            : undefined
          const drainTag = drainRate ? `（吸収${Math.round(drainRate * 100)}%）` : ''
          const critTag = ev.isForcedCrit ? '（急所）' : ''
          // usages 展開（マルチスケイル/半減実: 全体の1発目のみ rolls、以降 rawRolls）
          for (let u = 0; u < ev.usages; u++) {
            const isVeryFirst = (attackSeen === 1) && u === 0
            const useRaw = !isVeryFirst && firstHadMultiscale
            const baseRolls = useRaw ? ev.rawRolls : ev.rolls

            const usageSuffix = ev.usages > 1 ? ` ${u + 1}/${ev.usages}` : ''
            const seqLabel = `与ダメ ${ev.label}${critTag}${drainTag}${usageSuffix}`
            if (ev.variableHitDist) {
              const dist = calcVariableHitsSingleUsageDist(baseRolls, ev.variableHitDist, ev.rawRolls)
              pushSeq({ kind: 'attack', dmg: dist, drain: drainRate }, seqLabel)
            } else {
              pushSeq({ kind: 'attack', dmg: baseRolls, drain: drainRate }, seqLabel)
            }
          }
          // 攻撃直後に定数回復（たべのこし等の per-turn 回復）を適用
          if (constRec > 0) {
            pushSeq({ kind: 'defenderRecover', amount: constRec }, `定数回復 ${constRec}`)
          }
          const usageTag = ev.usages > 1 ? ` ×${ev.usages}` : ''
          resolved.push({ event: ev, label: `与ダメ ${ev.label}${critTag}${drainTag}${usageTag}` })
          break
        }
        case 'painSplit': {
          // シーケンスモードでは追跡中の攻撃側HP同時分布を使って両者を均す
          pushSeq({ kind: 'painSplit' }, '痛み分け（両者HP平均化）')
          resolved.push({ event: ev, label: `痛み分け（両者HP平均化）` })
          break
        }
        case 'incoming': {
          if (!ev.moveName) {
            resolved.push({ event: ev, label: '攻撃側被ダメ（技未選択）', error: '防御側の技を選択してください' })
            continue
          }
          const rolls = incomingRolls(ev.moveName, ev.crit)
          if (!rolls) {
            resolved.push({ event: ev, label: `攻撃側被ダメ ${ev.moveName}`, error: '計算できませんでした' })
            continue
          }
          const drain = MoveRepository.findByName(ev.moveName)?.drain
          const drainTag = drain ? `（相手吸収${Math.round(drain * 100)}%）` : ''
          const label = `攻撃側被ダメ ${ev.moveName}${ev.crit ? '（急所）' : ''}${drainTag}`
          pushSeq({ kind: 'incoming', dmg: rolls, drain }, label)
          resolved.push({ event: ev, label })
          break
        }
        case 'defenderConst': {
          const label = `防御側ダメ ${ev.amount}`
          pushSeq({ kind: 'defenderConst', amount: ev.amount }, label)
          resolved.push({ event: ev, label })
          break
        }
        case 'attackerConst': {
          const label = `攻撃側ダメ ${ev.amount}`
          pushSeq({ kind: 'attackerConst', amount: ev.amount }, label)
          resolved.push({ event: ev, label })
          break
        }
        case 'defenderRecover': {
          const label = `防御側回復 ${ev.amount}`
          pushSeq({ kind: 'defenderRecover', amount: ev.amount }, label)
          resolved.push({ event: ev, label })
          break
        }
        case 'attackerRecover': {
          const label = `攻撃側回復 ${ev.amount}`
          pushSeq({ kind: 'attackerRecover', amount: ev.amount }, label)
          resolved.push({ event: ev, label })
          break
        }
        case 'rearmBerry': {
          const label = 'リサイクル（きのみ再装填）'
          pushSeq({ kind: 'rearmBerry' }, label)
          resolved.push({ event: ev, label })
          break
        }
        case 'leechSeed': {
          // 1ティック分を SeqEvent に変換。amount = 被ダメ側の実最大HP/8
          const targetHp = ev.direction === 'fromAttacker' ? defenderMaxHp : attackerMaxHp
          const amount = Math.max(1, Math.floor(targetHp / 8))
          const arrow = ev.direction === 'fromAttacker' ? '攻→防' : '防→攻'
          const label = `宿り木 ${arrow} (${amount})`
          pushSeq({ kind: 'leechSeed', direction: ev.direction, amount }, label)
          resolved.push({ event: ev, label })
          break
        }
      }
    }

    // 背景の累計ダメ（砂・もうどく・固定の定数ダメ）を末尾で適用
    if (bgDamageTotal > 0) {
      pushSeq({ kind: 'defenderConst', amount: bgDamageTotal }, `背景ダメ ${bgDamageTotal}`)
    }
    if (defenderDirectDmg > 0) {
      pushSeq({ kind: 'defenderConst', amount: defenderDirectDmg }, `HP直接補正 防御側ダメ ${defenderDirectDmg}`)
    }
    if (defenderDirectRec > 0) {
      pushSeq({ kind: 'defenderRecover', amount: defenderDirectRec }, `HP直接補正 防御側回復 ${defenderDirectRec}`)
    }
    if (attackerDirectDmg > 0) {
      pushSeq({ kind: 'attackerConst', amount: attackerDirectDmg }, `HP直接補正 攻撃側ダメ ${attackerDirectDmg}`)
    }
    if (attackerDirectRec > 0) {
      pushSeq({ kind: 'attackerRecover', amount: attackerDirectRec }, `HP直接補正 攻撃側回復 ${attackerDirectRec}`)
    }

    if (seqEvents.length === 0 || attackerMaxHp === 0 || defenderMaxHp === 0) {
      return { showSequence, attackerMaxHp, defenderMaxHp, resolved, result: null }
    }

    // オボン/混乱実: HP≤しきい値 で1回限り自動発動（はんすう・しゅうかく対応）
    const defenderBerry = constRecBerry > 0
      ? {
          threshold: Math.floor(defenderMaxHp * berryThresholdPct / 100),
          amount: constRecBerry,
          cudChew: berryCudChew,
          harvestChance: berryHarvestChance,
        }
      : undefined

    const result = runBattleSequence(seqEvents, attackerMaxHp, defenderMaxHp, {
      attackerStartHp: attackerStartHp ?? undefined,
      defenderStartHp: defenderStartHp ?? undefined,
      labels,
      defenderBerry,
    })

    return { showSequence, attackerMaxHp, defenderMaxHp, resolved, result }
  }, [
    events, constDmg, constRec, constRecBerry, berryThresholdPct, berryCudChew, berryHarvestChance, poisonTurns,
    attackerDirectDmg, attackerDirectRec, defenderDirectDmg, defenderDirectRec,
    attackerStartHp, defenderStartHp,
    attacker, defender, field,
  ])
}
