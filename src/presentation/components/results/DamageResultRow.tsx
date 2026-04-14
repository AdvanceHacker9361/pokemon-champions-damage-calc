import { useState } from 'react'
import type { DamageResult } from '@/domain/models/DamageResult'
import { DamageBar } from './DamageBar'
import { calcKoProbabilityForNHits } from '@/domain/calculators/KoProbabilityCalc'
import { useAccumStore } from '@/presentation/store/accumStore'
import { useAttackerStore } from '@/presentation/store/pokemonStore'

interface DamageResultRowProps {
  moveName: string
  result: DamageResult
}

function koLabel(result: DamageResult): string {
  const { koResult } = result
  if (koResult.type === 'guaranteed') return `確定${koResult.hits}発`
  if (koResult.type === 'chance') {
    return `乱数${koResult.hits}発 (${(koResult.probability * 100).toFixed(1)}%)`
  }
  return '倒せない'
}

function koLabelColor(result: DamageResult): string {
  const { koResult } = result
  if (koResult.type === 'guaranteed') {
    if (koResult.hits === 1) return 'text-red-500 dark:text-red-400'
    if (koResult.hits === 2) return 'text-orange-500 dark:text-orange-400'
    if (koResult.hits === 3) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-green-600 dark:text-green-400'
  }
  if (koResult.type === 'chance') return 'text-amber-600 dark:text-amber-400'
  return 'text-slate-500'
}

function multiHitKoColor(prob: number): string {
  if (prob >= 1.0) return 'text-red-500 dark:text-red-400'
  if (prob >= 0.75) return 'text-orange-500 dark:text-orange-400'
  if (prob >= 0.5) return 'text-yellow-600 dark:text-yellow-400'
  if (prob > 0) return 'text-amber-600 dark:text-amber-400'
  return 'text-slate-500'
}

/** 1ロール値をKO判定色でクラス取得 */
function rollKoClass(roll: number, hp: number): string {
  if (roll >= hp) return 'text-red-500 dark:text-red-400 font-bold'
  if (roll * 2 >= hp) return 'text-orange-500 dark:text-orange-400'
  if (roll * 3 >= hp) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-slate-500 dark:text-slate-400'
}

// 定数ダメージのプリセット割合
const CONST_FRACTIONS = [
  { label: '1/16', num: 1, den: 16 },
  { label: '1/8',  num: 1, den: 8  },
  { label: '1/6',  num: 1, den: 6  },
  { label: '1/4',  num: 1, den: 4  },
  { label: '1/2',  num: 1, den: 2  },
]

function ConstBar({ value, maxHp }: { value: number; maxHp: number }) {
  const pct = Math.min(100, (value / maxHp) * 100)
  return (
    <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
      <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
    </div>
  )
}

/** おやこあい: 子の一撃ロールを計算 (各ロールの25%) */
function calcChildRolls(parentRolls: number[]): number[] {
  return parentRolls.map(r => Math.floor(r * 0.25))
}

