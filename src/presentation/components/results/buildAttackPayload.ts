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
  /** 防御側の「きょけんとつげき後（被ダメ2倍）」トグルが ON の状態で計算されたロールか */
  defenderGlaiveRush?: boolean
  /** 段階威力型（トリプルアクセル等）: 表示中（通常 or 急所）の各発ロール */
  perHitRolls?: number[][]
  /** 段階威力型: 急所時の各発ロール */
  critPerHitRolls?: number[][]
  /** くだけるよろい/じきゅうりょく + 固定多段: 表示中の各発ロール（Bランク段階変化込み） */
  weakArmorPerHitRolls?: number[][]
  /** くだけるよろい/じきゅうりょく + 固定多段: 急所時の各発ロール */
  weakArmorCritPerHitRolls?: number[][]
  /** くだけるよろい/じきゅうりょく + 変動連続技: 3〜5発目ロール（表示中） */
  weakArmorVariableRawRollsByHit?: number[][]
  /** くだけるよろい/じきゅうりょく + 変動連続技: 3〜5発目ロール（急所時） */
  weakArmorVariableRawCritRollsByHit?: number[][]
}

/** ヒット別ロールの組（通常・2回目以降・急所・急所2回目以降） */
interface PerHitSet {
  norm: number[][]
  raw: number[][]
  crit: number[][]
  rawCrit: number[][]
}

