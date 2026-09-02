export interface PassiveDamageTabProps {
  defenderMaxHp: number
  attackerMaxHp: number
}

/**
 * 「定数ダメ」タブの中身（V3.18.0 フェーズC で実装予定）。
 * フェーズBでは ProgressionTabs から呼べる場所だけを用意するスタブ。
 * サブタブ（割合 / もうどく / 固定）と PASSIVE_PRESETS カタログはフェーズCで追加する。
 */
export function PassiveDamageTab({ defenderMaxHp, attackerMaxHp }: PassiveDamageTabProps) {
  void defenderMaxHp
  void attackerMaxHp
  return (
    <div className="text-xs text-fg-faint text-center py-3">
      フェーズ C で実装
    </div>
  )
}
