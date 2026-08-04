/**
 * 吸収技（ギガドレイン・ドレインキッス等）の回復量計算
 *
 * 回復量は「実際に与えたダメージ × 吸収率」で決まる。
 * 実際に与えたダメージは防御側の残HPでクランプされる。
 * BattleSequenceCalc の攻守シミュレーション（max(1, floor(actual × drain))）と同一式を共有する。
 */

/** 実際に与えたダメージから吸収回復量を算出（最低1、与ダメ0なら回復なし） */
export function calcDrainHeal(actualDamage: number, rate: number): number {
  if (actualDamage <= 0 || rate <= 0) return 0
  return Math.max(1, Math.floor(actualDamage * rate))
}

/**
 * 与ダメ乱数幅から吸収回復量の範囲を算出。
 * 実際に与えるダメージは防御側最大HPでクランプ（オーバーキル分は回復に乗らない）
 */
export function calcDrainRange(
  minDmg: number,
  maxDmg: number,
  rate: number,
  defenderMaxHp: number,
): { min: number; max: number } {
  const actualMin = Math.min(minDmg, defenderMaxHp)
  const actualMax = Math.min(maxDmg, defenderMaxHp)
  return {
    min: calcDrainHeal(actualMin, rate),
    max: calcDrainHeal(actualMax, rate),
  }
}

/** 吸収率の分数表示ラベル（1/2, 3/4 等）。分数で表せない率は%表示 */
export function drainRateLabel(rate: number): string {
  for (let denom = 2; denom <= 8; denom++) {
    const num = Math.round(rate * denom)
    if (num >= 1 && Math.abs(num / denom - rate) < 0.01) return `${num}/${denom}`
  }
  return `${Math.round(rate * 100)}%`
}
