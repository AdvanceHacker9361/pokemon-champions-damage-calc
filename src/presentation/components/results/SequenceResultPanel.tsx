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

  const outcomes = [
    { label: '防御側撃破', value: seqResult.defenderKoProb, valueClass: 'text-danger-2' },
    { label: '攻撃側瀕死', value: seqResult.attackerFaintProb, valueClass: 'text-warning' },
    { label: '両者瀕死', value: seqResult.bothFaintProb, valueClass: 'text-danger-2', optional: true },
    { label: '両者生存', value: seqResult.bothAliveProb, valueClass: 'text-fg' },
    { label: '攻撃側生存', value: seqResult.attackerSurviveProb, valueClass: 'text-success' },
  ].filter(outcome => !outcome.optional || outcome.value > 0)
  const outcomeColumns = outcomes.length === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className={`grid grid-cols-2 gap-px overflow-hidden rounded border border-edge bg-edge sm:grid-cols-3 ${outcomeColumns}`}>
        {outcomes.map(outcome => (
          <div key={outcome.label} className="min-w-0 bg-surface-2 px-3 py-2.5 sm:px-4 sm:py-3">
            <div className="text-[10px] font-medium text-fg-muted sm:text-xs">{outcome.label}</div>
            <div className={`mt-0.5 font-mono text-lg font-bold sm:text-xl ${outcome.valueClass}`}>
              {(outcome.value * 100).toFixed(1)}%
            </div>
          </div>
        ))}
      </div>

      <div className="max-h-[28rem] overflow-auto rounded border border-edge">
        <table className="w-full min-w-[42rem] text-xs font-mono">
          <thead>
            <tr className="border-b border-edge bg-surface-2 text-fg-faint">
              <th className="sticky top-0 w-12 bg-surface-2 px-3 py-2 text-left font-normal">#</th>
              <th className="sticky top-0 min-w-52 bg-surface-2 px-3 py-2 text-left font-normal">ステップ</th>
              <th className="sticky top-0 bg-surface-2 px-3 py-2 text-right font-normal">{attackerName || '攻'}残HP</th>
              <th className="sticky top-0 bg-surface-2 px-3 py-2 text-right font-normal">{defenderName || '防'}残HP</th>
              <th className="sticky top-0 bg-surface-2 px-3 py-2 text-right font-normal">撃破</th>
              <th className="sticky top-0 bg-surface-2 px-3 py-2 text-right font-normal">瀕死</th>
            </tr>
          </thead>
          <tbody>
            {seqResult.steps.map((s, i) => {
              const aR = hpRange(s.attackerHpDist)
              const dR = hpRange(s.defenderHpDist)
              return (
                <tr key={i} className="border-b border-edge/40 last:border-b-0 hover:bg-surface-2/60">
                  <td className="px-3 py-2 text-fg-faint">{i + 1}</td>
                  <td className="px-3 py-2 font-sans text-fg-muted">{s.label}</td>
                  <td className="px-3 py-2 text-right text-fg">{aR ? `${aR.min}〜${aR.max}` : '−'}</td>
                  <td className="px-3 py-2 text-right text-fg">{dR ? `${dR.min}〜${dR.max}` : '−'}</td>
                  <td className="px-3 py-2 text-right text-danger-2">{(s.koProb * 100).toFixed(0)}%</td>
                  <td className="px-3 py-2 text-right text-warning">{(s.faintProb * 100).toFixed(0)}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="text-[10px] leading-relaxed text-fg-faint sm:text-xs">
        ※ 防御側撃破・攻撃側瀕死・両者生存が最終結果の内訳です。両者瀕死（反動同時死）は撃破・瀕死の両方に計上されます。残HPは両者生存マスでの範囲。被ダメは攻守を入れ替えて自動計算（火傷半減・吸収も反映）。
      </div>
    </div>
  )
}
