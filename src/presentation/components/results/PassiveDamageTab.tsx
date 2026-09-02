import { PassiveCatalog } from './PassiveCatalog'

export interface PassiveDamageTabProps {
  defenderMaxHp: number
  attackerMaxHp: number
}

/**
 * 「定数ダメ」タブ（V3.18.0 フェーズC）。
 * サブタブ 割合 / もうどく / 固定 と対象トグル（防御側・攻撃側）は `PassiveCatalog` の共通実装。
 */
export function PassiveDamageTab({ defenderMaxHp, attackerMaxHp }: PassiveDamageTabProps) {
  return <PassiveCatalog tab="damage" defenderMaxHp={defenderMaxHp} attackerMaxHp={attackerMaxHp} />
}
