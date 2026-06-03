import { useState } from 'react'
import { useResultStore } from '@/presentation/store/resultStore'
import { useAccumulatedDamage } from '@/presentation/hooks/useAccumulatedDamage'
import { useProgressionStore } from '@/presentation/store/progressionStore'
import { useDefenderStore } from '@/presentation/store/pokemonStore'
import { calculateHP } from '@/domain/calculators/StatCalculator'
import { DamageBar } from './DamageBar'
import { AccumHistogram } from './AccumHistogram'
import { AccumDurabilityPanel } from './AccumDurabilityPanel'
import type { KoResult } from '@/domain/models/DamageResult'

function koLabelColor(koResult: KoResult): string {
  if (koResult.type === 'guaranteed') {
    if (koResult.hits === 1) return 'text-danger-1'
    if (koResult.hits === 2) return 'text-danger-2'
    if (koResult.hits === 3) return 'text-danger-3'
    return 'text-danger-4'
  }
  if (koResult.type === 'chance') return 'text-danger-4'
  return 'text-neutral'
}

export function DamageSummaryHeader() {
  const results = useResultStore(s => s.results)
  const events = useProgressionStore(s => s.events)
  const defenderBaseHp = useDefenderStore(s => s.baseStats.hp)
  const defenderSpHp = useDefenderStore(s => s.sp.hp)
  const firstAttack = events.find(e => e.kind === 'attack')
  const storeDefHp = defenderBaseHp > 0 ? calculateHP(defenderBaseHp, defenderSpHp) : 0
  const defenderMaxHp =
    results[0]?.result.defenderMaxHp
    ?? (firstAttack && firstAttack.kind === 'attack' ? firstAttack.defenderMaxHp : storeDefHp)
  const accum = useAccumulatedDamage(defenderMaxHp)
  const [durabilityExpanded, setDurabilityExpanded] = useState(false)

  const accumProbDisplay = accum.combinedProb >= 1.0
    ? '確定KO'
    : accum.combinedProb <= 0
    ? '倒せない'
    : `${(accum.combinedProb * 100).toFixed(1)}%`

  const accumProbWithCritDisplay = accum.combinedProbWithCrit >= 1.0
    ? '確定KO'
    : accum.combinedProbWithCrit <= 0
    ? '倒せない'
    : `${(accum.combinedProbWithCrit * 100).toFixed(1)}%`

  const critAffects = Math.abs(accum.combinedProbWithCrit - accum.combinedProb) > 1e-6

  return (
    <div className="panel mb-3 sm:mb-4">
      {!accum.hasAnything ? (
        <div className="text-xs text-fg-faint text-center py-1">
          加算されると結果が表示されます
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-fg-muted">総合累積</span>
            <span className="text-sm font-mono font-bold text-fg">
              {accum.totalMin}〜{accum.totalMax}
            </span>
            <span className="text-xs font-mono text-fg-muted">
              ({accum.totalMinPct.toFixed(1)}〜{accum.totalMaxPct.toFixed(1)}%)
            </span>
            <span className="text-xs text-fg-subtle">/{defenderMaxHp}</span>
            <span className={`text-sm font-bold ml-auto ${koLabelColor(accum.accumKoResult)}`}>
              {accumProbDisplay}
            </span>
            {critAffects && (
              <span
                className="text-xs font-mono text-warning whitespace-nowrap"
                title="各エントリの急所率（1/24 or 1/8）で混合した撃破率。確定急所・急所モード加算分はそのまま扱う"
              >
                急所込み <span className="font-bold">{accumProbWithCritDisplay}</span>
              </span>
            )}
          </div>

          <div>
            <DamageBar
              percentMin={accum.totalMinPct}
              percentMax={accum.totalMaxPct}
              koResult={accum.accumKoResult}
            />
            <div className="flex justify-end text-[10px] font-mono text-fg-faint mt-0.5">
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
              className="text-xs text-fg-subtle hover:text-fg transition-colors"
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
