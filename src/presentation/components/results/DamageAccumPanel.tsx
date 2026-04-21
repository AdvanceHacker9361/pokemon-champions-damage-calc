import { useState, useMemo } from 'react'
import { useAccumStore } from '@/presentation/store/accumStore'
import {
  calcCombinedKoProbability,
  calcCombinedDamageDistribution,
} from '@/domain/calculators/KoProbabilityCalc'
import type { KoResult } from '@/domain/models/DamageResult'
import { DamageBar } from './DamageBar'

interface DamageAccumPanelProps {
  defenderMaxHp: number
}

/** 累積ダメージ分布ヒストグラム */
function AccumHistogram({
  distribution,
  defenderMaxHp,
  totalMin,
  totalMax,
}: {
  distribution: Map<number, number>
  defenderMaxHp: number
  totalMin: number
  totalMax: number
}) {
  const range = totalMax - totalMin
  if (range <= 0) return null

  const BIN_COUNT = 30
  const binSize = range / BIN_COUNT
  const bins = Array.from({ length: BIN_COUNT }, (_, i) => ({
    lo: totalMin + i * binSize,
    hi: totalMin + (i + 1) * binSize,
    prob: 0,
  }))
  for (const [dmg, p] of distribution) {
    const idx = Math.min(BIN_COUNT - 1, Math.max(0, Math.floor((dmg - totalMin) / binSize)))
    bins[idx].prob += p
  }

  const maxBinProb = Math.max(...bins.map(b => b.prob), 0.00001)
  const hpInRange = defenderMaxHp >= totalMin && defenderMaxHp <= totalMax
  const hpThresholdPct = hpInRange ? ((defenderMaxHp - totalMin) / range) * 100 : -1

  // 累積確率の集計（KO確率・耐え確率）
  let koProb = 0
  for (const [dmg, p] of distribution) {
    if (dmg >= defenderMaxHp) koProb += p
  }
  const survivalProb = 1 - koProb

  function binColor(b: { lo: number; hi: number }): string {
    if (b.lo >= defenderMaxHp) return 'bg-red-500 dark:bg-red-400'
    if (b.hi > defenderMaxHp) return 'bg-orange-400 dark:bg-orange-400'
    return 'bg-slate-400 dark:bg-slate-500'
  }

  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-500 mb-0.5">
        <span>ダメ分布</span>
        <span>
          <span className="text-slate-500 dark:text-slate-500 mr-1.5">耐え {(survivalProb * 100).toFixed(1)}%</span>
          <span className="text-red-500 dark:text-red-400">KO {(koProb * 100).toFixed(1)}%</span>
        </span>
      </div>
      <div className="relative" style={{ height: '48px' }}>
        {/* HP閾値の縦線 */}
        {hpThresholdPct >= 0 && hpThresholdPct <= 100 && (
          <div
            className="absolute top-0 bottom-0 border-l border-dashed border-red-500 dark:border-red-400 z-10 pointer-events-none"
            style={{ left: `${hpThresholdPct}%` }}
            title={`HP ${defenderMaxHp}`}
          />
        )}
        {/* 棒グラフ */}
        <div className="flex items-end gap-px h-full">
          {bins.map((b, i) => {
            const heightPct = (b.prob / maxBinProb) * 100
            return (
              <div
                key={i}
                className="flex-1 flex flex-col justify-end"
                title={`${Math.round(b.lo)}〜${Math.round(b.hi)} : ${(b.prob * 100).toFixed(2)}%`}
              >
                <div
                  className={`w-full rounded-t-sm ${binColor(b)}`}
                  style={{ height: `${heightPct}%`, minHeight: b.prob > 0 ? '1px' : 0 }}
                />
              </div>
            )
          })}
        </div>
      </div>
      {/* X軸ラベル */}
      <div className="relative text-[9px] text-slate-400 dark:text-slate-600 mt-0.5 font-mono" style={{ height: '12px' }}>
        <span className="absolute left-0">{totalMin}</span>
        {hpInRange && (
          <span
            className="absolute text-red-500 dark:text-red-400"
            style={{ left: `${hpThresholdPct}%`, transform: 'translateX(-50%)' }}
          >
            HP{defenderMaxHp}
          </span>
        )}
        <span className="absolute right-0">{totalMax}</span>
      </div>
    </div>
  )
}

