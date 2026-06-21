import { useMemo } from 'react'
import { useAttackerStore, useDefenderStore, type PokemonStore } from '@/presentation/store/pokemonStore'
import { useFieldStore } from '@/presentation/store/fieldStore'
import { PokemonRepository } from '@/data/repositories/PokemonRepository'
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
import type { MoveRecord } from '@/data/schemas/types'
import type { BaseStats, TypeName } from '@/domain/models/Pokemon'

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

const RECOIL_PREVENT_ABILITIES = new Set(['いしあたま', 'マジックガード'])
const DEFAULT_ACTIVE_ABILITIES = new Set(['マルチスケイル', 'ファントムガード', 'ばけのかわ'])

function defaultAbilityActivated(ability: string): boolean {
  return DEFAULT_ACTIVE_ABILITIES.has(ability)
}

function recoilRateForMove(move: MoveRecord | undefined, attackerAbility: string | null): number | undefined {
  if (!move || !move.recoil || move.recoil <= 0) return undefined
  if (attackerAbility && RECOIL_PREVENT_ABILITIES.has(attackerAbility)) return undefined
  return move.recoil
}

function toBaseBattleState(s: PokemonStore): PokemonBattleState {
  const base = s.pokemonId != null ? PokemonRepository.findById(s.pokemonId) : undefined
  if (!base) return toBattleState(s)
  return {
    ...toBattleState(s),
    baseStats: base.baseStats as BaseStats,
    types: base.types as TypeName[],
    abilityName: s.abilityName,
    weight: base.weight,
    abilityActivated: defaultAbilityActivated(s.abilityName),
  }
}

function toMegaBattleState(s: PokemonStore, megaKey: string): PokemonBattleState {
  const mega = PokemonRepository.getMegaByKey(megaKey)
  const base = s.pokemonId != null ? PokemonRepository.findById(s.pokemonId) : undefined
  if (!mega) return toBattleState(s)
  return {
    ...toBattleState(s),
    baseStats: mega.baseStats as BaseStats,
    types: mega.types as TypeName[],
    abilityName: mega.ability,
    weight: mega.weight !== undefined ? mega.weight : (base?.weight ?? s.weight),
    abilityActivated: defaultAbilityActivated(mega.ability),
  }
}

