import { useEffect } from 'react'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { useFieldStore } from '@/presentation/store/fieldStore'
import { useResultStore } from '@/presentation/store/resultStore'
import { executeDamageCalculation } from '@/application/usecases/CalculateDamageUseCase'
import { MoveRepository } from '@/data/repositories/MoveRepository'
import { createDefaultBattleField } from '@/domain/models/BattleField'

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
      .filter((m): m is string => m !== null)
      .map(moveName => {
        const move = MoveRepository.findByName(moveName)
        if (!move || move.category === '変化') return null

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
    attacker.effectiveAbility, attacker.itemName, attacker.moves,
    attacker.ranks, attacker.status,
    defender.pokemonId, defender.sp, defender.statNatures,
    defender.effectiveAbility, defender.itemName,
    defender.ranks, defender.status,
    field.weather, field.terrain,
    field.isReflect, field.isLightScreen, field.isAuroraVeil,
    setResults,
  ])
}

// re-export for convenience
export { createDefaultBattleField }
