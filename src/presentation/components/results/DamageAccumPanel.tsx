import { useAccumStore } from '@/presentation/store/accumStore'
import { calcCombinedKoProbability } from '@/domain/calculators/KoProbabilityCalc'
import { useDefenderStore } from '@/presentation/store/pokemonStore'

function koColor(prob: number): string {
  if (prob >= 1.0) return 'text-red-500 dark:text-red-400'
  if (prob >= 0.75) return 'text-orange-500 dark:text-orange-400'
  if (prob >= 0.5) return 'text-yellow-600 dark:text-yellow-400'
  if (prob > 0) return 'text-amber-600 dark:text-amber-400'
  return 'text-slate-500'
}

export function DamageAccumPanel() {
  const { entries, removeEntry, clearEntries } = useAccumStore()
  const defenderMaxHp = useDefenderStore(s => s.baseStats.hp > 0
    ? entries[0]?.defenderMaxHp ?? 0
    : 0)

  const hp = entries[0]?.defenderMaxHp ?? 0

  if (entries.length === 0) return null

  const rollSets = entries.map(e => e.rolls)
  const combinedProb = calcCombinedKoProbability(rollSets, hp)

  const minTotal = entries.reduce((s, e) => s + e.minDmg, 0)
  const maxTotal = entries.reduce((s, e) => s + e.maxDmg, 0)
  const minPct = hp > 0 ? (minTotal / hp * 100) : 0
  const maxPct = hp > 0 ? (maxTotal / hp * 100) : 0

  const probDisplay = combinedProb >= 1.0
    ? '確定KO'
    : combinedProb <= 0
    ? '倒せない'
    : `${(combinedProb * 100).toFixed(1)}%`

  void defenderMaxHp

  return (
    <div className="panel space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">加算計算リスト</h3>
        <button
          type="button"
          onClick={clearEntries}
          className="text-xs text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
        >
          クリア
        </button>
      </div>

      {/* エントリ一覧 */}
      <div className="space-y-1">
        {entries.map(entry => (
          <div key={entry.id} className="flex items-center justify-between text-xs">
            <span className="text-slate-700 dark:text-slate-300 truncate flex-1">{entry.label}</span>
            <span className="text-slate-700 dark:text-slate-400 font-mono ml-2 flex-shrink-0">
              {entry.minDmg}〜{entry.maxDmg}
            </span>
            <button
              type="button"
              onClick={() => removeEntry(entry.id)}
              className="ml-2 text-slate-600 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 transition-colors flex-shrink-0"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* 区切り線 */}
      <div className="border-t border-slate-200 dark:border-slate-700" />

      {/* 合計・KO確率 */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs text-slate-700 dark:text-slate-400">合計: </span>
          <span className="text-sm font-mono text-slate-900 dark:text-slate-100">
            {minTotal}〜{maxTotal}
          </span>
          {hp > 0 && (
            <span className="text-xs text-slate-700 dark:text-slate-400 font-mono ml-1">
              ({minPct.toFixed(1)}%〜{maxPct.toFixed(1)}%)
            </span>
          )}
          {hp > 0 && (
            <span className="text-xs text-slate-600 dark:text-slate-600 ml-1">/{hp}</span>
          )}
        </div>
        <span className={`text-sm font-bold ${koColor(combinedProb)}`}>
          {probDisplay}
        </span>
      </div>

      {/* ビジュアルバー */}
      {hp > 0 && (
        <div className="relative h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className="absolute left-0 h-full bg-red-500 rounded-full transition-all"
            style={{ width: `${Math.min(100, maxPct)}%`, opacity: 0.4 }}
          />
          <div
            className="absolute left-0 h-full bg-red-400 rounded-full transition-all"
            style={{ width: `${Math.min(100, minPct)}%` }}
          />
          {hp > 0 && (
            <div
              className="absolute top-0 bottom-0 w-px bg-slate-700 dark:bg-white opacity-40"
              style={{ left: '100%', transform: 'translateX(-1px)' }}
            />
          )}
        </div>
      )}
    </div>
  )
}