/** 同じ添字のロールを足し合わせる（表示用の合計ロール） */
function sumPerHit(hits: number[][]): number[] {
  if (hits.length === 0) return []
  return hits[0].map((_, i) => hits.reduce((s, h) => s + (h[i] ?? 0), 0))
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
    activeRawResult, rawCritResult, defenderMaxHp, defenderGlaiveRush,
    perHitRolls: escalatingPerHit, critPerHitRolls: escalatingCritPerHit,
    weakArmorPerHitRolls, weakArmorCritPerHitRolls,
    weakArmorVariableRawRollsByHit, weakArmorVariableRawCritRollsByHit,
  } = params

  const critLabel = isCritical ? '(急所)' : ''
  const disguiseFlatDmg = isDisguiseIntact ? Math.floor(defenderMaxHp / 8) : 0

  const isFixedMultiHit = multiHit?.type === 'fixed' && multiHit.count > 1 && !isDisguiseIntact
  const fixedHitCount = isFixedMultiHit ? (multiHit as { type: 'fixed'; count: number }).count : 1
  const isVariableMultiHit = multiHit?.type === 'variable'

  const isFixedAnyMultiHit = multiHit?.type === 'fixed' && multiHit.count > 1
  const isEscalating = multiHit?.type === 'escalating'
    && escalatingPerHit != null && escalatingPerHit.length > 1

  // ---- ヒット別ロール（時系列エンジンでヒット間のきのみ発動を再現するため）----
  const activeRaw = activeRawResult ? Array.from(activeRawResult.rolls) : undefined
  const critRaw = rawCritResult ? Array.from(rawCritResult.rolls) : undefined
  let perHit: PerHitSet | undefined
  if (isVariableMultiHit) {
    const maxHits = variableMultiHitDist[variableMultiHitDist.length - 1].hits
    const raw2 = activeRaw ?? rolls
    const rawCrit2 = critRaw ?? critRollsBase
    // 2発目 = 素ダメ（B±1）、3発目以降 = くだけるよろい等の段階別ロール（なければ素ダメ）
    const tailN = Array.from({ length: Math.max(0, maxHits - 1) }, (_, k) =>
      k === 0 ? raw2 : (weakArmorVariableRawRollsByHit?.[k - 1] ?? raw2))
    const tailC = Array.from({ length: Math.max(0, maxHits - 1) }, (_, k) =>
      k === 0 ? rawCrit2 : (weakArmorVariableRawCritRollsByHit?.[k - 1] ?? rawCrit2))
    perHit = {
      norm: [rolls, ...tailN],
      raw: [raw2, ...tailN],
      crit: [critRollsBase, ...tailC],
      rawCrit: [rawCrit2, ...tailC],
    }
  } else if (isFixedAnyMultiHit) {
    const count = (multiHit as { type: 'fixed'; count: number }).count
    const raw2 = activeRaw ?? rolls
    const rawCrit2 = critRaw ?? critRollsBase
    const tailN = Array.from({ length: count - 1 }, (_, k) => weakArmorPerHitRolls?.[k + 1] ?? raw2)
    const tailC = Array.from({ length: count - 1 }, (_, k) => weakArmorCritPerHitRolls?.[k + 1] ?? rawCrit2)
    perHit = {
      norm: [rolls, ...tailN],
      raw: [raw2, ...tailN],
      crit: [critRollsBase, ...tailC],
      rawCrit: [rawCrit2, ...tailC],
    }
  } else if (isEscalating && escalatingPerHit) {
    const critHits = escalatingCritPerHit ?? escalatingPerHit
    // 段階威力型は 2発目以降の素ダメ結果を持たないため、初撃のみ半減（マルチスケイル）を ×2 で近似
    const rawHit1 = activeRaw ?? (hadMultiscale ? escalatingPerHit[0].map(r => r * 2) : escalatingPerHit[0])
    const rawCritHit1 = critRaw ?? (hadMultiscale ? critHits[0].map(r => r * 2) : critHits[0])
    perHit = {
      norm: escalatingPerHit,
      raw: [rawHit1, ...escalatingPerHit.slice(1)],
      crit: critHits,
      rawCrit: [rawCritHit1, ...critHits.slice(1)],
    }
  } else if (isParentalBond) {
    const child = calcChildRolls(rawRolls)
    const childCrit = calcChildRolls(rawCritRollsBase)
    perHit = {
      norm: [rolls, child],
      raw: [rawRolls, child],
      crit: [critRollsBase, childCrit],
      rawCrit: [rawCritRollsBase, childCrit],
    }
  }
  if (perHit && isForcedCrit) {
    // 急所強制: 表示中ロールが既に急所。急所側も同じロールを使う（再混合しない）
    perHit = { ...perHit, crit: perHit.norm, rawCrit: perHit.raw }
  }
  // ばけのかわ: 最初の使用だけ1発目を無効化（固定ダメへ置換）。変動連続技は従来どおり。
  // 固定多段・段階威力・おやこあいもヒット別ロールを持つ場合は同じ規則で初撃を置換する
  const nullifyFirstHit = isDisguiseIntact && (isVariableMultiHit || perHit !== undefined)

  // 変動連続技は 1発分のロールを保存し、useAccumulatedDamage 側で 1使用分の
  // ダメージ分布（ヒット数加重）を組み立てて DP スロットへ流し込む。
  // 固定多段技は1使用（N発合計）を1イベントとして保存し、ヒット別は perHitRolls に持つ
  const accumRolls = isVariableMultiHit ? rolls
    : isFixedMultiHit ? effectiveRolls
    : effectiveRolls

  const useHadMultiscale = isVariableMultiHit ? (activeRawResult != null)
    : isFixedMultiHit ? (activeRawResult != null)
    : hadMultiscale
  const accumRawRolls = isVariableMultiHit
    ? (activeRawResult ? Array.from(activeRawResult.rolls) : rolls)
    : isFixedMultiHit && perHit
      ? sumPerHit(perHit.raw)
      : (hadMultiscale
          ? (activeRawResult ? Array.from(activeRawResult.rolls) : effectiveRolls.map(r => r * 2))
          : effectiveRolls)

  // 変動連続技: 単一使用の最小〜最大ダメ（ヒット数分布の両端で算出）
  const variableMinHits = isVariableMultiHit ? variableMultiHitDist[0].hits : 1
  const variableMaxHits = isVariableMultiHit
    ? variableMultiHitDist[variableMultiHitDist.length - 1].hits
    : 1
  const accumMin = isVariableMultiHit
    ? disguiseFlatDmg + (isDisguiseIntact ? 0 : accumRolls[0])
      + accumRawRolls[0] * (variableMinHits - 1)
    : accumRolls[0] + disguiseFlatDmg
  const accumMax = isVariableMultiHit
    ? disguiseFlatDmg + (isDisguiseIntact ? 0 : accumRolls[accumRolls.length - 1])
      + accumRawRolls[accumRawRolls.length - 1] * (variableMaxHits - 1)
    : accumRolls[accumRolls.length - 1] + disguiseFlatDmg
  const accumRawMin = isVariableMultiHit
    ? accumRawRolls[0] * variableMinHits
    : accumRawRolls[0]
  const accumRawMax = isVariableMultiHit
    ? accumRawRolls[accumRawRolls.length - 1] * variableMaxHits
    : accumRawRolls[accumRawRolls.length - 1]

  const accumCritRolls = isForcedCrit ? accumRolls
    : isVariableMultiHit ? critRollsBase
    : isFixedMultiHit ? effectiveCritRolls
    : effectiveCritRolls
  const accumRawCritRolls = isForcedCrit ? accumRawRolls
    : isVariableMultiHit
      ? (rawCritResult ? Array.from(rawCritResult.rolls) : critRollsBase)
      : isFixedMultiHit && perHit
        ? sumPerHit(perHit.rawCrit)
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

  // 固定多段技も ×N は「使用回数」（N発合計 × 使用回数）。ヒット別は perHitRolls で表現する
  const defaultUsages = 1

  const variableLabelTag = isVariableMultiHit
    ? (variableMinHits === variableMaxHits ? `(${variableMaxHits}発)` : `(${variableMinHits}〜${variableMaxHits}発加重)`)
    : isFixedMultiHit ? `(${fixedHitCount}発)` : ''

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
      ? disguiseFlatDmg + (isDisguiseIntact ? 0 : accumCritRolls[0])
        + accumRawCritRolls[0] * (variableMinHits - 1)
      : accumCritRolls[0] + disguiseFlatDmg,
    critMax: isVariableMultiHit
      ? disguiseFlatDmg + (isDisguiseIntact ? 0 : accumCritRolls[accumCritRolls.length - 1])
        + accumRawCritRolls[accumRawCritRolls.length - 1] * (variableMaxHits - 1)
      : accumCritRolls[accumCritRolls.length - 1] + disguiseFlatDmg,
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
    perHitRolls: perHit?.norm,
    perHitRawRolls: perHit?.raw,
    perHitCritRolls: perHit?.crit,
    perHitRawCritRolls: perHit?.rawCrit,
    firstHitNullified: nullifyFirstHit,
    firstHitFixedDamage: disguiseFlatDmg > 0 ? disguiseFlatDmg : undefined,
    defenderGlaiveRush: defenderGlaiveRush === true ? true : undefined,
  }
}