/** おやこあい 16×16 テーブル */
function ParentalBondTable({ rolls, defenderHp }: { rolls: number[]; defenderHp: number }) {
  const childRolls = calcChildRolls(rolls)

  return (
    <div className="mt-1 overflow-x-auto">
      <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
        おやこあい合計 (親 + 子×25%) — <span className="text-red-500 dark:text-red-400">赤=確定KO</span>
        <span className="text-orange-500 dark:text-orange-400 ml-2">橙=乱数2発</span>
      </div>
      <table className="text-xs font-mono border-collapse">
        <thead>
          <tr>
            <th className="text-slate-400 dark:text-slate-600 pr-1 text-right">親↓子→</th>
            {childRolls.map((c, j) => (
              <th key={j} className="text-slate-500 w-7 text-center px-0.5">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rolls.map((r, i) => (
            <tr key={i}>
              <td className="text-slate-500 dark:text-slate-400 pr-1 text-right">{r}</td>
              {childRolls.map((c, j) => {
                const total = r + c
                const isKo = total >= defenderHp
                return (
                  <td
                    key={j}
                    className={`text-center px-0.5 ${isKo ? 'text-red-500 dark:text-red-400 font-bold' : 'text-slate-500'}`}
                  >
                    {total}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <ParentalBondKoInfo rolls={rolls} childRolls={childRolls} defenderHp={defenderHp} />
    </div>
  )
}

function ParentalBondKoInfo({ rolls, childRolls, defenderHp }: { rolls: number[]; childRolls: number[]; defenderHp: number }) {
  let koCount = 0
  for (const r of rolls) {
    for (const c of childRolls) {
      if (r + c >= defenderHp) koCount++
    }
  }
  const total = rolls.length * childRolls.length
  const prob = koCount / total

  if (koCount === 0) return <div className="text-xs text-slate-500 mt-1">KO不可</div>
  if (koCount === total) return <div className="text-xs text-red-500 dark:text-red-400 mt-1">確定KO (親子愛1発)</div>
  return (
    <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
      乱数KO: {koCount}/{total} ({(prob * 100).toFixed(1)}%)
    </div>
  )
}

export function DamageResultRow({ moveName, result }: DamageResultRowProps) {
  const { min, max, percentMin, percentMax, defenderMaxHp } = result
  const [expanded, setExpanded] = useState(false)
  const [rollsExpanded, setRollsExpanded] = useState(false)
  const [pbExpanded, setPbExpanded] = useState(false)
  const [hitCount, setHitCount] = useState(2)
  const [constDmg, setConstDmg] = useState(0)
  const [constRec, setConstRec] = useState(0)
  const [added, setAdded] = useState(false)

  const addEntry = useAccumStore(s => s.addEntry)
  const attackerName = useAttackerStore(s => s.pokemonName)
  const attackerAbility = useAttackerStore(s => s.effectiveAbility)
  const isParentalBond = attackerAbility === 'おやこあい'

  if (min === 0 && max === 0) {
    return (
      <div className="py-2 border-b border-slate-200 dark:border-slate-800">
        <div className="text-sm text-slate-600 dark:text-slate-400 font-medium">{moveName}</div>
        <div className="text-xs text-slate-400 dark:text-slate-600 mt-1">効果がない</div>
      </div>
    )
  }

  const netConst = constDmg - constRec
  const effectiveHp = Math.max(1, defenderMaxHp - netConst)
  const rolls = Array.from(result.rolls)
  const multiProb = calcKoProbabilityForNHits(rolls, effectiveHp, hitCount)
  const multiMin = min * hitCount + netConst
  const multiMax = max * hitCount + netConst
  const multiPercentMin = (multiMin / defenderMaxHp * 100)
  const multiPercentMax = (multiMax / defenderMaxHp * 100)

  const probDisplay = multiProb >= 1.0 ? '確定'
    : multiProb <= 0 ? '不可'
    : `${(multiProb * 100).toFixed(1)}%`

  function handleAddToAccum() {
    addEntry({
      label: `${attackerName} の${moveName}`,
      rolls,
      minDmg: min,
      maxDmg: max,
      defenderMaxHp,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 1200)
  }

  return (
    <div className="py-2 border-b border-slate-200 dark:border-slate-800 last:border-0">
      {/* ヘッダー: 技名 + KOラベル + 追加ボタン */}
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{moveName}</span>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${koLabelColor(result)}`}>
            {koLabel(result)}
          </span>
          <button
            type="button"
            onClick={handleAddToAccum}
            className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${
              added
                ? 'bg-blue-600 dark:bg-blue-700 border-blue-500 dark:border-blue-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-400'
            }`}
            title="加算リストに追加"
          >
            {added ? '✓' : '+'}
          </button>
        </div>
      </div>

      {/* ダメージ範囲 + トグルボタン群 */}
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <span className="text-sm font-mono text-slate-900 dark:text-slate-100">{min}〜{max}</span>
        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
          ({percentMin.toFixed(1)}%〜{percentMax.toFixed(1)}%)
        </span>
        <span className="text-xs text-slate-400 dark:text-slate-600">/{defenderMaxHp}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setRollsExpanded(v => !v)}
            className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            title="16乱数を表示"
          >
            {rollsExpanded ? '▲' : '▼'}乱数
          </button>
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            title="加算計算"
          >
            {expanded ? '▲' : '▼'}加算
          </button>
        </div>
      </div>

      <DamageBar percentMax={percentMax} koResult={result.koResult} />

      {/* 16乱数表示 */}
      {rollsExpanded && (
        <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
          <div className="text-xs text-slate-500 mb-1">16乱数 (最小〜最大)</div>
          <div className="flex flex-wrap gap-x-1 gap-y-0.5">
            {rolls.map((r, i) => (
              <span key={i} className={`text-xs font-mono ${rollKoClass(r, defenderMaxHp)}`}>
                {r}
              </span>
            ))}
          </div>

          {/* おやこあい 16×16テーブル */}
          {isParentalBond && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setPbExpanded(v => !v)}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              >
                {pbExpanded ? '▲' : '▼'} おやこあい 16×16乱数表
              </button>
              {pbExpanded && (
                <ParentalBondTable rolls={rolls} defenderHp={defenderMaxHp} />
              )}
            </div>
          )}
        </div>
      )}

      {/* 加算計算パネル */}
      {expanded && (
        <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
          {/* 攻撃回数 */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 dark:text-slate-400 w-14 flex-shrink-0">攻撃回数</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setHitCount(n)}
                  className={`w-6 h-6 text-xs rounded transition-colors ${
                    hitCount === n
                      ? 'bg-blue-600 dark:bg-blue-700 text-white'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-600'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* 定数ダメージ */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 dark:text-slate-400 w-14 flex-shrink-0">定数ダメ</span>
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
              <span className="text-xs text-slate-400 dark:text-slate-600">砂/毒/やけど等</span>
            </div>
            <div className="flex items-center gap-1 pl-[3.75rem]">
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
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500 hover:border-slate-400 dark:hover:border-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
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
              <span className="text-xs text-slate-500 dark:text-slate-400 w-14 flex-shrink-0">定数回復</span>
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
              <span className="text-xs text-slate-400 dark:text-slate-600">残飯/黒ヘド等</span>
            </div>
            <div className="flex items-center gap-1 pl-[3.75rem]">
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
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500 hover:border-slate-400 dark:hover:border-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
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
                <ConstBar value={constRec} maxHp={defenderMaxHp} />
                <span className="text-xs text-teal-600 dark:text-teal-400 font-mono">
                  {(constRec / defenderMaxHp * 100).toFixed(1)}%
                </span>
              </div>
            )}
          </div>

          {/* 加算結果 */}
          <div className="bg-slate-100 dark:bg-slate-800 rounded px-2 py-1.5 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400">{hitCount}発累積: </span>
              <span className="text-sm font-mono text-slate-900 dark:text-slate-100">{multiMin}〜{multiMax}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono ml-1">
                ({multiPercentMin.toFixed(1)}%〜{multiPercentMax.toFixed(1)}%)
              </span>
            </div>
            <span className={`text-sm font-bold ${multiHitKoColor(multiProb)}`}>
              {probDisplay}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
