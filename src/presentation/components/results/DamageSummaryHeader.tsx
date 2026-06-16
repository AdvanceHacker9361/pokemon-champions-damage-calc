import { useResultStore } from '@/presentation/store/resultStore'
import { useAccumulatedDamage } from '@/presentation/hooks/useAccumulatedDamage'
import { useProgressionStore } from '@/presentation/store/progressionStore'
import { useDefenderStore } from '@/presentation/store/pokemonStore'
import { calculateHP } from '@/domain/calculators/StatCalculator'
import { DamageBar } from './DamageBar'
import { AccumHistogram } from './AccumHistogram'
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

function koLabel(koResult: KoResult): string {
  if (koResult.type === 'guaranteed') return `確定${koResult.hits}発`
  if (koResult.type === 'chance') {
    return `乱数${koResult.hits}発 (${(koResult.probability * 100).toFixed(1)}%)`
  }
  return '倒せない'
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
  const strongestResult = results.length > 0
    ? results.reduce((best, current) => current.result.max > best.result.max ? current : best)
    : null

  return (
    <div className="panel mb-3 sm:mb-4">
      {!accum.hasAnything ? (
        strongestResult ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-fg-muted">最大ダメージ</span>
              <span className="text-sm font-medium text-fg">{strongestResult.moveName}</span>
              <span className="text-sm font-mono font-bold text-fg">
                {strongestResult.result.min}〜{strongestResult.result.max}
              </span>
              <span className="text-xs font-mono text-fg-muted">
                ({strongestResult.result.percentMin.toFixed(1)}〜{strongestResult.result.percentMax.toFixed(1)}%)
              </span>
              <span className="text-xs text-fg-subtle">/{strongestResult.result.defenderMaxHp}</span>
              <span className={`text-sm font-bold ml-auto ${koLabelColor(strongestResult.result.koResult)}`}>
                {koLabel(strongestResult.result.koResult)}
              </span>
            </div>

            <div>
              <DamageBar
                percentMin={strongestResult.result.percentMin}
                percentMax={strongestResult.result.percentMax}
                koResult={strongestResult.result.koResult}
              />
              <div className="flex justify-end text-[10px] font-mono text-fg-faint mt-0.5">
                残HP {Math.max(0, strongestResult.result.defenderMaxHp - strongestResult.result.max)}〜{Math.max(0, strongestResult.result.defenderMaxHp - strongestResult.result.min)}/{strongestResult.result.defenderMaxHp}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-fg-faint text-center py-1">
            加算されると結果が表示されます
          </div>
        )
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
        </div>
      )}
    </div>
  )
}
