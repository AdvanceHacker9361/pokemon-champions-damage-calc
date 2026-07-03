import type { DamageResult } from '@/domain/models/DamageResult'
import type { MultiHitData } from '@/domain/models/Move'
import { calcChildRolls } from '@/domain/calculators/RollAggregation'
import type { AttackPayload } from '@/presentation/store/progressionStore'

export interface BuildAttackPayloadParams {
  attackerName: string
  moveName: string
  isCritical: boolean
  isParentalBond: boolean
  isDisguiseIntact: boolean
  isForcedCrit: boolean
  hadMultiscale: boolean
  multiHit: MultiHitData | null | undefined
  moveCritChance: number
  variableMultiHitDist: { hits: number; prob: number }[]
  rolls: number[]
  rawRolls: number[]
  effectiveRolls: number[]
  critRollsBase: number[]
  rawCritRollsBase: number[]
  effectiveCritRolls: number[]
  activeRawResult: DamageResult | undefined
  rawCritResult: DamageResult | undefined
  defenderMaxHp: number
}

/**
 * handleAddToAccum の本体ロジック。progressionStore.addAttack に渡す
 * AttackPayload を組み立てる純粋関数（ロジック変更なし、元実装から機械的に抽出）。
 */
export function buildAttackPayload(params: BuildAttackPayloadParams): AttackPayload {
  const {
    attackerName, moveName, isCritical, isParentalBond, isDisguiseIntact, isForcedCrit,
    hadMultiscale, multiHit, moveCritChance, variableMultiHitDist,
    rolls, rawRolls, effectiveRolls, critRollsBase, rawCritRollsBase, effectiveCritRolls,
    activeRawResult, rawCritResult, defenderMaxHp,
  } = params

  const critLabel = isCritical ? '(急所)' : ''

  const isFixedMultiHit = multiHit?.type === 'fixed' && multiHit.count > 1 && !isDisguiseIntact
  const fixedHitCount = isFixedMultiHit ? (multiHit as { type: 'fixed'; count: number }).count : 1
  const isVariableMultiHit = multiHit?.type === 'variable' && !isDisguiseIntact

  // 変動連続技は 1発分のロールを保存し、useAccumulatedDamage 側で 1使用分の
  // ダメージ分布（ヒット数加重）を組み立てて DP スロットへ流し込む
  const accumRolls = isVariableMultiHit ? rolls
    : isFixedMultiHit ? rolls
    : effectiveRolls

  const useHadMultiscale = isVariableMultiHit ? (activeRawResult != null)
    : isFixedMultiHit ? (activeRawResult != null)
    : hadMultiscale
  const accumRawRolls = isVariableMultiHit
    ? (activeRawResult ? Array.from(activeRawResult.rolls) : rolls)
    : isFixedMultiHit
      ? (activeRawResult ? Array.from(activeRawResult.rolls) : accumRolls)
      : (hadMultiscale
          ? (activeRawResult ? Array.from(activeRawResult.rolls) : effectiveRolls.map(r => r * 2))
          : effectiveRolls)

  // 変動連続技: 単一使用の最小〜最大ダメ（ヒット数分布の両端で算出）
  const variableMinHits = isVariableMultiHit ? variableMultiHitDist[0].hits : 1
  const variableMaxHits = isVariableMultiHit
    ? variableMultiHitDist[variableMultiHitDist.length - 1].hits
    : 1
  const accumMin = isVariableMultiHit
    ? accumRolls[0] + accumRawRolls[0] * (variableMinHits - 1)
    : accumRolls[0]
  const accumMax = isVariableMultiHit
    ? accumRolls[accumRolls.length - 1] + accumRawRolls[accumRawRolls.length - 1] * (variableMaxHits - 1)
    : accumRolls[accumRolls.length - 1]
  const accumRawMin = isVariableMultiHit
    ? accumRawRolls[0] * variableMinHits
    : accumRawRolls[0]
  const accumRawMax = isVariableMultiHit
    ? accumRawRolls[accumRawRolls.length - 1] * variableMaxHits
    : accumRawRolls[accumRawRolls.length - 1]

  const accumCritRolls = isForcedCrit ? accumRolls
    : isVariableMultiHit ? critRollsBase
    : isFixedMultiHit ? critRollsBase
    : effectiveCritRolls
  const accumRawCritRolls = isForcedCrit ? accumRawRolls
    : isVariableMultiHit
      ? (rawCritResult ? Array.from(rawCritResult.rolls) : critRollsBase)
      : isFixedMultiHit
        ? (rawCritResult ? Array.from(rawCritResult.rolls) : critRollsBase)
        : effectiveCritRolls
  const thisCritChance = isForcedCrit ? 1.0 : moveCritChance

  let pbParentRolls: number[] | undefined
  let pbParentCritRolls: number[] | undefined
  let pbParentRawRolls: number[] | undefined
  let pbParentRawCritRolls: number[] | undefined
  let pbChildRolls: number[] | undefined
  let pbChildCritRolls: number[] | undefined
  if (isParentalBond && !isDisguiseIntact) {
    pbParentRolls = rolls
    pbParentCritRolls = critRollsBase
    pbParentRawRolls = rawRolls
    pbParentRawCritRolls = rawCritRollsBase
    pbChildRolls = calcChildRolls(rawRolls)
    pbChildCritRolls = calcChildRolls(rawCritRollsBase)
  }

  const defaultUsages = isFixedMultiHit ? fixedHitCount : 1

  const variableLabelTag = isVariableMultiHit
    ? (variableMinHits === variableMaxHits ? `(${variableMaxHits}発)` : `(${variableMinHits}〜${variableMaxHits}発加重)`)
    : ''

  return {
    label: `${attackerName} の ${moveName}${critLabel}${variableLabelTag}${isParentalBond ? '(おやこあい)' : ''}${isDisguiseIntact ? '+ばけのかわ' : ''}`,
    moveName,
    rolls: accumRolls,
    rawRolls: accumRawRolls,
    usages: defaultUsages,
    minDmg: accumMin,
    maxDmg: accumMax,
    rawMin: accumRawMin,
    rawMax: accumRawMax,
    defenderMaxHp,
    hadMultiscale: useHadMultiscale,
    critRolls: accumCritRolls,
    rawCritRolls: accumRawCritRolls,
    critMin: isVariableMultiHit
      ? accumCritRolls[0] + accumRawCritRolls[0] * (variableMinHits - 1)
      : accumCritRolls[0],
    critMax: isVariableMultiHit
      ? accumCritRolls[accumCritRolls.length - 1] + accumRawCritRolls[accumRawCritRolls.length - 1] * (variableMaxHits - 1)
      : accumCritRolls[accumCritRolls.length - 1],
    rawCritMin: isVariableMultiHit
      ? accumRawCritRolls[0] * variableMinHits
      : accumRawCritRolls[0],
    rawCritMax: isVariableMultiHit
      ? accumRawCritRolls[accumRawCritRolls.length - 1] * variableMaxHits
      : accumRawCritRolls[accumRawCritRolls.length - 1],
    critChance: thisCritChance,
    isForcedCrit,
    pbParentRolls,
    pbParentCritRolls,
    pbParentRawRolls,
    pbParentRawCritRolls,
    pbChildRolls,
    pbChildCritRolls,
    variableHitDist: isVariableMultiHit ? variableMultiHitDist : undefined,
  }
}