export function useBattleSequence(): BattleSequenceComputed {
  const attacker = useAttackerStore()
  const defender = useDefenderStore()
  const field = useFieldStore()
  const events = useProgressionStore(s => s.events)
  const constRecBerry = useProgressionStore(s => s.constRecBerry)
  const berryThresholdPct = useProgressionStore(s => s.constRecBerryThresholdPct)
  const berryCudChew = useProgressionStore(s => s.berryCudChew)
  const berryHarvestChance = useProgressionStore(s => s.berryHarvestChance)
  const attackerStartHp = useProgressionStore(s => s.attackerStartHp)
  const defenderStartHp = useProgressionStore(s => s.defenderStartHp)

  return useMemo(() => {
    const attackerMaxHp = attacker.baseStats.hp > 0
      ? calculateHP(attacker.baseStats.hp, attacker.sp.hp) : 0
    const defenderMaxHp = defender.baseStats.hp > 0
      ? calculateHP(defender.baseStats.hp, defender.sp.hp) : 0

    const showSequence = hasSequenceImpact({ events, attackerStartHp })

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

    const attackerHasMegaEvent = events.some(ev => ev.kind === 'megaEvolve' && ev.side === 'attacker')
    const defenderHasMegaEvent = events.some(ev => ev.kind === 'megaEvolve' && ev.side === 'defender')
    let seqAttacker = attackerHasMegaEvent ? toBaseBattleState(attacker) : toBattleState(attacker)
    let seqDefender = defenderHasMegaEvent ? toBaseBattleState(defender) : toBattleState(defender)

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
          attacker: seqDefender,
          defender: seqAttacker,
          move: m,
          field: battleField,
          isCritical: crit || m.alwaysCrit === true,
        })
        return Array.from(res.rolls)
      } catch {
        return null
      }
    }

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
          const move = ev.moveName ? MoveRepository.findByName(ev.moveName) : undefined
          const drainRate = move?.drain
          const recoilRate = recoilRateForMove(move, seqAttacker.abilityName)
          const drainTag = drainRate ? `（吸収${Math.round(drainRate * 100)}%）` : ''
          const recoilTag = recoilRate ? `（反動${Math.round(recoilRate * 100)}%）` : ''
          const critTag = ev.isForcedCrit ? '（急所）' : ''
          // usages 展開（マルチスケイル/半減実: 全体の1発目のみ rolls、以降 rawRolls）
          for (let u = 0; u < ev.usages; u++) {
            const isVeryFirst = (attackSeen === 1) && u === 0
            const useRaw = !isVeryFirst && firstHadMultiscale
            const baseRolls = useRaw ? ev.rawRolls : ev.rolls

            const usageSuffix = ev.usages > 1 ? ` ${u + 1}/${ev.usages}` : ''
            const seqLabel = `与ダメ ${ev.label}${critTag}${drainTag}${recoilTag}${usageSuffix}`
            if (ev.variableHitDist) {
              const dist = calcVariableHitsSingleUsageDist(baseRolls, ev.variableHitDist, ev.rawRolls)
              pushSeq({ kind: 'attack', dmg: dist, drain: drainRate, recoil: recoilRate }, seqLabel)
            } else {
              pushSeq({ kind: 'attack', dmg: baseRolls, drain: drainRate, recoil: recoilRate }, seqLabel)
            }
          }
          const usageTag = ev.usages > 1 ? ` ×${ev.usages}` : ''
          resolved.push({ event: ev, label: `与ダメ ${ev.label}${critTag}${drainTag}${recoilTag}${usageTag}` })
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
          const move = MoveRepository.findByName(ev.moveName)
          const drain = move?.drain
          const recoil = recoilRateForMove(move, seqDefender.abilityName)
          const drainTag = drain ? `（相手吸収${Math.round(drain * 100)}%）` : ''
          const recoilTag = recoil ? `（相手反動${Math.round(recoil * 100)}%）` : ''
          const label = `攻撃側被ダメ ${ev.moveName}${ev.crit ? '（急所）' : ''}${drainTag}${recoilTag}`
          pushSeq({ kind: 'incoming', dmg: rolls, drain, recoil }, label)
          resolved.push({ event: ev, label })
          break
        }
        case 'setupTurn': {
          const side = ev.side === 'attacker' ? '攻撃側' : '防御側'
          const label = ev.label?.trim() || `${side}補助技使用`
          pushSeq({ kind: 'setupTurn', side: ev.side }, label)
          resolved.push({ event: ev, label })
          break
        }
        case 'megaEvolve': {
          const side = ev.side === 'attacker' ? '攻撃側' : '防御側'
          const mega = PokemonRepository.getMegaByKey(ev.megaKey)
          const label = `${side}メガシンカ${mega ? `（${mega.name}）` : ''}`
          if (ev.side === 'attacker') {
            seqAttacker = toMegaBattleState(attacker, ev.megaKey)
          } else {
            seqDefender = toMegaBattleState(defender, ev.megaKey)
          }
          pushSeq({ kind: 'megaEvolve', side: ev.side }, label)
          resolved.push({ event: ev, label })
          break
        }
        case 'defenderConst': {
          const label = ev.label ?? `防御側ダメ ${ev.amount}`
          pushSeq({ kind: 'defenderConst', amount: ev.amount }, label)
          resolved.push({ event: ev, label })
          break
        }
        case 'attackerConst': {
          const label = ev.label ?? `攻撃側ダメ ${ev.amount}`
          pushSeq({ kind: 'attackerConst', amount: ev.amount }, label)
          resolved.push({ event: ev, label })
          break
        }
        case 'defenderRecover': {
          const label = ev.label ?? `防御側回復 ${ev.amount}`
          pushSeq({ kind: 'defenderRecover', amount: ev.amount }, label)
          resolved.push({ event: ev, label })
          break
        }
        case 'attackerRecover': {
          const label = ev.label ?? `攻撃側回復 ${ev.amount}`
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
    events, constRecBerry, berryThresholdPct, berryCudChew, berryHarvestChance,
    attackerStartHp, defenderStartHp,
    attacker, defender, field,
  ])
}
