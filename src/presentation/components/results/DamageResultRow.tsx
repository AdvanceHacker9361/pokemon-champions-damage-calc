import type { DamageResult } from '@/domain/models/DamageResult'
import { DamageBar } from './DamageBar'

interface DamageResultRowProps {
  moveName: string
  result: DamageResult
}

function koLabel(result: DamageResult): string {
  const { koResult } = result
  if (koResult.type === 'guaranteed') {
    return `確定${koResult.hits}発`
  }
  if (koResult.type === 'chance') {
    const pct = (koResult.probability * 100).toFixed(1)
    return `乱数${koResult.hits}発 (${pct}%)`
  }
  return '倒せない'
}

function koLabelColor(result: DamageResult): string {
  const { koResult } = result
  if (koResult.type === 'guaranteed') {
    if (koResult.hits === 1) return 'text-red-400'
    if (koResult.hits === 2) return 'text-orange-400'
    if (koResult.hits === 3) return 'text-yellow-400'
    return 'text-green-400'
  }
  if (koResult.type === 'chance') return 'text-amber-400'
  return 'text-slate-500'
}

export function DamageResultRow({ moveName, result }: DamageResultRowProps) {
  const { min, max, percentMin, percentMax, defenderMaxHp } = result

  if (min === 0 && max === 0) {
    return (
      <div className="py-2 border-b border-slate-800">
        <div className="text-sm text-slate-400 font-medium">{moveName}</div>
        <div className="text-xs text-slate-600 mt-1">効果がない</div>
      </div>
    )
  }

  return (
    <div className="py-2 border-b border-slate-800 last:border-0">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm font-medium text-slate-200">{moveName}</span>
        <span className={`text-xs font-bold ${koLabelColor(result)}`}>
          {koLabel(result)}
        </span>
      </div>

      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-sm font-mono text-slate-100">
          {min}〜{max}
        </span>
        <span className="text-xs text-slate-400 font-mono">
          ({percentMin.toFixed(1)}%〜{percentMax.toFixed(1)}%)
        </span>
        <span className="text-xs text-slate-600">/{defenderMaxHp}</span>
      </div>

      <DamageBar percentMax={percentMax} koResult={result.koResult} />
    </div>
  )
}
