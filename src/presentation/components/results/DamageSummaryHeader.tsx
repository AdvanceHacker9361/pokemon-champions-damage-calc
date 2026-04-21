import { useState } from 'react'
import { useResultStore } from '@/presentation/store/resultStore'
import { useAccumulatedDamage } from '@/presentation/hooks/useAccumulatedDamage'
import { useAccumStore } from '@/presentation/store/accumStore'
import { DamageBar } from './DamageBar'
import { AccumHistogram } from './AccumHistogram'
import { AccumDurabilityPanel } from './AccumDurabilityPanel'
import type { KoResult } from '@/domain/models/DamageResult'

function koLabelColor(koResult: KoResult): string {
  if (koResult.type === 'guaranteed') {
    if (koResult.hits === 1) return 'text-red-500 dark:text-red-400'
    if (koResult.hits === 2) return 'text-orange-500 dark:text-orange-400'
    if (koResult.hits === 3) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-green-600 dark:text-green-400'
  }
  if (koResult.type === 'chance') return 'text-amber-600 dark:text-amber-400'
  return 'text-slate-500 dark:text-slate-500'
}

export function DamageSummaryHeader() {
  const results = useResultStore(s => s.results)
  const accumEntries = useAccumStore(s => s.entries)
  const defenderMaxHp = results[0]?.result.defenderMaxHp ?? accumEntries[0]?.defenderMaxHp ?? 0
  const accum = useAccumulatedDamage(defenderMaxHp)
  const [durabilityExpanded, setDurabilityExpanded] = useState(false)

  const accumProbDisplay = accum.combinedProb >= 1.0
    ? '確定KO'
    : accum.combinedProb <= 0
    ? '倒せない'
    : `${(accum.combinedProb * 100).toFixed(1)}%`

  return (
    <div className="panel mb-3 sm:mb-4">
      {!accum.hasAnything ? (
        <div className="text-xs text-slate-400 dark:text-slate-600 text-center py-1">
          加算されると結果が表示されます
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">総合累積</span>
            <span className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100">
              {accum.totalMin}〜{accum.totalMax}
            </span>
            <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
              ({accum.totalMinPct.toFixed(1)}〜{accum.totalMaxPct.toFixed(1)}%)
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-600">/{defenderMaxHp}</span>
            <span className={`text-sm font-bold ml-auto ${koLabelColor(accum.accumKoResult)}`}>
              {accumProbDisplay}
            </span>
          </div>

          <div>
            <DamageBar
              percentMin={accum.totalMinPct}
              percentMax={accum.totalMaxPct}
              koResult={accum.accumKoResult}
            />
            <div className="flex justify-end text-[10px] font-mono text-slate-400 dark:text-slate-600 mt-0.5">
              残HP {Math.max(0, defenderMaxHp - accum.totalMax)}〜{Math.max(0, defenderMaxHp - accum.totalMin)}/{defenderMaxHp}
            </div>
          </div>

          {accum.totalMax > accum.totalMin && (
            <AccumHistogram
              distribution={accum.distribution}
              defenderMaxHp={defenderMaxHp}
              totalMin={accum.totalMin}
              totalMax={accum.totalMax}
            />
          )}

          {/* 耐久調整トグル */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setDurabilityExpanded(v => !v)}
              className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
            >
              {durabilityExpanded ? '▲ 耐久調整を閉じる' : '▼ 耐久調整（HP投資）'}
            </button>
          </div>

          {durabilityExpanded && <AccumDurabilityPanel />}
        </div>
      )}
    </div>
  )
}
