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
import { expandAttackEvent, needsCritPass } from '@/presentation/hooks/expandAttackEvent'
import { recoilRateForMove } from '@/domain/calculators/RecoilCalc'
import { toBerryOption } from '@/presentation/hooks/berryOption'
import {
  buildPassiveSchedule,
  autoItemToSeqEvent,
  autoItemLabel,
  type AutoEventItem,
  type PassiveSchedule,
} from '@/domain/calculators/PassiveEffectExpansion'
import { computeTurnRanges } from '@/domain/models/PassiveEffect'
import type { BaseStats, TypeName } from '@/domain/models/Pokemon'

export interface ResolvedEvent {
  event: ProgressionEvent
  label: string
  /** このイベントが解決できなかった理由 */
  error?: string
  /** 常時効果から自動展開された行（ユーザーが並べ替え・削除できない） */
  auto?: true
  /** 自動行の適用ターン（0 = 開始時） */
  turn?: number
}

export interface BattleSequenceComputed {
  /** シーケンス出力（生存率・各ステップHP）を表示すべきか */
  showSequence: boolean
  attackerMaxHp: number
  defenderMaxHp: number
  resolved: ResolvedEvent[]
  result: BattleSequenceResult | null
  /**
   * 各与ダメを急所率で混合したうえで同じ時系列を再実行した結果。
   * 通常パスと分布が変わりえない構成（急所混合が不要）のときは `result` と同一参照。
   * `result` が null のときは null。
   */
  critResult: BattleSequenceResult | null
  /**
   * 常時効果の展開スケジュール（V3.18.0）。UI は start / afterEvent / trailing を
   * ゴースト行の描画に使う（`PassiveEffectExpansion.ts` 参照）。
   */
  passiveSchedule: PassiveSchedule
}

const EMPTY_SCHEDULE: PassiveSchedule = {
  start: [], afterEvent: {}, trailing: [],
  turnEnd: {}, turnEndOwner: {}, perAttackByTurn: {}, perAttackByEventId: {},
  totalTurns: 0,
}

