import type { DamageResult, KoResult } from '@/domain/models/DamageResult'
import type { MultiHitData } from '@/domain/models/Move'
import { calcChildRolls, computeEffectiveRolls } from '@/domain/calculators/RollAggregation'
import {
  calcKoProbability,
  calcVariableMultiHitKo,
  type VariableMultiHitResult,
} from '@/domain/calculators/KoProbabilityCalc'

/**
 * 表示用サマリの入力。`result` / `rawResult` / `perHitResults` などの
 * 「結果セット」は呼び出し側で通常・急所のどちらかを選択して渡す
 * （DamageResultRow の急所トグルに対応するため）。
 */
export interface MoveDisplaySummaryInput {
  /** 表示対象の結果（通常 or 急所。呼び出し側で選択済み） */
  result: DamageResult
  /** マルチスケイル/半減実 無効時（2発目以降用）の素ダメ結果 */
  rawResult?: DamageResult
  /** 段階威力型（トリプルアクセル等）の各発個別結果 */
  perHitResults?: DamageResult[]
  /** くだけるよろい/じきゅうりょく: 固定多段技の各発個別結果 */
  weakArmorPerHitResults?: DamageResult[]
  /** くだけるよろい/じきゅうりょく + 変動連続技: 3〜5発目用の追加素ダメ */
  weakArmorVariableRawResults?: DamageResult[]
  multiHit: MultiHitData | null | undefined
  isParentalBond: boolean
  isDisguiseIntact: boolean
  variableMultiHitDist: { hits: number; prob: number }[]
}

export interface MoveDisplaySummary {
  /** 表示用の最小ダメージ（ばけのかわ固定ダメ・変動連続技加重を反映済み） */
  min: number
  /** 表示用の最大ダメージ（同上） */
  max: number
  percentMin: number
  percentMax: number
  defenderMaxHp: number
  /** 表示用のKO判定（実効ロールから再計算済み） */
  koResult: KoResult
  /** 選択された結果セットの素の16乱数 */
  rolls: number[]
  /** 2発目以降用ロール（rawResult 未指定なら rolls と同一） */
  rawRolls: number[]
  /** おやこあいの子ロール */
  childRolls: number[]
  /** ばけのかわ固定ダメを含まない実効ロール */
  effectiveRolls: number[]
  /** effectiveRolls + ばけのかわ固定ダメ（画面に並べる16乱数） */
  displayRolls: number[]
  /** ばけのかわ発動時の固定ダメ（floor(defenderMaxHp / 8)）。非発動時は 0 */
  disguiseFlatDmg: number
  /** 変動連続技 × ばけのかわ のヒット数加重サマリ（該当しない場合は null） */
  variableSummary: VariableMultiHitResult | null
  /** 変動連続技パネル用: 1発目のロール（ばけのかわ時は固定ダメ） */
  variableFirstRolls: number[]
  /** 変動連続技パネル用: 2発目以降のロール（段階低下時はヒット別） */
  variableRawRolls: number[] | number[][]
  /** くだけるよろい/じきゅうりょく の 3〜5発目ロール（ヒット別） */
  weakArmorVariableRawRollsByHit?: number[][]
}

/**
 * 技1件分の「表示用」ダメージ範囲・KO判定を算出する純粋関数。
 *
 * ばけのかわ（1発目無効 + 解除時の固定ダメ）・おやこあい（親子合算 / 子のみ）・
 * 固定多段技の合計・くだけるよろい/じきゅうりょくの段階別ロール・
 * 変動連続技のヒット数加重を、DamageResultRow と DamageSummaryHeader で
 * 同一の実装から得るために切り出したもの。
 */
export function computeMoveDisplaySummary(
  input: MoveDisplaySummaryInput,
): MoveDisplaySummary {
  const {
    result, rawResult, perHitResults, weakArmorPerHitResults, weakArmorVariableRawResults,
    multiHit, isParentalBond, isDisguiseIntact, variableMultiHitDist,
  } = input
  const { defenderMaxHp } = result

  const rolls = Array.from(result.rolls)
  const rawRolls = rawResult ? Array.from(rawResult.rolls) : rolls
  const childRolls = calcChildRolls(rawRolls)

  const weakArmorVariableRawRollsByHit: number[][] | undefined = weakArmorVariableRawResults
    ? weakArmorVariableRawResults.map(r => Array.from(r.rolls))
    : undefined

  const disguiseFlatDmg = isDisguiseIntact ? Math.floor(defenderMaxHp / 8) : 0

  const effectiveRolls = computeEffectiveRolls({
    rolls, rawRolls, multiHit, isParentalBond, isDisguiseIntact, perHitResults, weakArmorPerHitResults,
  })

  const isVariableMultiHit = multiHit?.type === 'variable'
  const variableFirstRolls = isVariableMultiHit && isDisguiseIntact
    ? rolls.map(() => disguiseFlatDmg)
    : rolls
  const variableRawRolls: number[] | number[][] = weakArmorVariableRawRollsByHit?.length
    ? [rawRolls, ...weakArmorVariableRawRollsByHit]
    : rawRolls
  const variableSummary = isVariableMultiHit && isDisguiseIntact
    ? calcVariableMultiHitKo(
        variableFirstRolls, defenderMaxHp, variableMultiHitDist, variableRawRolls,
      )
    : null

  const displayRolls = effectiveRolls.map(r => r + disguiseFlatDmg)
  const min = variableSummary?.minDmg ?? displayRolls[0]
  const max = variableSummary?.maxDmg ?? displayRolls[displayRolls.length - 1]

  let koResult: KoResult
  if (variableSummary) {
    koResult = variableSummary.totalKoProb >= 1
      ? { type: 'guaranteed', hits: 1 }
      : variableSummary.totalKoProb > 0
        ? { type: 'chance', hits: 1, probability: variableSummary.totalKoProb }
        : { type: 'no-ko' }
  } else if (isParentalBond || isDisguiseIntact) {
    koResult = calcKoProbability(displayRolls, defenderMaxHp)
  } else if (weakArmorPerHitResults && multiHit?.type === 'fixed') {
    koResult = calcKoProbability(displayRolls, defenderMaxHp)
  } else {
    koResult = result.koResult
  }

  return {
    min,
    max,
    percentMin: defenderMaxHp === 0 ? 0 : min / defenderMaxHp * 100,
    percentMax: defenderMaxHp === 0 ? 0 : max / defenderMaxHp * 100,
    defenderMaxHp,
    koResult,
    rolls,
    rawRolls,
    childRolls,
    effectiveRolls,
    displayRolls,
    disguiseFlatDmg,
    variableSummary,
    variableFirstRolls,
    variableRawRolls,
    weakArmorVariableRawRollsByHit,
  }
}
