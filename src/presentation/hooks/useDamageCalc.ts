import { useEffect } from 'react'
import { calculateMoveResults } from '@/application/usecases/CalculateMoveResultsUseCase'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { useFieldStore } from '@/presentation/store/fieldStore'
import { useResultStore } from '@/presentation/store/resultStore'
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

    setResults(calculateMoveResults({
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
        proteanStab: attacker.proteanStab,
        weight: attacker.weight,
        chargeActive: attacker.chargeActive,
        metronomeMultiplier: attacker.metronomeMultiplier,
        moves: attacker.moves,
        movePowers: attacker.movePowers,
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
        grounded: defender.grounded,
      },
      field: {
        weather: field.weather,
        terrain: field.terrain,
        isReflect: field.isReflect,
        isLightScreen: field.isLightScreen,
        isAuroraVeil: field.isAuroraVeil,
        isTrickRoom: field.isTrickRoom,
        isGravity: field.isGravity,
      },
    }))
  }, [
    attacker.pokemonId, attacker.baseStats, attacker.types, attacker.weight,
    attacker.sp, attacker.statNatures,
    attacker.effectiveAbility, attacker.itemName, attacker.moves, attacker.movePowers,
    attacker.ranks, attacker.status, attacker.abilityActivated, attacker.supremeOverlordBoost, attacker.proteanType, attacker.proteanStab,
    attacker.chargeActive, attacker.metronomeMultiplier,
    defender.pokemonId, defender.baseStats, defender.types, defender.weight,
    defender.sp, defender.statNatures,
    defender.effectiveAbility, defender.itemName,
    defender.ranks, defender.status, defender.abilityActivated, defender.proteanType,
    defender.grounded,
    field.weather, field.terrain,
    field.isReflect, field.isLightScreen, field.isAuroraVeil, field.isTrickRoom, field.isGravity,
    setResults,
  ])
}

// re-export for convenience
export { createDefaultBattleField }
