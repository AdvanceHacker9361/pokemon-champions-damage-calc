import { useMemo } from 'react'
import { useAttackerStore, useDefenderStore, type PokemonStore } from '@/presentation/store/pokemonStore'
import { useFieldStore } from '@/presentation/store/fieldStore'
import { useResultStore } from '@/presentation/store/resultStore'
import { useBattleSequenceStore, type SeqStep } from '@/presentation/store/battleSequenceStore'
import { executeDamageCalculation, type PokemonBattleState } from '@/application/usecases/CalculateDamageUseCase'
import { MoveRepository } from '@/data/repositories/MoveRepository'
import { calculateHP } from '@/domain/calculators/StatCalculator'
import {
  runBattleSequence,
  type SeqEvent,
  type BattleSequenceResult,
} from '@/domain/calculators/BattleSequenceCalc'

export interface ResolvedStep {
  step: SeqStep
  label: string
  /** このステップが解決できなかった理由（技未選択・結果なし等） */
  error?: string
}

export interface BattleSequenceComputed {
  enabled: boolean
  attackerMaxHp: number
  defenderMaxHp: number
  resolved: ResolvedStep[]
  result: BattleSequenceResult | null
}

/** ストアスナップショットから攻守入替計算用の PokemonBattleState を構築 */
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
    grounded: s.grounded,
  }
}

export function useBattleSequence(): BattleSequenceComputed {
  const attacker = useAttackerStore()
  const defender = useDefenderStore()
  const field = useFieldStore()
  const results = useResultStore(s => s.results)
  const enabled = useBattleSequenceStore(s => s.enabled)
  const steps = useBattleSequenceStore(s => s.steps)
  const attackerStartHp = useBattleSequenceStore(s => s.attackerStartHp)
  const defenderStartHp = useBattleSequenceStore(s => s.defenderStartHp)

  return useMemo(() => {
    const attackerMaxHp = attacker.baseStats.hp > 0
      ? calculateHP(attacker.baseStats.hp, attacker.sp.hp) : 0
    const defenderMaxHp = defender.baseStats.hp > 0
      ? calculateHP(defender.baseStats.hp, defender.sp.hp) : 0

    if (!enabled || !attacker.pokemonId || !defender.pokemonId) {
      return { enabled, attackerMaxHp, defenderMaxHp, resolved: [], result: null }
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

    // 攻撃側の技ロールを resultStore から取得（useDamageCalc が powerOptions 等を反映済み）
    function attackRolls(moveName: string, crit: boolean): number[] | null {
      const mr = results.find(r => r.moveName === moveName)
      if (!mr) return null
      return Array.from(crit ? mr.critResult.rolls : mr.result.rolls)
    }

    // 防御側の技（攻守入替）で攻撃側への被ダメロールを算出
    function incomingRolls(moveName: string, crit: boolean): number[] | null {
      const move = MoveRepository.findByName(moveName)
      if (!move || move.category === '変化') return null

      // 防御側スロットの威力上書き（しっぺがえし・たたりめ等）
      let m = move
      const slot = defender.moves.indexOf(moveName)
      const powerOverride = slot >= 0 ? defender.movePowers[slot] : null
      if (powerOverride !== null && m.powerOptions?.includes(powerOverride)) {
        m = { ...m, power: powerOverride }
      }

      try {
        // 攻守入替: 防御側が attacker、攻撃側が defender
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

    const events: SeqEvent[] = []
    const resolved: ResolvedStep[] = []

    for (const step of steps) {
      switch (step.kind) {
        case 'attack': {
          if (!step.moveName) {
            resolved.push({ step, label: '与ダメ（技未選択）', error: '技を選択してください' })
            continue
          }
          const rolls = attackRolls(step.moveName, step.crit ?? false)
          if (!rolls) {
            resolved.push({ step, label: `与ダメ ${step.moveName}`, error: 'ダメージ結果がありません' })
            continue
          }
          events.push({ kind: 'attack', dmg: rolls })
          resolved.push({ step, label: `与ダメ ${step.moveName}${step.crit ? '（急所）' : ''}` })
          break
        }
        case 'incoming': {
          if (!step.moveName) {
            resolved.push({ step, label: '被ダメ（技未選択）', error: '防御側の技を選択してください' })
            continue
          }
          const rolls = incomingRolls(step.moveName, step.crit ?? false)
          if (!rolls) {
            resolved.push({ step, label: `被ダメ ${step.moveName}`, error: '計算できませんでした' })
            continue
          }
          events.push({ kind: 'incoming', dmg: rolls })
          resolved.push({ step, label: `被ダメ ${step.moveName}${step.crit ? '（急所）' : ''}` })
          break
        }
        case 'painSplit': {
          events.push({ kind: 'painSplit' })
          resolved.push({ step, label: '痛み分け' })
          break
        }
        case 'defenderConst': {
          const amount = Math.max(0, step.amount ?? 0)
          events.push({ kind: 'defenderConst', amount })
          resolved.push({ step, label: `防御側ダメ ${amount}` })
          break
        }
        case 'attackerConst': {
          const amount = Math.max(0, step.amount ?? 0)
          events.push({ kind: 'attackerConst', amount })
          resolved.push({ step, label: `攻撃側ダメ ${amount}` })
          break
        }
        case 'defenderRecover': {
          const amount = Math.max(0, step.amount ?? 0)
          events.push({ kind: 'defenderRecover', amount })
          resolved.push({ step, label: `防御側回復 ${amount}` })
          break
        }
        case 'attackerRecover': {
          const amount = Math.max(0, step.amount ?? 0)
          events.push({ kind: 'attackerRecover', amount })
          resolved.push({ step, label: `攻撃側回復 ${amount}` })
          break
        }
      }
    }

    if (events.length === 0 || attackerMaxHp === 0 || defenderMaxHp === 0) {
      return { enabled, attackerMaxHp, defenderMaxHp, resolved, result: null }
    }

    const result = runBattleSequence(events, attackerMaxHp, defenderMaxHp, {
      attackerStartHp: attackerStartHp ?? undefined,
      defenderStartHp: defenderStartHp ?? undefined,
      labels: resolved.filter(r => !r.error).map(r => r.label),
    })

    return { enabled, attackerMaxHp, defenderMaxHp, resolved, result }
  }, [
    enabled, steps, attackerStartHp, defenderStartHp,
    attacker, defender, field, results,
  ])
}
