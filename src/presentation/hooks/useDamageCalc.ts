import { useEffect } from 'react'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { useFieldStore } from '@/presentation/store/fieldStore'
import { useResultStore } from '@/presentation/store/resultStore'
import { executeDamageCalculation } from '@/application/usecases/CalculateDamageUseCase'
import { MoveRepository } from '@/data/repositories/MoveRepository'
import { createDefaultBattleField } from '@/domain/models/BattleField'
import { calculateHP } from '@/domain/calculators/StatCalculator'
import { resolveReversalPower } from '@/domain/calculators/SpecialMoveCalc'

export function useDamageCalc() {
  const attacker = useAttackerStore()
  const defender = useDefenderStore()
  const field = useFieldStore()
  const setResults = useResultStore(s => s.setResults)

  useEffect(() => {
    if (!attacker.pokemonId || !defender.pokemonId) {
      setResults([])
      return
    }

    const battleField = {
      weather: field.weather,
      terrain: field.terrain,
      isReflect: field.isReflect,
      isLightScreen: field.isLightScreen,
      isAuroraVeil: field.isAuroraVeil,
      isTrickRoom: field.isTrickRoom,
    }

    const results = attacker.moves
      .map((moveName, slotIdx) => {
        if (!moveName) return null
        let move = MoveRepository.findByName(moveName)
        if (!move || move.category === '変化') return null

        // 可変威力技: ユーザーが選択した威力を上書き（おはかまいり等）
        const powerOverride = attacker.movePowers[slotIdx]
        if (powerOverride !== null && move.powerOptions?.includes(powerOverride)) {
          move = { ...move, power: powerOverride }
        }

        // きしかいせい / じたばた: HP入力から威力を解決
        if (move.special === 'reversal') {
          const maxHP = calculateHP(attacker.baseStats.hp, attacker.sp.hp)
          // movePowers[slot] に HP入力から計算した威力が格納されている場合はそれを使用
          // 未入力の場合はデフォルト（満タン=威力20）
          const resolvedPower = powerOverride ?? resolveReversalPower(maxHP, maxHP)
          move = { ...move, power: resolvedPower }
        }

        try {
          const result = executeDamageCalculation({
            attacker: {
              baseStats: attacker.baseStats,
              types: attacker.types,
              sp: attacker.sp,
              statNatures: attacker.statNatures,
              abilityName: attacker.effectiveAbility,
              itemName: attacker.itemName,
              ranks: attacker.ranks,
              status: attacker.status,
              abilityActivated: attacker.abilityActivated,
              supremeOverlordBoost: attacker.supremeOverlordBoost,
              proteanType: attacker.proteanType,
              weight: attacker.weight,
            },
            defender: {
              baseStats: defender.baseStats,
              types: defender.types,
              sp: defender.sp,
              statNatures: defender.statNatures,
              abilityName: defender.effectiveAbility,
              itemName: defender.itemName,
              ranks: defender.ranks,
              status: defender.status,
              abilityActivated: defender.abilityActivated,
              proteanType: defender.proteanType,
              weight: defender.weight,
            },
            move,
            field: battleField,
          })
          return { moveName, result }
        } catch {
          return null
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    setResults(results)
  }, [
    attacker.pokemonId, attacker.sp, attacker.statNatures,
    attacker.effectiveAbility, attacker.itemName, attacker.moves, attacker.movePowers,
    attacker.ranks, attacker.status, attacker.abilityActivated, attacker.supremeOverlordBoost, attacker.proteanType,
    defender.pokemonId, defender.sp, defender.statNatures,
    defender.effectiveAbility, defender.itemName,
    defender.ranks, defender.status, defender.abilityActivated, defender.proteanType,
    field.weather, field.terrain,
    field.isReflect, field.isLightScreen, field.isAuroraVeil,
    setResults,
  ])
}

// re-export for convenience
export { createDefaultBattleField }
