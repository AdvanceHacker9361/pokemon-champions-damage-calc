import { useResultStore } from '@/presentation/store/resultStore'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { useStatCalc } from '@/presentation/hooks/useStatCalc'
import { MoveRepository } from '@/data/repositories/MoveRepository'
import { DamageBar } from './DamageBar'
import type { KoResult } from '@/domain/models/DamageResult'

function koLabel(koResult: KoResult): string {
  if (koResult.type === 'guaranteed') return `確定${koResult.hits}発`
  if (koResult.type === 'chance') return `乱数${koResult.hits}発 (${(koResult.probability * 100).toFixed(1)}%)`
  return '倒せない'
}

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

  const attackerName    = useAttackerStore(s => s.pokemonName)
  const attackerBase    = useAttackerStore(s => s.baseStats)
  const attackerSp      = useAttackerStore(s => s.sp)
  const attackerNatures = useAttackerStore(s => s.statNatures)
  const attackerRanks   = useAttackerStore(s => s.ranks)

  const defenderName    = useDefenderStore(s => s.pokemonName)
  const defenderBase    = useDefenderStore(s => s.baseStats)
  const defenderSp      = useDefenderStore(s => s.sp)
  const defenderNatures = useDefenderStore(s => s.statNatures)
  const defenderRanks   = useDefenderStore(s => s.ranks)

  const attackerStats = useStatCalc(attackerBase, attackerSp, attackerNatures, attackerRanks)
  const defenderStats = useStatCalc(defenderBase, defenderSp, defenderNatures, defenderRanks)

  if (!attackerName || !defenderName || results.length === 0) return null

  // 最大ダメージの技を選択
  const best = results.reduce((prev, curr) =>
    curr.result.max > prev.result.max ? curr : prev, results[0])

  const { moveName, result } = best
  const { min, max, percentMin, percentMax, defenderMaxHp, koResult } = result

  const remainingMin = Math.max(0, defenderMaxHp - max)
  const remainingMax = Math.max(0, defenderMaxHp - min)

  const moveRecord = MoveRepository.findByName(moveName)
  const isSpecial = moveRecord?.category === '特殊'
  const attackStat = isSpecial ? attackerStats.spa : attackerStats.atk
  const defenseStat = isSpecial ? defenderStats.spd : defenderStats.def
  const attackLabel = isSpecial ? 'C' : 'A'
  const defenseLabel = isSpecial ? 'D' : 'B'

  return (
    <div className="panel mb-3 sm:mb-4">
      {/* 上段: ポケモン名 + ステータス */}
      <div className="flex items-center gap-2 text-sm mb-2 flex-wrap">
        <span className="font-semibold text-slate-800 dark:text-slate-200">{attackerName}</span>
        <span className="text-xs font-mono text-slate-500 dark:text-slate-500">
          {attackLabel}{attackStat}
        </span>
        <span className="text-slate-400 dark:text-slate-600 mx-1">──</span>
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
          {moveName}
        </span>
        <span className="text-slate-400 dark:text-slate-600 mx-1">──▶</span>
        <span className="font-semibold text-slate-800 dark:text-slate-200">{defenderName}</span>
        <span className="text-xs font-mono text-slate-500 dark:text-slate-500">
          {defenseLabel}{defenseStat} / HP{defenderMaxHp}
        </span>
      </div>

      {/* 下段: ダメージ数値 + バー + KO判定 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <span className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100">
            {min}〜{max}
          </span>
          <span className="text-sm font-mono text-slate-600 dark:text-slate-400 ml-2">
            ({percentMin.toFixed(1)}〜{percentMax.toFixed(1)}%)
          </span>
        </div>
        <span className={`text-base font-bold ml-auto ${koLabelColor(koResult)}`}>
          {koLabel(koResult)}
        </span>
      </div>

      <div className="mt-1.5">
        <DamageBar percentMin={percentMin} percentMax={percentMax} koResult={koResult} />
        <div className="flex justify-end text-[10px] font-mono text-slate-400 dark:text-slate-600 mt-0.5">
          残HP {remainingMin}〜{remainingMax}/{defenderMaxHp}
        </div>
      </div>
    </div>
  )
}
