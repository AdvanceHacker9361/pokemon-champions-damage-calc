import { useResultStore } from '@/presentation/store/resultStore'
import { useAccumulatedDamage } from '@/presentation/hooks/useAccumulatedDamage'
import { useDefenderMaxHp } from '@/presentation/hooks/useDefenderMaxHp'
import { computeMoveDisplaySummary } from '@/presentation/hooks/computeMoveDisplaySummary'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { MoveRepository } from '@/data/repositories/MoveRepository'
import { getVariableMultiHitDist } from '@/domain/calculators/KoProbabilityCalc'
import { DamageBar } from './DamageBar'
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
  const defenderMaxHp = useDefenderMaxHp()
  const accum = useAccumulatedDamage(defenderMaxHp)
  const attackerAbility = useAttackerStore(s => s.effectiveAbility)
  const attackerItem = useAttackerStore(s => s.itemName)
  const defenderAbility = useDefenderStore(s => s.effectiveAbility)
  const defenderAbilityActivated = useDefenderStore(s => s.abilityActivated)

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

  // 技別行（DamageResultRow）と同じ表示ロジックで実効ダメージを算出してから
  // 最大の技を選ぶ。素の result.max ではばけのかわ・おやこあい等が反映されない
  const isParentalBond = attackerAbility === 'おやこあい'
  const isDisguiseIntact = defenderAbility === 'ばけのかわ' && defenderAbilityActivated
  const variableMultiHitDist = getVariableMultiHitDist(attackerAbility, attackerItem)

  const summaries = results.map(r => ({
    moveName: r.moveName,
    summary: computeMoveDisplaySummary({
      result: r.result,
      rawResult: r.rawResult,
      perHitResults: r.perHitResults,
      weakArmorPerHitResults: r.weakArmorPerHitResults,
      weakArmorVariableRawResults: r.weakArmorVariableRawResults,
      multiHit: MoveRepository.findByName(r.moveName)?.multiHit,
      isParentalBond,
      isDisguiseIntact,
      variableMultiHitDist,
    }),
  }))
  const strongest = summaries.length > 0
    ? summaries.reduce((best, current) => current.summary.max > best.summary.max ? current : best)
    : null

  return (
    <div className="panel">
      {!accum.hasAnything ? (
        strongest ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-fg-muted">最大ダメージ</span>
              <span className="text-sm font-medium text-fg">{strongest.moveName}</span>
              <span className="text-sm font-mono font-bold text-fg">
                {strongest.summary.min}〜{strongest.summary.max}
              </span>
              <span className="text-xs font-mono text-fg-muted">
                ({strongest.summary.percentMin.toFixed(1)}〜{strongest.summary.percentMax.toFixed(1)}%)
              </span>
              <span className="text-xs text-fg-subtle">/{strongest.summary.defenderMaxHp}</span>
              <span className={`text-sm font-bold ml-auto ${koLabelColor(strongest.summary.koResult)}`}>
                {koLabel(strongest.summary.koResult)}
              </span>
            </div>

            <div>
              <DamageBar
                percentMin={strongest.summary.percentMin}
                percentMax={strongest.summary.percentMax}
                koResult={strongest.summary.koResult}
              />
              <div className="flex justify-end text-[10px] font-mono text-fg-faint mt-0.5">
                残HP {Math.max(0, strongest.summary.defenderMaxHp - strongest.summary.max)}〜{Math.max(0, strongest.summary.defenderMaxHp - strongest.summary.min)}/{strongest.summary.defenderMaxHp}
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

        </div>
      )}
    </div>
  )
}
