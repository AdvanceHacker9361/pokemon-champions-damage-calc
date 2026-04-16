import { useState } from 'react'
import type { DamageResult } from '@/domain/models/DamageResult'
import {
  calcKoProbabilityForNHits,
  calcCombinedKoProbability,
} from '@/domain/calculators/KoProbabilityCalc'

interface MoveResult {
  moveName: string
  result: DamageResult
}

interface DamageCalcPanelProps {
  results: MoveResult[]
}

// 定数ダメージのプリセット割合
const CONST_FRACTIONS = [
  { label: '1/32', num: 1, den: 32 },
  { label: '1/16', num: 1, den: 16 },
  { label: '1/8',  num: 1, den: 8  },
  { label: '1/6',  num: 1, den: 6  },
  { label: '1/4',  num: 1, den: 4  },
  { label: '1/2',  num: 1, den: 2  },
]

function ConstBar({ value, maxHp, color = 'bg-amber-500' }: { value: number; maxHp: number; color?: string }) {
  const pct = Math.min(100, (value / maxHp) * 100)
  return (
    <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function koColor(prob: number): string {
  if (prob >= 1.0) return 'text-red-500 dark:text-red-400'
  if (prob >= 0.75) return 'text-orange-500 dark:text-orange-400'
  if (prob >= 0.5) return 'text-yellow-600 dark:text-yellow-400'
  if (prob > 0) return 'text-amber-600 dark:text-amber-400'
  return 'text-slate-500'
}

export function DamageCalcPanel({ results }: DamageCalcPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [hitCounts, setHitCounts] = useState<Record<string, number>>({})
  const [constDmg, setConstDmg] = useState(0)
  const [constRec, setConstRec] = useState(0)
  const [poisonTurns, setPoisonTurns] = useState(0)

  if (results.length === 0) return null

  const defenderMaxHp = results[0].result.defenderMaxHp

  // undefined = 未選択（総合計算に含めない）
  const getHitCount = (moveName: string): number | undefined => hitCounts[moveName]
  const toggleHitCount = (moveName: string, n: number) =>
    setHitCounts(prev => {
      const next = { ...prev }
      if (next[moveName] === n) {
        delete next[moveName]  // 同じボタン再クリック → 解除
      } else {
        next[moveName] = n
      }
      return next
    })

  // もうどく累積計算
  const poisonPerTurn = Array.from({ length: poisonTurns }, (_, i) =>
    Math.max(1, Math.floor(defenderMaxHp * (i + 1) / 16))
  )
  const poisonTotal = poisonPerTurn.reduce((s, v) => s + v, 0)

  // 定数合計 = 定数ダメ + もうどく累計 - 定数回復（自動合算）
  const totalConst = constDmg + poisonTotal - constRec
  const effectiveHp = Math.max(1, defenderMaxHp - totalConst)

  // 選択済みの技のみ総合計算に含める
  const selectedResults = results.filter(({ moveName }) => getHitCount(moveName) !== undefined)
  const hasSelection = selectedResults.length > 0
  // 技未選択でも定数系がある場合は総合を表示
  const hasAnything = hasSelection || totalConst !== 0

  const moveDmgMin = selectedResults.reduce((s, { moveName, result }) =>
    s + result.min * (getHitCount(moveName) ?? 1), 0)
  const moveDmgMax = selectedResults.reduce((s, { moveName, result }) =>
    s + result.max * (getHitCount(moveName) ?? 1), 0)

  const totalMin = moveDmgMin + totalConst
  const totalMax = moveDmgMax + totalConst
  const totalMinPct = totalMin / defenderMaxHp * 100
  const totalMaxPct = totalMax / defenderMaxHp * 100

  // 選択済み技の乱数セットを hitCount 回分展開して結合KO確率を計算
  const rollSets: number[][] = []
  for (const { moveName, result } of selectedResults) {
    const count = getHitCount(moveName) ?? 1
    const rolls = Array.from(result.rolls)
    for (let i = 0; i < count; i++) rollSets.push(rolls)
  }
  const combinedKoProb = hasSelection
    ? calcCombinedKoProbability(rollSets, effectiveHp)
    : totalConst >= defenderMaxHp ? 1 : 0
  const probDisplay = combinedKoProb >= 1.0 ? '確定KO'
    : combinedKoProb <= 0 ? '倒せない'
    : `${(combinedKoProb * 100).toFixed(1)}%`

  return (
    <div className="border-t border-slate-200 dark:border-slate-700 pt-2">
      {/* ▼加算 トグル */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors py-1"
      >
        <span className="font-medium">{expanded ? '▲' : '▼'} 加算計算</span>
        {!expanded && hasAnything && (
          <span className={`text-xs font-bold ${koColor(combinedKoProb)}`}>
            {probDisplay}
          </span>
        )}
      </button>

      {expanded && (
        <div className="space-y-3 pt-2">
          {/* 技ごとの攻撃回数セレクター */}
          <div className="space-y-1.5">
            {results.map(({ moveName, result }) => {
              const hc = getHitCount(moveName)
              const isActive = hc !== undefined
              const rolls = Array.from(result.rolls)
              const prob = isActive ? calcKoProbabilityForNHits(rolls, effectiveHp, hc!) : null
              const hMin = isActive ? result.min * hc! : null
              const hMax = isActive ? result.max * hc! : null
              const hMinPct = hMin !== null ? hMin / defenderMaxHp * 100 : null
              const hMaxPct = hMax !== null ? hMax / defenderMaxHp * 100 : null
              const pDisp = prob === null ? null
                : prob >= 1 ? '確定' : prob <= 0 ? '不可' : `${(prob * 100).toFixed(1)}%`
              const pColor = prob !== null ? koColor(prob) : ''
              return (
                <div key={moveName} className={`flex items-center gap-2 flex-wrap rounded px-1 py-0.5 transition-colors ${isActive ? 'bg-slate-100 dark:bg-slate-800' : ''}`}>
                  <span className={`text-xs w-24 truncate flex-shrink-0 ${isActive ? 'text-slate-800 dark:text-slate-200 font-medium' : 'text-slate-500 dark:text-slate-500'}`}>
                    {moveName}
                  </span>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => toggleHitCount(moveName, n)}
                        className={`w-6 h-6 text-xs rounded transition-colors ${
                          hc === n
                            ? 'bg-blue-600 dark:bg-blue-700 text-white'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-600'
                        }`}
                        title={hc === n ? 'クリックで解除' : `${n}発で加算`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  {isActive && hMin !== null && hMax !== null && hMinPct !== null && hMaxPct !== null ? (
                    <>
                      <span className="text-xs font-mono text-slate-700 dark:text-slate-300">
                        {hMin}〜{hMax}
                        <span className="text-slate-500 dark:text-slate-500 ml-1">
                          ({hMinPct.toFixed(1)}%〜{hMaxPct.toFixed(1)}%)
                        </span>
                      </span>
                      <span className={`text-xs font-bold ml-auto ${pColor}`}>{pDisp}</span>
                    </>
                  ) : (
                    <span className="text-xs text-slate-400 dark:text-slate-600">— 未選択</span>
                  )}
                </div>
              )
            })}
          </div>

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
                >-</button>
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
                >-</button>
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

          {/* もうどく累積ダメージ */}
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

          {/* 総合ダメージ結果 */}
          <div className="space-y-2">
            {!hasAnything ? (
              <div className="text-xs text-slate-400 dark:text-slate-600 text-center py-1">
                技の発数または定数ダメ・もうどく等を設定すると総合累積が計算されます
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-600 dark:text-slate-400">総合累積: </span>
                    <span className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100">
                      {totalMin}〜{totalMax}
                    </span>
                    <span className="text-xs font-mono text-slate-600 dark:text-slate-400 ml-1">
                      ({totalMinPct.toFixed(1)}%〜{totalMaxPct.toFixed(1)}%)
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-600 ml-1">
                      /{defenderMaxHp}
                    </span>
                  </div>
                  <span className={`text-sm font-bold ${koColor(combinedKoProb)}`}>
                    {probDisplay}
                  </span>
                </div>

                {/* 防御側 HP バー */}
                <div className="relative h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="absolute left-0 h-full bg-red-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, totalMaxPct)}%`, opacity: 0.35 }}
                  />
                  <div
                    className="absolute left-0 h-full bg-red-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, totalMinPct)}%` }}
                  />
                  <div
                    className="absolute top-0 bottom-0 w-px bg-white dark:bg-slate-300 opacity-50"
                    style={{ left: '100%', transform: 'translateX(-1px)' }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
