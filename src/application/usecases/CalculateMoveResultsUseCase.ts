import { executeDamageCalculation } from '@/application/usecases/CalculateDamageUseCase'
import type { PokemonBattleState, CalculateDamageInput } from '@/application/usecases/CalculateDamageUseCase'
import { MoveRepository } from '@/data/repositories/MoveRepository'
import { calculateHP } from '@/domain/calculators/StatCalculator'
import { resolveReversalPower } from '@/domain/calculators/SpecialMoveCalc'
import { calcKoProbability } from '@/domain/calculators/KoProbabilityCalc'
import { calcRollPercent, type DamageResult } from '@/domain/models/DamageResult'
import { wouldHalfBerryActivate } from '@/domain/calculators/DamageCalculator'
import { getTypeEffectiveness } from '@/domain/constants/typeChart'
import type { BattleField } from '@/domain/models/BattleField'

type MoveSlots = readonly [string | null, string | null, string | null, string | null]
type MovePowerSlots = readonly [number | null, number | null, number | null, number | null]

export interface MoveSelectionState extends PokemonBattleState {
  moves: MoveSlots
  movePowers: MovePowerSlots
}

export interface CalculatedMoveResult {
  slotIndex: number
  moveName: string
  result: DamageResult
  critResult: DamageResult
  perHitResults?: DamageResult[]
  critPerHitResults?: DamageResult[]
  rawResult?: DamageResult
  rawCritResult?: DamageResult
  weakArmorPerHitResults?: DamageResult[]
  weakArmorCritPerHitResults?: DamageResult[]
  weakArmorVariableRawResults?: DamageResult[]
  weakArmorVariableRawCritResults?: DamageResult[]
}

export interface CalculateMoveResultsInput {
  attacker: MoveSelectionState
  defender: PokemonBattleState
  field: BattleField
}

const HP_FULL_ABILITIES = new Set(['マルチスケイル', 'ファントムガード'])

function clampRank(rank: number): number {
  return Math.max(-6, Math.min(6, rank))
}

function sumRolls(hitResults: DamageResult[]): DamageResult['rolls'] {
  return hitResults[0].rolls.map((_, i) =>
    hitResults.reduce((sum, result) => sum + result.rolls[i], 0)
  ) as DamageResult['rolls']
}

function createTotalResult(hitResults: DamageResult[]): DamageResult {
  const defenderMaxHp = hitResults[0].defenderMaxHp
  const rolls = sumRolls(hitResults)

  return {
    rolls,
    min: rolls[0],
    max: rolls[15],
    defenderMaxHp,
    percentMin: calcRollPercent(rolls[0], defenderMaxHp),
    percentMax: calcRollPercent(rolls[15], defenderMaxHp),
    koResult: calcKoProbability(Array.from(rolls), defenderMaxHp),
  }
}

