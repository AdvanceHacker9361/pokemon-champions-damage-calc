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
import { wouldHalfBerryActivate } from '@/domain/calculators/DamageCalculator'
import { getTypeEffectiveness } from '@/domain/constants/typeChart'
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
      isGravity: field.isGravity,
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
              chargeActive: attacker.chargeActive,
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
            move,
            field: battleField,
          }
          // 確定急所技は常に急所補正で計算
          const alwaysCrit = move.alwaysCrit === true

          // 段階威力型（escalating）: 各発を個別計算して合算
          // マルチスケイル/ファントムガード: 1発目のみ半減、2発目以降は素ダメ
          // 半減実: 1発目で消費 → 2発目以降は無効
          const HP_FULL_ABILITIES = new Set(['マルチスケイル', 'ファントムガード'])
          const defenderHadMultiscale =
            HP_FULL_ABILITIES.has(defender.effectiveAbility) && defender.abilityActivated === true

          // 半減実が今回の技に対して発動するか
          // 技タイプ: スキン特性 / ウェザーボール は本来 DamageCalculator 内部で解決されるが、
          // 半減実検知は近似で十分（UI 表示用の rawResult 生成判定）
          const moveTypeForBerry = move.type
          // へんげんじざいで変換中ならその単タイプ、そうでなければ元タイプを使用
          const defenderEffTypes =
            (defender.effectiveAbility === 'へんげんじざい' &&
             defender.abilityActivated &&
             defender.proteanType)
              ? [defender.proteanType]
              : defender.types
          const typeEffForBerry = getTypeEffectiveness(moveTypeForBerry, defenderEffTypes)
          const halfBerryActive = wouldHalfBerryActivate(defender.itemName, moveTypeForBerry, typeEffForBerry)

          // くだけるよろい: 物理技のヒットごとに防御側Bランクが-1される
          const defenderWeakArmor =
            defender.effectiveAbility === 'くだけるよろい' &&
            move.category === '物理'

          // じきゅうりょく: 攻撃を受けるたびに防御側Bランクが+1される
          // Defランク上昇は物理技のダメージにしか影響しないため、物理技のみ計算に反映
          const defenderStamina =
            defender.effectiveAbility === 'じきゅうりょく' &&
            move.category === '物理'

          // 多段技で発ごとにDefランクが累積変化する特性
          // （くだけるよろい: -1/hit、じきゅうりょく: +1/hit）
          const hasPerHitDefShift = defenderWeakArmor || defenderStamina

          // 2発目以降の入力（マルチスケイル無効 + 半減実消費済み）
          const subsequentInput = (defenderHadMultiscale || halfBerryActive)
            ? {
                ...calcInput,
                defender: { ...calcInput.defender, abilityActivated: defenderHadMultiscale ? false : calcInput.defender.abilityActivated },
                skipHalfBerry: halfBerryActive ? true : undefined,
              }
            : calcInput

          // N発目の入力にDefランク累積変化を適用するヘルパー
          // drops: 1発目=0, 2発目=1, 3発目=2 ... (絶対量)
          // くだけるよろいなら -drops、じきゅうりょくなら +drops を defender.ranks.def に加算
          function withPerHitDefShift(input: typeof calcInput, drops: number): typeof calcInput {
            if (!hasPerHitDefShift || drops === 0) return input
            let delta = 0
            if (defenderWeakArmor) delta -= drops
            if (defenderStamina) delta += drops
            if (delta === 0) return input
            const currentDef = input.defender.ranks.def ?? 0
            const newDef = Math.max(-6, Math.min(6, currentDef + delta))
            if (newDef === currentDef) return input
            return {
              ...input,
              defender: { ...input.defender, ranks: { ...input.defender.ranks, def: newDef } },
            }
          }

          if (move.multiHit?.type === 'escalating') {
            const powers = move.multiHit.powers
            const baseMove = move  // 型ナロウイングのためキャプチャ

            function calcEscalating(isCrit: boolean) {
              const hitResults = powers.map((power, idx) => {
                // 2発目以降: マルチスケイル無効化 / 半減実消費済み
                // くだけるよろい/じきゅうりょく: idx発目はBランクをidx段階変化（くだけるよろい=-, じきゅうりょく=+）
                const baseInput = idx === 0 ? calcInput : subsequentInput
                const hitInput = withPerHitDefShift(baseInput, idx)
                return executeDamageCalculation({ ...hitInput, move: { ...baseMove, power }, isCritical: isCrit })
              })
              const defHp = hitResults[0].defenderMaxHp
              const summedRolls = hitResults[0].rolls.map((_, i) =>
                hitResults.reduce((sum, r) => sum + r.rolls[i], 0)
              ) as DamageResult['rolls']
              const totalResult: DamageResult = {
                rolls: summedRolls,
                min: summedRolls[0],
                max: summedRolls[15],
                defenderMaxHp: defHp,
                percentMin: calcRollPercent(summedRolls[0], defHp),
                percentMax: calcRollPercent(summedRolls[15], defHp),
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

          // くだけるよろい / じきゅうりょく + 固定多段技: 各発ごとにBランク変化を適用して個別計算
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

          // くだけるよろい / じきゅうりょく + 変動連続技: 3〜5発目用に追加でBランク変化（±2,±3,±4）のロールを生成
          // （rawResult が B±1 を担うので、ここでは B±2 以降を計算）
          let weakArmorVariableRawResults: DamageResult[] | undefined
          let weakArmorVariableRawCritResults: DamageResult[] | undefined
          if (hasPerHitDefShift && move.multiHit?.type === 'variable') {
            weakArmorVariableRawResults = Array.from({ length: 3 }, (_, i) => {
              const drops = i + 2  // i=0: B-2, i=1: B-3, i=2: B-4
              const hitInput = withPerHitDefShift(subsequentInput, drops)
              return executeDamageCalculation({ ...hitInput, isCritical: alwaysCrit })
            })
            weakArmorVariableRawCritResults = Array.from({ length: 3 }, (_, i) => {
              const drops = i + 2
              const hitInput = withPerHitDefShift(subsequentInput, drops)
              return executeDamageCalculation({ ...hitInput, isCritical: true })
            })
          }

          // 素ダメ版（マルチスケイル無効化 + 半減実消費済み + くだけるよろい/じきゅうりょく Bランク±1）:
          // 加算リストの2発目以降 / 多段技の2発目以降 / おやこあいの子 で使用
          if (defenderHadMultiscale || halfBerryActive || hasPerHitDefShift) {
            // おやこあい子・加算2発目以降は B±1（くだけるよろい/じきゅうりょく発動後のダメージを反映）
            const rawSubsequentInput = withPerHitDefShift(subsequentInput, 1)
            const rawResult = executeDamageCalculation({ ...rawSubsequentInput, isCritical: alwaysCrit })
            const rawCritResult = executeDamageCalculation({ ...rawSubsequentInput, isCritical: true })
            return {
              moveName, result, critResult, rawResult, rawCritResult,
              weakArmorPerHitResults, weakArmorCritPerHitResults,
              weakArmorVariableRawResults, weakArmorVariableRawCritResults,
            }
          }

          return {
            moveName, result, critResult,
            weakArmorPerHitResults, weakArmorCritPerHitResults,
            weakArmorVariableRawResults, weakArmorVariableRawCritResults,
          }
        } catch {
          return null
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    setResults(results)
  }, [
    attacker.pokemonId, attacker.baseStats, attacker.types, attacker.weight,
    attacker.sp, attacker.statNatures,
    attacker.effectiveAbility, attacker.itemName, attacker.moves, attacker.movePowers,
    attacker.ranks, attacker.status, attacker.abilityActivated, attacker.supremeOverlordBoost, attacker.proteanType, attacker.proteanStab,
    attacker.chargeActive,
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
