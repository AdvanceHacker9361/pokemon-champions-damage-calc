/**
 * 常時効果カタログの共通ヘルパー（V3.18.0 フェーズC）。
 * コンポーネント以外の定数・関数はここに置き、Fast Refresh を壊さないようにする。
 */
import type {
  PassiveAmount,
  PassiveKind,
  PassiveSide,
  PassiveTiming,
} from '@/domain/models/PassiveEffect'
import { resolvePassiveAmount } from '@/domain/models/PassiveEffect'
import type { TypeName } from '@/domain/models/Pokemon'

/** タイミングバッジの表示文言とツールチップ（1文で規則を説明） */
export const TIMING_BADGE: Record<PassiveTiming, { text: string; title: string }> = {
  start: {
    text: '開始時',
    title: '時系列のいちばん先頭で適用します（ステルスロック・まきびしなどの登場時ダメージ）',
  },
  turnEnd: {
    text: '毎T末',
    title: '各ターンの終了時（次のターンが始まる直前）に1回ずつ適用します（天候・状態異常・持ち物回復など）',
  },
  perAttack: {
    text: '攻撃毎',
    title: 'その側が攻撃するたび、その攻撃の直後に1回ずつ適用します（いのちのたまなど）',
  },
}

export interface PassiveTargetContext {
  attackerMaxHp: number
  defenderMaxHp: number
  attackerTypes: TypeName[]
  defenderTypes: TypeName[]
}

/** 1 適用あたりの実量（もうどくは 1 回目の値） */
export function resolveForSide(
  amount: PassiveAmount,
  side: PassiveSide,
  ctx: PassiveTargetContext,
): number {
  return resolvePassiveAmount(amount, {
    targetMaxHp: side === 'attacker' ? ctx.attackerMaxHp : ctx.defenderMaxHp,
    targetTypes: side === 'attacker' ? ctx.attackerTypes : ctx.defenderTypes,
    toxicCounter: 1,
  })
}

/** 「−12/回」「+11/回」「防−22 → 攻+22」などの 1 適用あたりプレビュー */
export function amountPreviewText(
  amount: PassiveAmount,
  kind: PassiveKind,
  side: PassiveSide,
  ctx: PassiveTargetContext,
): string {
  const value = resolveForSide(amount, side, ctx)
  const progressive = amount.type === 'toxic' ? '〜' : ''
  if (kind === 'leechSeed') {
    return side === 'defender'
      ? `防−${value} → 攻+${value}`
      : `攻−${value} → 防+${value}`
  }
  const who = side === 'attacker' ? '攻' : '防'
  const sign = kind === 'recover' ? '+' : '−'
  return `${who}${sign}${value}${progressive}/回`
}
