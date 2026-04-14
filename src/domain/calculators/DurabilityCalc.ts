import type { StatKey } from '@/domain/models/Pokemon'
import { calculateHP, calculateNonHP } from './StatCalculator'
import { SP_MAX_STAT, SP_MAX_TOTAL } from '@/domain/constants/spLimits'
import { getNatureModifier } from '@/domain/constants/natureModifiers'
import type { NatureModifier } from '@/domain/constants/natureModifiers'

export interface DurabilityTarget {
  /** 耐えたい技のダメージ（最大ロールを指定） */
  targetDamage: number
  /** 耐え条件: 'survive-1' = 確定耐え（1発は必ず耐える） */
  condition: 'survive-1'
}

export interface DurabilityResult {
  /** HP に振るべき最小 SP */
  hpSp: number
  /** 防御/特防 に振るべき最小 SP */
  defSp: number
  /** 達成した HP 実数値 */
  achievedHp: number
  /** 達成した Def/SpD 実数値 */
  achievedDef: number
  /** 可能か否か */
  achievable: boolean
}

/**
 * 指定ダメージを確定耐えするのに必要な H/B(D) の最小 SP を逆算する
 * @param hpBase - HP 種族値
 * @param defBase - 防御/特防 種族値
 * @param natureName - 性格名
 * @param defStatKey - 'def' or 'spd'
 * @param targetDamage - 耐えたい最大ダメージ値（最大乱数ロール）
 * @param currentHpSp - 既に割り当て済みのHP SP（固定する場合）
 * @param currentDefSp - 既に割り当て済みのDef SP（固定する場合）
 */
export function calcMinDurability(
  hpBase: number,
  defBase: number,
  natureName: string,
  defStatKey: StatKey,
  targetDamage: number,
  availableSp: number = SP_MAX_TOTAL,
): DurabilityResult {
  const defNature = getNatureModifier(natureName, defStatKey) as NatureModifier

  // H と B/D を総当たりで最小SPを探す
  for (let totalSp = 0; totalSp <= Math.min(availableSp, SP_MAX_TOTAL); totalSp++) {
    for (let hSp = 0; hSp <= Math.min(totalSp, SP_MAX_STAT); hSp++) {
      const dSp = totalSp - hSp
      if (dSp > SP_MAX_STAT) continue

      const hp = calculateHP(hpBase, hSp)
      const def = calculateNonHP(defBase, dSp, defNature)

      // 元のダメージ計算はA/Dを独立させているので、
      // ここでは「targetDamage < hp」であれば耐える
      if (targetDamage < hp) {
        return {
          hpSp: hSp, defSp: dSp,
          achievedHp: hp, achievedDef: def,
          achievable: true,
        }
      }
    }
  }

  return {
    hpSp: SP_MAX_STAT, defSp: SP_MAX_STAT,
    achievedHp: calculateHP(hpBase, SP_MAX_STAT),
    achievedDef: calculateNonHP(defBase, SP_MAX_STAT, defNature),
    achievable: false,
  }
}
