import { PassiveCatalog } from './PassiveCatalog'

export interface PassiveRecoverTabProps {
  defenderMaxHp: number
  attackerMaxHp: number
}

/**
 * 「回復」タブ（V3.18.0 フェーズC）。
 * サブタブ 割合 / きのみ / 固定 / 単発 と対象トグルは `PassiveCatalog` の共通実装。
 */
export function PassiveRecoverTab({ defenderMaxHp, attackerMaxHp }: PassiveRecoverTabProps) {
  return <PassiveCatalog tab="recover" defenderMaxHp={defenderMaxHp} attackerMaxHp={attackerMaxHp} />
}
