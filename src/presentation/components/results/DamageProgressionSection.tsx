import { DamageAccumPanel } from './DamageAccumPanel'
import { BattleSequencePanel } from './BattleSequencePanel'

/**
 * 「ダメージ進行」統合セクション。
 * 総合累積（防御側ダメージの積み上げ・撃破率）とバトルシーケンス（攻守HPの多ターン
 * シミュレーション）を1つのブロックにまとめて表示する。
 * 両者は同じ2D同時分布エンジン（BattleSequenceCalc）で計算される。
 */
export function DamageProgressionSection({ defenderMaxHp }: { defenderMaxHp: number }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <h2 className="text-sm font-bold text-fg">ダメージ進行</h2>
        <span className="text-[10px] text-fg-faint">
          累積（防御側の積み上げ）＋ シーケンス（攻守HP・被ダメ・痛み分け）
        </span>
      </div>
      <DamageAccumPanel defenderMaxHp={defenderMaxHp} />
      <BattleSequencePanel />
    </div>
  )
}