export function calculateMoveResults({
  attacker,
  defender,
  field,
}: CalculateMoveResultsInput): CalculatedMoveResult[] {
  return attacker.moves
    .map<CalculatedMoveResult | null>((moveName, slotIdx) => {
      if (!moveName) return null

      let move = MoveRepository.findByName(moveName)
      if (!move || move.category === '変化') return null

      const powerOverride = attacker.movePowers[slotIdx]
      if (powerOverride !== null && move.powerOptions?.includes(powerOverride)) {
        move = { ...move, power: powerOverride }
      }

      if (move.special === 'reversal') {
        const maxHP = calculateHP(attacker.baseStats.hp, attacker.sp.hp)
        const resolvedPower = powerOverride ?? resolveReversalPower(maxHP, maxHP)
        move = { ...move, power: resolvedPower }
      }

      try {
        const calcInput: CalculateDamageInput = {
          attacker: {
            baseStats: attacker.baseStats,
            types: attacker.types,
            sp: attacker.sp,
            statNatures: attacker.statNatures,
            abilityName: attacker.abilityName,
            itemName: attacker.itemName,
            ranks: attacker.ranks,
            status: attacker.status,
            abilityActivated: attacker.abilityActivated,
            supremeOverlordBoost: attacker.supremeOverlordBoost,
            proteanType: attacker.proteanType,
            proteanStab: attacker.proteanStab,
            weight: attacker.weight,
            chargeActive: attacker.chargeActive,
          },
          defender: {
            baseStats: defender.baseStats,
            types: defender.types,
            sp: defender.sp,
            statNatures: defender.statNatures,
            abilityName: defender.abilityName,
            itemName: defender.itemName,
            ranks: defender.ranks,
            status: defender.status,
            abilityActivated: defender.abilityActivated,
            proteanType: defender.proteanType,
            weight: defender.weight,
            grounded: defender.grounded,
          },
          move,
          field,
        }

        const alwaysCrit = move.alwaysCrit === true
        const defenderHadMultiscale =
          HP_FULL_ABILITIES.has(defender.abilityName) && defender.abilityActivated === true

        const defenderEffTypes =
          (defender.abilityName === 'へんげんじざい' &&
           defender.abilityActivated &&
           defender.proteanType)
            ? [defender.proteanType]
            : defender.types
        const typeEffForBerry = getTypeEffectiveness(move.type, defenderEffTypes)
        const halfBerryActive = wouldHalfBerryActivate(defender.itemName, move.type, typeEffForBerry)

        const defenderWeakArmor =
          defender.abilityName === 'くだけるよろい' &&
          move.category === '物理'

        const defenderStamina =
          defender.abilityName === 'じきゅうりょく' &&
          move.category === '物理'

        const hasPerHitDefShift = defenderWeakArmor || defenderStamina

        const subsequentInput: CalculateDamageInput = (defenderHadMultiscale || halfBerryActive)
          ? {
              ...calcInput,
              defender: {
                ...calcInput.defender,
                abilityActivated: defenderHadMultiscale ? false : calcInput.defender.abilityActivated,
              },
              skipHalfBerry: halfBerryActive ? true : undefined,
            }
          : calcInput

        function withPerHitDefShift(input: CalculateDamageInput, drops: number): CalculateDamageInput {
          if (!hasPerHitDefShift || drops === 0) return input

          const delta = (defenderWeakArmor ? -drops : 0) + (defenderStamina ? drops : 0)
          if (delta === 0) return input

          const currentDef = input.defender.ranks.def ?? 0
          const newDef = clampRank(currentDef + delta)
          if (newDef === currentDef) return input

          return {
            ...input,
            defender: { ...input.defender, ranks: { ...input.defender.ranks, def: newDef } },
          }
        }

        if (move.multiHit?.type === 'escalating') {
          const powers = move.multiHit.powers
          const baseMove = move

          function calcEscalating(isCrit: boolean) {
            const hitResults = powers.map((power, idx) => {
              const baseInput = idx === 0 ? calcInput : subsequentInput
              const hitInput = withPerHitDefShift(baseInput, idx)
              return executeDamageCalculation({ ...hitInput, move: { ...baseMove, power }, isCritical: isCrit })
            })

            return { totalResult: createTotalResult(hitResults), hitResults }
          }

          const { totalResult: result, hitResults: perHitResults } = calcEscalating(alwaysCrit)
          const { totalResult: critResult, hitResults: critPerHitResults } = calcEscalating(true)
          return { slotIndex: slotIdx, moveName, result, critResult, perHitResults, critPerHitResults }
        }

        const result = executeDamageCalculation({ ...calcInput, isCritical: alwaysCrit })
        const critResult = executeDamageCalculation({ ...calcInput, isCritical: true })

        let weakArmorPerHitResults: DamageResult[] | undefined
        let weakArmorCritPerHitResults: DamageResult[] | undefined
        if (move.multiHit?.type === 'fixed' && move.multiHit.count > 1 && hasPerHitDefShift) {
          const count = move.multiHit.count
          weakArmorPerHitResults = Array.from({ length: count }, (_, idx) => {
            const hitInput = withPerHitDefShift(idx === 0 ? calcInput : subsequentInput, idx)
            return executeDamageCalculation({ ...hitInput, isCritical: alwaysCrit })
          })
          weakArmorCritPerHitResults = Array.from({ length: count }, (_, idx) => {
            const hitInput = withPerHitDefShift(idx === 0 ? calcInput : subsequentInput, idx)
            return executeDamageCalculation({ ...hitInput, isCritical: true })
          })
        }

        let weakArmorVariableRawResults: DamageResult[] | undefined
        let weakArmorVariableRawCritResults: DamageResult[] | undefined
        if (hasPerHitDefShift && move.multiHit?.type === 'variable') {
          weakArmorVariableRawResults = Array.from({ length: 3 }, (_, i) => {
            const hitInput = withPerHitDefShift(subsequentInput, i + 2)
            return executeDamageCalculation({ ...hitInput, isCritical: alwaysCrit })
          })
          weakArmorVariableRawCritResults = Array.from({ length: 3 }, (_, i) => {
            const hitInput = withPerHitDefShift(subsequentInput, i + 2)
            return executeDamageCalculation({ ...hitInput, isCritical: true })
          })
        }

        if (defenderHadMultiscale || halfBerryActive || hasPerHitDefShift) {
          const rawSubsequentInput = withPerHitDefShift(subsequentInput, 1)
          const rawResult = executeDamageCalculation({ ...rawSubsequentInput, isCritical: alwaysCrit })
          const rawCritResult = executeDamageCalculation({ ...rawSubsequentInput, isCritical: true })
          return {
            slotIndex: slotIdx, moveName, result, critResult, rawResult, rawCritResult,
            weakArmorPerHitResults, weakArmorCritPerHitResults,
            weakArmorVariableRawResults, weakArmorVariableRawCritResults,
          }
        }

        return {
          slotIndex: slotIdx, moveName, result, critResult,
          weakArmorPerHitResults, weakArmorCritPerHitResults,
          weakArmorVariableRawResults, weakArmorVariableRawCritResults,
        }
      } catch {
        return null
      }
    })
    .filter((result): result is CalculatedMoveResult => result !== null)
}
