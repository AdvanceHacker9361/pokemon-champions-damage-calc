import type { BattleSequenceResult } from '@/domain/calculators/BattleSequenceCalc'

function hpRange(dist: Map<number, number>): { min: number; max: number } | null {
  if (dist.size === 0) return null
  let min = Infinity, max = -Infinity
  for (const hp of dist.keys()) {
    if (hp < min) min = hp
    if (hp > max) max = hp
  }
  return { min, max }
}

interface SequenceResultPanelProps {
  seqResult: BattleSequenceResult | null
  attackerName: string
  defenderName: string
}

export function SequenceResultPanel({ seqResult, attackerName, defenderName }: SequenceResultPanelProps) {
  if (!seqResult) return null
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="font-mono">
          <span className="text-fg-muted">防御側撃破: </span>
          <span className="font-bold text-danger-2">{(seqResult.defenderKoProb * 100).toFixed(1)}%</span>
        </span>
        <span className="font-mono">
          <span className="text-fg-muted">攻撃側瀕死: </span>
          <span className="font-bold text-warning">{(seqResult.attackerFaintProb * 100).toFixed(1)}%</span>
        </span>
        {seqResult.bothFaintProb > 0 && (
          <span className="font-mono">
            <span className="text-fg-muted">両者瀕死: </span>
            <span className="font-bold text-danger-2">{(seqResult.bothFaintProb * 100).toFixed(1)}%</span>
          </span>
        )}
        <span className="font-mono">
          <span className="text-fg-muted">両者生存: </span>
          <span className="text-fg">{(seqResult.bothAliveProb * 100).toFixed(1)}%</span>
        </span>
        <span className="font-mono">
          <span className="text-fg-muted">攻撃側生存: </span>
          <span className="font-bold text-success">{(seqResult.attackerSurviveProb * 100).toFixed(1)}%</span>
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[10px] font-mono">
          <thead>
            <tr className="text-fg-faint border-b border-edge">
              <th className="text-left py-0.5 pr-2 font-normal">#</th>
              <th className="text-left py-0.5 pr-2 font-normal">ステップ</th>
              <th className="text-right py-0.5 pr-2 font-normal">{attackerName || '攻'}残HP</th>
              <th className="text-right py-0.5 pr-2 font-normal">{defenderName || '防'}残HP</th>
              <th className="text-right py-0.5 pr-2 font-normal">撃破</th>
              <th className="text-right py-0.5 font-normal">瀕死</th>
            </tr>
          </thead>
          <tbody>
            {seqResult.steps.map((s, i) => {
              const aR = hpRange(s.attackerHpDist)
              const dR = hpRange(s.defenderHpDist)
              return (
                <tr key={i} className="border-b border-edge/40">
                  <td className="py-0.5 pr-2 text-fg-faint">{i + 1}</td>
                  <td className="py-0.5 pr-2 text-fg-muted truncate max-w-[10rem]">{s.label}</td>
                  <td className="py-0.5 pr-2 text-right text-fg">{aR ? `${aR.min}〜${aR.max}` : '−'}</td>
                  <td className="py-0.5 pr-2 text-right text-fg">{dR ? `${dR.min}〜${dR.max}` : '−'}</td>
                  <td className="py-0.5 pr-2 text-right text-danger-2">{(s.koProb * 100).toFixed(0)}%</td>
                  <td className="py-0.5 text-right text-warning">{(s.faintProb * 100).toFixed(0)}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="text-[10px] text-fg-faint leading-relaxed">
        ※ 防御側撃破・攻撃側瀕死・両者生存が最終結果の内訳です。両者瀕死（反動同時死）は撃破・瀕死の両方に計上されます。残HPは両者生存マスでの範囲。被ダメは攻守を入れ替えて自動計算（火傷半減・吸収も反映）。
      </div>
    </div>
  )
}
