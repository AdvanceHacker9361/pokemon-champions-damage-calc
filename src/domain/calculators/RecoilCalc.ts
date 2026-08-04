/**
 * 反動技（すてみタックル・ウッドハンマー等）の自傷反動ダメージ計算
 *
 * 反動ダメージは「実際に与えたダメージ × 反動率」で決まる（Gen 9 仕様）。
 * 実際に与えたダメージは防御側の残HPでクランプされる。
 * BattleSequenceCalc の攻守シミュレーションと同一の式を共有する。
 */
import type { MoveRecord } from '@/data/schemas/types'

/** 反動を無効化する特性 */
export const RECOIL_PREVENT_ABILITIES = new Set(['いしあたま', 'マジックガード'])

/**
 * 技と攻撃側特性から反動率を解決する。
 * 反動なし技・いしあたま/マジックガード持ちは undefined（反動なし）
 */
export function recoilRateForMove(
  move: Pick<MoveRecord, 'recoil'> | undefined,
  attackerAbility: string | null,
): number | undefined {
  if (!move || !move.recoil || move.recoil <= 0) return undefined
  if (attackerAbility && RECOIL_PREVENT_ABILITIES.has(attackerAbility)) return undefined
  return move.recoil
}

/** 実際に与えたダメージから反動ダメージを算出（最低1、与ダメ0なら反動なし） */
export function calcRecoilDamage(actualDamage: number, rate: number): number {
  if (actualDamage <= 0 || rate <= 0) return 0
  return Math.max(1, Math.round(actualDamage * rate))
}

/**
 * 与ダメ乱数幅から反動ダメージ範囲を算出。
 * 実際に与えるダメージは防御側最大HPでクランプ（オーバーキル分に反動は乗らない）
 */
export function calcRecoilRange(
  minDmg: number,
  maxDmg: number,
  rate: number,
  defenderMaxHp: number,
): { min: number; max: number } {
  const actualMin = Math.min(minDmg, defenderMaxHp)
  const actualMax = Math.min(maxDmg, defenderMaxHp)
  return {
    min: calcRecoilDamage(actualMin, rate),
    max: calcRecoilDamage(actualMax, rate),
  }
}

/** 反動率の分数表示ラベル（1/3, 1/4, 1/2）。分数で表せない率は%表示 */
export function recoilRateLabel(rate: number): string {
  const denom = Math.round(1 / rate)
  if (denom >= 1 && Math.abs(1 / denom - rate) < 0.01) return `1/${denom}`
  return `${Math.round(rate * 100)}%`
}