const CONST_FRACTIONS = [
  { label: '1/32', num: 1, den: 32 },
  { label: '1/16', num: 1, den: 16 },
  { label: '1/8',  num: 1, den: 8  },
  { label: '1/6',  num: 1, den: 6  },
  { label: '1/4',  num: 1, den: 4  },
  { label: '1/2',  num: 1, den: 2  },
]

function koColor(prob: number): string {
  if (prob >= 1.0) return 'text-red-500 dark:text-red-400'
  if (prob >= 0.75) return 'text-orange-500 dark:text-orange-400'
  if (prob >= 0.5) return 'text-yellow-600 dark:text-yellow-400'
  if (prob > 0) return 'text-amber-600 dark:text-amber-400'
  return 'text-slate-600'
}

function ConstBar({ value, maxHp, color = 'bg-amber-500' }: { value: number; maxHp: number; color?: string }) {
  const pct = Math.min(100, (value / maxHp) * 100)
  return (
    <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function DamageAccumPanel({ defenderMaxHp }: DamageAccumPanelProps) {
  const { entries, removeEntry, clearEntries, setEntryUsages } = useAccumStore()
  const [constDmg, setConstDmg] = useState(0)
  const [constRec, setConstRec] = useState(0)
  const [poisonTurns, setPoisonTurns] = useState(0)

  // もうどく累積
  const poisonPerTurn = Array.from({ length: poisonTurns }, (_, i) =>
    Math.max(1, Math.floor(defenderMaxHp * (i + 1) / 16))
  )
  const poisonTotal = poisonPerTurn.reduce((s, v) => s + v, 0)

  const totalConst = constDmg + poisonTotal - constRec
  const effectiveHp = Math.max(1, defenderMaxHp - totalConst)

  const hasEntries = entries.length > 0
  const hasAnything = hasEntries || totalConst !== 0

  // 技加算の合計
  const moveMin = entries.reduce((s, e) => s + e.minDmg * e.usages, 0)
  const moveMax = entries.reduce((s, e) => s + e.maxDmg * e.usages, 0)

  const totalMin = moveMin + totalConst
  const totalMax = moveMax + totalConst
  const totalMinPct = defenderMaxHp > 0 ? totalMin / defenderMaxHp * 100 : 0
  const totalMaxPct = defenderMaxHp > 0 ? totalMax / defenderMaxHp * 100 : 0

  // KO確率: 選択済みエントリの乱数セットを usages 回分展開
  const rollSets = entries.flatMap(e => Array<number[]>(e.usages).fill(e.rolls))
  const combinedProb = hasEntries
    ? calcCombinedKoProbability(rollSets, effectiveHp)
    : totalConst >= defenderMaxHp ? 1 : 0

  const probDisplay = combinedProb >= 1.0
    ? '確定KO'
    : combinedProb <= 0
    ? '倒せない'
    : `${(combinedProb * 100).toFixed(1)}%`

  // 累積ダメージ分布（定数分は offset として先に加算）
  const distribution = useMemo(
    () => hasEntries
      ? calcCombinedDamageDistribution(rollSets, totalConst)
      : new Map<number, number>([[totalConst, 1.0]]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasEntries, totalConst, JSON.stringify(rollSets)],
  )

  // KoResult を combinedProb から構築（DamageBar の色分けに使用）
  const accumKoResult: KoResult =
    combinedProb >= 1.0 ? { type: 'guaranteed', hits: 1 }
    : combinedProb > 0 ? { type: 'chance', hits: 1, probability: combinedProb }
    : { type: 'no-ko' }

  return (
    <div className="panel space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">加算計算リスト</h3>
        {hasEntries && (
          <button
            type="button"
            onClick={clearEntries}
            className="text-xs text-slate-600 hover:text-red-500 dark:hover:text-red-400 dark:text-slate-500 transition-colors"
          >
            クリア
          </button>
        )}
      </div>

      {/* エントリ一覧 */}
      {hasEntries ? (
        <div className="space-y-1">
          {entries.map(entry => {
            const subMin = entry.minDmg * entry.usages
            const subMax = entry.maxDmg * entry.usages
            return (
              <div key={entry.id} className="flex items-center gap-2 text-xs">
                <span className="text-slate-700 dark:text-slate-300 truncate flex-1 min-w-0">
                  {entry.label}
                </span>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setEntryUsages(entry.id, entry.usages - 1)}
                    disabled={entry.usages <= 1}
                    className="w-5 h-5 text-xs bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="回数を減らす"
                  >−</button>
                  <span className="w-6 text-center font-mono text-blue-600 dark:text-blue-400 font-medium">
                    ×{entry.usages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEntryUsages(entry.id, entry.usages + 1)}
                    disabled={entry.usages >= 9}
                    className="w-5 h-5 text-xs bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="回数を増やす"
                  >+</button>
                </div>
                <span className="text-slate-700 dark:text-slate-400 font-mono flex-shrink-0 w-24 text-right">
                  {subMin}〜{subMax}
                </span>
                <button
                  type="button"
                  onClick={() => removeEntry(entry.id)}
                  className="text-slate-500 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 transition-colors flex-shrink-0"
                  title="削除"
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-xs text-slate-400 dark:text-slate-600 text-center py-1">
          各技の「+ 加算」ボタンで追加
        </div>
      )}

      <div className="border-t border-slate-200 dark:border-slate-700" />

      {/* 定数ダメージ */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-700 dark:text-slate-400 w-14 flex-shrink-0">定数ダメ</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="w-5 h-5 text-xs bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded text-slate-700 dark:text-slate-300"
              onClick={() => setConstDmg(v => Math.max(0, v - 1))}
            >−</button>
            <input
              type="number"
              min={0}
              value={constDmg}
              onChange={e => setConstDmg(Math.max(0, Number(e.target.value)))}
              className="input-base w-14 text-center text-xs px-1"
            />
            <button
              type="button"
              className="w-5 h-5 text-xs bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded text-slate-700 dark:text-slate-300"
              onClick={() => setConstDmg(v => v + 1)}
            >+</button>
          </div>
          <span className="text-xs text-slate-600 dark:text-slate-600">砂/毒/やけど等</span>
        </div>
        <div className="flex items-center gap-1 pl-[3.75rem] flex-wrap">
          {CONST_FRACTIONS.map(f => {
            const val = Math.floor(defenderMaxHp * f.num / f.den)
            return (
              <button
                key={f.label}
                type="button"
                onClick={() => setConstDmg(val)}
                className={`text-xs px-1 py-0.5 rounded border transition-colors ${
                  constDmg === val
                    ? 'bg-amber-600 dark:bg-amber-700 border-amber-500 dark:border-amber-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 hover:border-slate-500 dark:hover:border-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                }`}
                title={`${f.label} = ${val}`}
              >
                {f.label}<span className="ml-0.5 opacity-60">{val}</span>
              </button>
            )
          })}
        </div>
        {constDmg > 0 && (
          <div className="pl-[3.75rem]">
            <ConstBar value={constDmg} maxHp={defenderMaxHp} />
            <span className="text-xs text-amber-600 dark:text-amber-500 font-mono">
              {(constDmg / defenderMaxHp * 100).toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      {/* 定数回復 */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-700 dark:text-slate-400 w-14 flex-shrink-0">定数回復</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="w-5 h-5 text-xs bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded text-slate-700 dark:text-slate-300"
              onClick={() => setConstRec(v => Math.max(0, v - 1))}
            >−</button>
            <input
              type="number"
              min={0}
              value={constRec}
              onChange={e => setConstRec(Math.max(0, Number(e.target.value)))}
              className="input-base w-14 text-center text-xs px-1"
            />
            <button
              type="button"
              className="w-5 h-5 text-xs bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded text-slate-700 dark:text-slate-300"
              onClick={() => setConstRec(v => v + 1)}
            >+</button>
          </div>
          <span className="text-xs text-slate-600 dark:text-slate-600">残飯/黒ヘド等</span>
        </div>
        <div className="flex items-center gap-1 pl-[3.75rem] flex-wrap">
          {CONST_FRACTIONS.map(f => {
            const val = Math.floor(defenderMaxHp * f.num / f.den)
            return (
              <button
                key={f.label}
                type="button"
                onClick={() => setConstRec(val)}
                className={`text-xs px-1 py-0.5 rounded border transition-colors ${
                  constRec === val
                    ? 'bg-teal-600 dark:bg-teal-700 border-teal-500 dark:border-teal-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 hover:border-slate-500 dark:hover:border-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                }`}
                title={`${f.label} = ${val}`}
              >
                {f.label}<span className="ml-0.5 opacity-60">{val}</span>
              </button>
            )
          })}
        </div>
        {constRec > 0 && (
          <div className="pl-[3.75rem]">
            <ConstBar value={constRec} maxHp={defenderMaxHp} color="bg-teal-500" />
            <span className="text-xs text-teal-600 dark:text-teal-400 font-mono">
              {(constRec / defenderMaxHp * 100).toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      {/* もうどく累積 */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-700 dark:text-slate-400 w-14 flex-shrink-0">もうどく</span>
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setPoisonTurns(n)}
                className={`w-6 h-6 text-xs rounded transition-colors ${
                  poisonTurns === n
                    ? 'bg-purple-600 dark:bg-purple-700 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-600'
                }`}
                title={n === 0 ? 'なし' : `${n}ターン目まで`}
              >
                {n === 0 ? '×' : n}
              </button>
            ))}
          </div>
        </div>
        {poisonTurns > 0 && (
          <div className="pl-[3.75rem] space-y-1">
            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
              {poisonPerTurn.map((dmg, i) => (
                <span key={i} className="text-[10px] font-mono text-purple-700 dark:text-purple-400">
                  {i + 1}T:{dmg}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-purple-600 dark:text-purple-300">
                累計 {poisonTotal}
                <span className="font-normal text-purple-500 dark:text-purple-400 ml-1">
                  ({(poisonTotal / defenderMaxHp * 100).toFixed(1)}%)
                </span>
              </span>
              <span className="text-[10px] text-purple-500 dark:text-purple-500">→ 総合累積に自動加算</span>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 dark:border-slate-700" />

      {/* 総合累積 */}
      {!hasAnything ? (
        <div className="text-xs text-slate-400 dark:text-slate-600 text-center py-1">
          技の加算または定数ダメ・もうどく等を設定すると総合累積が計算されます
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-600 dark:text-slate-400">総合累積: </span>
              <span className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100">
                {totalMin}〜{totalMax}
              </span>
              {defenderMaxHp > 0 && (
                <span className="text-xs font-mono text-slate-600 dark:text-slate-400 ml-1">
                  ({totalMinPct.toFixed(1)}%〜{totalMaxPct.toFixed(1)}%)
                </span>
              )}
              {defenderMaxHp > 0 && (
                <span className="text-xs text-slate-500 dark:text-slate-600 ml-1">
                  /{defenderMaxHp}
                </span>
              )}
            </div>
            <span className={`text-sm font-bold ${koColor(combinedProb)}`}>
              {probDisplay}
            </span>
          </div>

          {defenderMaxHp > 0 && (
            <>
              <DamageBar percentMin={totalMinPct} percentMax={totalMaxPct} koResult={accumKoResult} />
              <div className="flex justify-end text-[10px] font-mono text-slate-400 dark:text-slate-600 mt-0.5">
                残HP {Math.max(0, defenderMaxHp - totalMax)}〜{Math.max(0, defenderMaxHp - totalMin)}/{defenderMaxHp}
              </div>
              {totalMax > totalMin && (
                <AccumHistogram
                  distribution={distribution}
                  defenderMaxHp={defenderMaxHp}
                  totalMin={totalMin}
                  totalMax={totalMax}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
