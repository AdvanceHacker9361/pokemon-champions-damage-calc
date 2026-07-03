import type { MultiHitData } from '@/domain/models/Move'

/** おやこあい: 子の一撃ロールを計算 (各ロールの25%) */
export function calcChildRolls(parentRolls: number[]): number[] {
  return parentRolls.map(r => Math.floor(r * 0.25))
}

/** computeEffectiveRolls で使う DamageResult の必要最小限の構造的型 */
interface RollsHolder {
  rolls: readonly number[]
}

/**
 * rolls/rawRolls と各種フラグから、メイン表示用の実効ロール列を算出する
 * （おやこあい合算・ばけのかわ無効化・固定多段合計 等を統一的に処理）
 */
export function computeEffectiveRolls(params: {
  rolls: number[]
  rawRolls: number[]
  multiHit: MultiHitData | null | undefined
  isParentalBond: boolean
  isDisguiseIntact: boolean
  perHitResults?: RollsHolder[]
  weakArmorPerHitResults?: RollsHolder[]
}): number[] {
  const { rolls, rawRolls, multiHit, isParentalBond, isDisguiseIntact, perHitResults, weakArmorPerHitResults } = params
  const childRollsArr = calcChildRolls(rawRolls)
  const combinedRolls = rolls.map((r, i) => r + childRollsArr[i])

  if (isDisguiseIntact) {
    if (isParentalBond) return childRollsArr
    if (multiHit?.type === 'escalating' && perHitResults && perHitResults.length > 1) {
      return perHitResults.slice(1).reduce(
        (acc, r) => acc.map((v, i) => v + r.rolls[i]),
        Array(16).fill(0) as number[],
      )
    }
    if (multiHit?.type === 'fixed' && multiHit.count > 1) {
      const remaining = multiHit.count - 1
      return rolls.map(r => r * remaining)
    }
    return rolls.map(() => 0)
  }
  if (isParentalBond) return combinedRolls
  // くだけるよろい: 固定多段技の各発でBランク低下を反映した個別結果を合算
  if (weakArmorPerHitResults && multiHit?.type === 'fixed') {
    return weakArmorPerHitResults[0].rolls.map((_, i) =>
      weakArmorPerHitResults.reduce((sum, r) => sum + r.rolls[i], 0)
    )
  }
  if (multiHit?.type === 'fixed' && multiHit.count > 1) {
    const count = multiHit.count
    return rolls.map((r, i) => r + rawRolls[i] * (count - 1))
  }
  return rolls
}
