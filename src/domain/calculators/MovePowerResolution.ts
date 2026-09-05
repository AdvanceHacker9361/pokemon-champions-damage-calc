import type { SpecialMoveTag } from '@/domain/models/Move'
import type { ComputedStats, StatusCondition, Weather } from '@/domain/models/Pokemon'
import { resolveSpecialMove } from '@/domain/calculators/SpecialMoveCalc'
import { resolveEffectiveWeather } from '@/domain/calculators/MoveResolution'

/**
 * 基本威力の解決に必要な技の最小情報。
 * ドメインの `MoveData` と JSON スキーマの `MoveRecord` の両方をそのまま渡せる形にしている。
 */
export interface BasePowerMove {
  power?: number | null
  special?: SpecialMoveTag | null
}

export interface BasePowerContext {
  move: BasePowerMove
  /** ランク補正適用済みの攻撃側実数値 */
  attackerStats: ComputedStats
  /** ランク補正適用済みの防御側実数値 */
  defenderStats: ComputedStats
  attackerWeight?: number
  defenderWeight?: number
  attackerStatus?: StatusCondition
  /** アシストパワー等で参照する攻撃側のランク補正（実数値ではなく段階） */
  attackerRankModifiers?: Record<string, number>
  weather: Weather
  attackerAbility?: string
  defenderAbility?: string
}

/**
 * 技の「基本威力」を解決する唯一の実装。
 *
 * ダメージ計算エンジン（DamageCalculator）と UI 表示（技スロット / 結果行）の両方から呼び出し、
 * けたぐり・ヘビーボンバー・ジャイロボール・アシストパワー・からげんき・ウェザーボール等の
 * 実行時に決まる威力を 1 か所で決定する。
 *
 * じゅうでん（×2）・メトロノーム・Gのちから（じゅうりょく×1.5）といった
 * 基本威力の「後」に掛かる倍率はここには含まれない。
 */
export function resolveBasePower(ctx: BasePowerContext): number {
  const { move } = ctx

  if (move.special) {
    const result = resolveSpecialMove({
      tag: move.special,
      attackerStats: ctx.attackerStats,
      defenderStats: ctx.defenderStats,
      attackerWeight: ctx.attackerWeight,
      defenderWeight: ctx.defenderWeight,
      attackerStatus: ctx.attackerStatus,
      originalPower: move.power ?? 0,
      attackerRankModifiers: ctx.attackerRankModifiers,
    })
    if (result.effectivePower !== undefined) return result.effectivePower
  }

  // ウェザーボール: 天候時に威力2倍
  if (move.special === 'weather-ball' && resolveEffectiveWeather({
    weather: ctx.weather,
    attackerAbility: ctx.attackerAbility,
    defenderAbility: ctx.defenderAbility,
  }) !== null) {
    return 100
  }

  return move.power ?? 0
}