function toBattleState(s: PokemonStore): PokemonBattleState {
  return {
    baseStats: s.baseStats,
    types: s.types,
    sp: s.sp,
    statNatures: s.statNatures,
    abilityName: s.effectiveAbility,
    itemName: s.itemName,
    speciesName: s.pokemonName,
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

const DEFAULT_ACTIVE_ABILITIES = new Set(['マルチスケイル', 'ファントムガード', 'ばけのかわ'])

function defaultAbilityActivated(ability: string): boolean {
  return DEFAULT_ACTIVE_ABILITIES.has(ability)
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
  const defenderBerryCfg = useProgressionStore(s => s.defenderBerry)
  const attackerBerryCfg = useProgressionStore(s => s.attackerBerry)
  const attackerStartHp = useProgressionStore(s => s.attackerStartHp)
  const defenderStartHp = useProgressionStore(s => s.defenderStartHp)
  const passiveEffects = useProgressionStore(s => s.passiveEffects)

  return useMemo(() => {
    const attackerMaxHp = attacker.baseStats.hp > 0
      ? calculateHP(attacker.baseStats.hp, attacker.sp.hp) : 0
    const defenderMaxHp = defender.baseStats.hp > 0
      ? calculateHP(defender.baseStats.hp, defender.sp.hp) : 0

    const showSequence = hasSequenceImpact({
      events, attackerStartHp, passiveEffects, attackerBerry: attackerBerryCfg,
    })
    // 防御側だけの常時効果は攻守シミュレーションを表示しないが、総合累積には反映するため
    // 計算自体は実行する（useAccumulatedDamage が result を再利用する）
    const shouldCompute = showSequence || passiveEffects.length > 0

    if (!shouldCompute || !attacker.pokemonId || !defender.pokemonId) {
      return {
        showSequence: false, attackerMaxHp, defenderMaxHp,
        resolved: [], result: null, critResult: null, passiveSchedule: EMPTY_SCHEDULE,
      }
    }

    // 常時効果の展開スケジュール（ターン境界は events の attack usages / setupTurn で決まる）
    const passiveSchedule = buildPassiveSchedule(events, passiveEffects, {
      attackerMaxHp,
      defenderMaxHp,
      attackerTypes: attacker.types,
      defenderTypes: defender.types,
    })

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

    // イベント id → ターン範囲（attack は usages 分のターンを占有）
    const turnRanges = new Map(computeTurnRanges(events).map(r => [r.eventId, r]))
    const turnStartOf = (id: string) => turnRanges.get(id)?.startTurn ?? 0
    const turnEndOf = (id: string) => turnRanges.get(id)?.endTurn ?? 0

    const seqEvents: SeqEvent[] = []
    const critSeqEvents: SeqEvent[] = []
    const labels: string[] = []
    const resolved: ResolvedEvent[] = []

    /** 与ダメ以外のイベントは通常パス・急所込みパスで完全に同一 */
    function pushSeq(ev: SeqEvent, label: string) {
      seqEvents.push(ev)
      critSeqEvents.push(ev)
      labels.push(label)
    }

    let autoSeq = 1

    /** 自動展開項目を SeqEvent + resolved 行として流し込む */
    function pushAuto(items: AutoEventItem[] | undefined, seq: number) {
      if (!items || items.length === 0) return
      items.forEach((item, i) => {
        const label = autoItemLabel(item)
        const seqEv = autoItemToSeqEvent(item)
        pushSeq(seqEv, label)
        // resolved 行は既存の描画（SequenceResultPanel / ステップ表）と同じ形を保つため
        // 合成 ProgressionEvent（id は auto: プレフィックス）を持たせる
        const synthetic = { ...seqEv, id: `auto:${item.effectId}:${item.turn}:${seq}-${i}` } as ProgressionEvent
        resolved.push({ event: synthetic, label, auto: true, turn: item.turn })
      })
    }

    /** ターン開始イベント以外の直後に走る自動項目（防御側 perAttack → そのターン末） */
    function pushAutoAfterEvent(ev: ProgressionEvent) {
      pushAuto(passiveSchedule.perAttackByEventId[ev.id], autoSeq++)
      const turn = turnEndOf(ev.id)
      if (turn >= 1 && passiveSchedule.turnEndOwner[turn] === ev.id) {
        pushAuto(passiveSchedule.turnEnd[turn], autoSeq++)
      }
    }

    // start タイミングは時系列の先頭
    pushAuto(passiveSchedule.start, 0)

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
          const drainBoosted = seqAttacker.itemName === 'おおきなねっこ'
          const recoilRate = recoilRateForMove(move, seqAttacker.abilityName)
          const drainTag = drainRate ? `（吸収${Math.round(drainRate * 100)}%）` : ''
          const recoilTag = recoilRate ? `（反動${Math.round(recoilRate * 100)}%）` : ''
          const critTag = ev.isForcedCrit ? '（急所）' : ''
          // usages 展開（マルチスケイル/半減実: 全体の1発目のみ rolls、以降 rawRolls）。
          // 攻撃側HPを実HPで追跡するモードなので吸収・反動も SeqEvent に載せる。
          const expanded = expandAttackEvent(ev, {
            mode: 'sequenceTrackedAttacker',
            isFirstOverall: attackSeen === 1,
            firstHadMultiscale,
            drain: drainRate,
            drainBoosted,
            recoil: recoilRate,
          })
          // expanded.normal は必ず usages 個（ラベルと1:1）
          // 通常パスは usages と 1:1、急所込みパスはおやこあいで親子2件になりうるため
          // usage 単位で切り出して自動項目を同じ位置に挟む
          const critPerUsage = Math.max(1, Math.round(expanded.crit.length / ev.usages))
          const usageTag = ev.usages > 1 ? ` ×${ev.usages}` : ''
          resolved.push({ event: ev, label: `与ダメ ${ev.label}${critTag}${drainTag}${recoilTag}${usageTag}` })
          const attackTurnStart = turnStartOf(ev.id)
          expanded.normal.forEach((seqEv, u) => {
            const usageSuffix = ev.usages > 1 ? ` ${u + 1}/${ev.usages}` : ''
            seqEvents.push(seqEv)
            critSeqEvents.push(...expanded.crit.slice(u * critPerUsage, (u + 1) * critPerUsage))
            labels.push(`与ダメ ${ev.label}${critTag}${drainTag}${recoilTag}${usageSuffix}`)
            const turn = attackTurnStart + u
            // 攻撃側 perAttack（いのちのたま等）→ そのターンのターン末 の順で適用
            pushAuto(passiveSchedule.perAttackByTurn[turn], autoSeq++)
            if (passiveSchedule.turnEndOwner[turn] === ev.id) {
              pushAuto(passiveSchedule.turnEnd[turn], autoSeq++)
            }
          })
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
            break
          }
          const rolls = incomingRolls(ev.moveName, ev.crit)
          if (!rolls) {
            resolved.push({ event: ev, label: `攻撃側被ダメ ${ev.moveName}`, error: '計算できませんでした' })
            break
          }
          const move = MoveRepository.findByName(ev.moveName)
          const drain = move?.drain
          const drainBoosted = seqDefender.itemName === 'おおきなねっこ'
          const recoil = recoilRateForMove(move, seqDefender.abilityName)
          const drainTag = drain ? `（相手吸収${Math.round(drain * 100)}%）` : ''
          const recoilTag = recoil ? `（相手反動${Math.round(recoil * 100)}%）` : ''
          const label = `攻撃側被ダメ ${ev.moveName}${ev.crit ? '（急所）' : ''}${drainTag}${recoilTag}`
          pushSeq({ kind: 'incoming', dmg: rolls, drain, drainBoosted, recoil }, label)
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
          const label = `リサイクル（${ev.side === 'attacker' ? '攻撃側' : '防御側'}きのみ再装填）`
          pushSeq({ kind: 'rearmBerry', side: ev.side }, label)
          resolved.push({ event: ev, label })
          break
        }
        case 'leechSeed': {
          // 1ティック分を SeqEvent に変換。amount 未指定なら被ダメ側の実最大HP/8
          const targetHp = ev.direction === 'fromAttacker' ? defenderMaxHp : attackerMaxHp
          const amount = ev.amount ?? Math.max(1, Math.floor(targetHp / 8))
          const arrow = ev.direction === 'fromAttacker' ? '攻→防' : '防→攻'
          const label = ev.label ? `${ev.label}（${arrow} ${amount}）` : `宿り木 ${arrow} (${amount})`
          pushSeq({ kind: 'leechSeed', direction: ev.direction, amount }, label)
          resolved.push({ event: ev, label })
          break
        }
      }
      // attack は usage 単位で内部処理済み。それ以外はイベント直後に自動項目を挟む
      if (ev.kind !== 'attack') pushAutoAfterEvent(ev)
    }

    // count が既存ターン数を超えた分は末尾に追加ターンとして続ける
    pushAuto(passiveSchedule.trailing, autoSeq++)

    if (seqEvents.length === 0 || attackerMaxHp === 0 || defenderMaxHp === 0) {
      return {
        showSequence, attackerMaxHp, defenderMaxHp, resolved,
        result: null, critResult: null, passiveSchedule,
      }
    }

    // オボン/混乱実: HP≤しきい値 で1回限り自動発動（はんすう・しゅうかく対応）。両側独立。
    const runOpts = {
      attackerStartHp: attackerStartHp ?? undefined,
      defenderStartHp: defenderStartHp ?? undefined,
      defenderBerry: toBerryOption(defenderBerryCfg, defenderMaxHp),
      attackerBerry: toBerryOption(attackerBerryCfg, attackerMaxHp),
    }
    const result = runBattleSequence(seqEvents, attackerMaxHp, defenderMaxHp, { ...runOpts, labels })
    // 急所混合で分布が変わりうるときだけ2回目を実行（変わらないなら同一参照でよい）
    const critResult = needsCritPass(events)
      ? runBattleSequence(critSeqEvents, attackerMaxHp, defenderMaxHp, runOpts)
      : result

    return { showSequence, attackerMaxHp, defenderMaxHp, resolved, result, critResult, passiveSchedule }
  }, [
    events, passiveEffects,
    defenderBerryCfg, attackerBerryCfg,
    attackerStartHp, defenderStartHp,
    attacker, defender, field,
  ])
}
