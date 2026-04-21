import type { SpecialMoveTag } from '@/domain/models/Move'
import type { ComputedStats } from '@/domain/models/Pokemon'
import type { MoveCategory } from '@/domain/models/Pokemon'
import type { StatusCondition } from '@/domain/models/Pokemon'

/**
 * きしかいせい / じたばた の HP別威力を返す
 * ratio = floor(48 * currentHP / maxHP) で6段階に分類
 */
export function resolveReversalPower(currentHP: number, maxHP: number): number {
  if (maxHP <= 0) return 20
  const ratio = Math.floor(48 * Math.max(1, currentHP) / maxHP)
  if (ratio < 2)  return 200  // HP ≈ 4% 以下
  if (ratio < 5)  return 150  // HP ≈ 9% 以下
  if (ratio < 9)  return 100  // HP ≈ 17% 以下
  if (ratio < 17) return 80   // HP ≈ 34% 以下
  if (ratio < 33) return 40   // HP ≈ 68% 以下
  return 20                    // それ以上
}

/** 体重別威力テーブル (くさむすび・けたぐり) */
const WEIGHT_POWER_TABLE: { maxWeight: number; power: number }[] = [
  { maxWeight: 10,   power: 20 },
  { maxWeight: 25,   power: 40 },
  { maxWeight: 50,   power: 60 },
  { maxWeight: 100,  power: 80 },
  { maxWeight: 200,  power: 100 },
  { maxWeight: Infinity, power: 120 },
]

export function getWeightPower(weight: number): number {
  return WEIGHT_POWER_TABLE.find(t => weight < t.maxWeight)?.power ?? 120
}

export interface SpecialMoveContext {
  tag: SpecialMoveTag
  attackerStats: ComputedStats
  defenderStats: ComputedStats
  attackerWeight?: number
  defenderWeight?: number
  attackerStatus?: StatusCondition
  originalPower?: number
  attackerRankModifiers?: Record<string, number>
}

export interface SpecialMoveResult {
  /** 実際に使用する攻撃実数値 */
  effectiveAtk: number
  /** 実際に使用する防御実数値 */
  effectiveDef: number
  /** 適用する技の威力 */
  effectivePower: number
  /** 物理/特殊の判定（特殊だが防御参照の技等に使用） */
  effectiveCategory: MoveCategory
}

export function resolveSpecialMove(ctx: SpecialMoveContext): Partial<SpecialMoveResult> {
  const { tag, attackerStats, defenderStats, attackerWeight, defenderWeight, attackerStatus,
          attackerRankModifiers } = ctx

  switch (tag) {
    case 'foul-play':
      // イカサマ: 相手のこうげきで計算
      return { effectiveAtk: defenderStats.atk }

    case 'body-press':
      // ボディプレス: 自分のぼうぎょで攻撃
      return { effectiveAtk: attackerStats.def, effectiveCategory: '物理' }

    case 'photon-geyser':
      // フォトンゲイザー: 攻撃 > 特攻なら物理扱い
      if (attackerStats.atk > attackerStats.spa) {
        return { effectiveAtk: attackerStats.atk, effectiveCategory: '物理' }
      }
      return { effectiveAtk: attackerStats.spa, effectiveCategory: '特殊' }

    case 'psyshock':
      // サイコショック・サイコブレイク: 特殊技だが相手のぼうぎょで計算
      return { effectiveDef: defenderStats.def, effectiveCategory: '特殊' }

    case 'gyro-ball': {
      // ジャイロボール: min(150, floor(25 × 相手S ÷ 自分S))
      const atkSpe = Math.max(1, attackerStats.spe)
      const power = Math.min(150, Math.floor(25 * defenderStats.spe / atkSpe))
      return { effectivePower: Math.max(1, power) }
    }

    case 'grass-knot':
    case 'low-kick':
      // 体重依存威力
      return { effectivePower: getWeightPower(defenderWeight ?? 0) }

    case 'hex':
      // たたりめ: 状態異常があれば威力2倍
      if (attackerStatus != null || ctx.defenderStats) {
        // hexは相手の状態異常で威力2倍
        return { effectivePower: (ctx.originalPower ?? 65) * 2 }
      }
      return {}

    case 'facade':
      // からげんき: やけど/まひ/どく時威力140
      if (attackerStatus === 'やけど' || attackerStatus === 'まひ' ||
          attackerStatus === 'どく' || attackerStatus === 'もうどく') {
        return { effectivePower: 140 }
      }
      return {}

    case 'heavy-slam': {
      const atkW = attackerWeight ?? 0
      const defW = defenderWeight ?? 1
      const ratio = defW > 0 ? atkW / defW : 0
      if (ratio >= 5) return { effectivePower: 120 }
      if (ratio >= 4) return { effectivePower: 100 }
      if (ratio >= 3) return { effectivePower: 80 }
      if (ratio >= 2) return { effectivePower: 60 }
      return { effectivePower: 40 }
    }

    case 'stored-power': {
      // アシストパワー・つけあがる: 20 + 20 × Σ(自分の正のランク補正)
      const positiveSum = Object.values(attackerRankModifiers ?? {})
        .reduce((sum, v) => sum + Math.max(0, v), 0)
      return { effectivePower: 20 + 20 * positiveSum }
    }

    case 'stealth-rock':
      // ステルスロックはダメージ計算とは別扱い（DamageCalculatorで処理）
      return {}

    default:
      return {}
  }
}
