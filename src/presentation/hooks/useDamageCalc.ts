import { useEffect } from 'react'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { useFieldStore } from '@/presentation/store/fieldStore'
import { useResultStore } from '@/presentation/store/resultStore'
import { executeDamageCalculation } from '@/application/usecases/CalculateDamageUseCase'
import { MoveRepository } from '@/data/repositories/MoveRepository'
import { createDefaultBattleField } from '@/domain/models/BattleField'
import { calculateHP } from '@/domain/calculators/StatCalculator'
import { resolveReversalPower } from '@/domain/calculators/SpecialMoveCalc'
import { calcKoProbability } from '@/domain/calculators/KoProbabilityCalc'
import { calcRollPercent } from '@/domain/models/DamageResult'
import type { DamageResult } from '@/domain/models/DamageResult'

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
          const calcInput = {
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
          }
          // 確定急所技は常に急所補正で計算
          const alwaysCrit = move.alwaysCrit === true

          // 段階威力型（escalating）: 各発を個別計算して合算
          // マルチスケイル/ファントムガード: 1発目のみ半減、2発目以降は素ダメ
          const HP_FULL_ABILITIES = new Set(['マルチスケイル', 'ファントムガード'])
          const defenderHadMultiscale =
            HP_FULL_ABILITIES.has(defender.effectiveAbility) && defender.abilityActivated === true

          if (move.multiHit?.type === 'escalating') {
            const powers = move.multiHit.powers
            const baseMove = move  // 型ナロウイングのためキャプチャ

            function calcEscalating(isCrit: boolean) {
              const hitResults = powers.map((power, idx) => {
                // 2発目以降はマルチスケイル無効化（HP満タンでないため）
                const hitInput = idx === 0 || !defenderHadMultiscale
                  ? calcInput
                  : { ...calcInput, defender: { ...calcInput.defender, abilityActivated: false } }
                return executeDamageCalculation({ ...hitInput, move: { ...baseMove, power }, isCritical: isCrit })
              })
              const defHp = hitResults[0].defenderMaxHp
              const summedRolls = hitResults[0].rolls.map((_, i) =>
                hitResults.reduce((sum, r) => sum + r.rolls[i], 0)
              ) as DamageResult['rolls']
              const totalResult: DamageResult = {
                rolls: summedRolls,
                min: summedRolls[0],
                max: summedRolls[14],
                defenderMaxHp: defHp,
                percentMin: calcRollPercent(summedRolls[0], defHp),
                percentMax: calcRollPercent(summedRolls[14], defHp),
                koResult: calcKoProbability(Array.from(summedRolls), defHp),
              }
              return { totalResult, hitResults }
            }

            const { totalResult: result, hitResults: perHitResults } = calcEscalating(alwaysCrit)
            const { totalResult: critResult, hitResults: critPerHitResults } = calcEscalating(true)
            return { moveName, result, critResult, perHitResults, critPerHitResults }
          }

          const result = executeDamageCalculation({ ...calcInput, isCritical: alwaysCrit })
          const critResult = executeDamageCalculation({ ...calcInput, isCritical: true })

          // 素ダメ版（マルチスケイル無効化）: 加算リストの2発目以降 / 多段技の2発目以降 で使用
          if (defenderHadMultiscale) {
            const rawInput = { ...calcInput, defender: { ...calcInput.defender, abilityActivated: false } }
            const rawResult = executeDamageCalculation({ ...rawInput, isCritical: alwaysCrit })
            const rawCritResult = executeDamageCalculation({ ...rawInput, isCritical: true })
            return { moveName, result, critResult, rawResult, rawCritResult }
          }

          return { moveName, result, critResult }
        } catch {
          return null
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    setResults(results)
  }, [
    attacker.pokemonId, attacker.sp, attacker.statNatures,
    attacker.effectiveAbility, attacker.itemName, attacker.moves, attacker.movePowers,
    attacker.ranks, attacker.status, attacker.abilityActivated, attacker.supremeOverlordBoost, attacker.proteanType, attacker.proteanStab,
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
