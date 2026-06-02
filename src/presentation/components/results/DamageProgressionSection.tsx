import { DamageProgressionPanel } from './DamageProgressionPanel'

/**
 * 「ダメージ進行」統合セクション。
 * 累積（防御側の積み上げ・撃破率）とシーケンス（攻守HP・被ダメ・痛み分け）を
 * 単一のイベント時系列モデルで扱う統合パネル。
 */
export function DamageProgressionSection({ defenderMaxHp }: { defenderMaxHp: number }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <h2 className="text-sm font-bold text-fg">ダメージ進行</h2>
        <span className="text-[10px] text-fg-faint">
          与ダメ・被ダメ・痛み分け・定数を時系列で並べて撃破率/生存率を算出
        </span>
      </div>
      <DamageProgressionPanel defenderMaxHp={defenderMaxHp} />
    </div>
  )
}
