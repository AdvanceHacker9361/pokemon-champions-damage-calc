import { useState } from 'react'
import type { DamageResult } from '@/domain/models/DamageResult'
import type { KoResult } from '@/domain/models/DamageResult'
import { DamageBar } from './DamageBar'
import {
  calcVariableMultiHitKo,
  calcKoProbability,
  VARIABLE_MULTI_HIT_DIST,
} from '@/domain/calculators/KoProbabilityCalc'
import { useAccumStore } from '@/presentation/store/accumStore'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { MoveRepository } from '@/data/repositories/MoveRepository'
import type { MultiHitData } from '@/domain/models/Move'

interface DamageResultRowProps {
  moveName: string
  result: DamageResult
  critResult: DamageResult
}

function koLabel(koResult: KoResult): string {
  if (koResult.type === 'guaranteed') return `確定${koResult.hits}発`
  if (koResult.type === 'chance') {
    return `乱数${koResult.hits}発 (${(koResult.probability * 100).toFixed(1)}%)`
  }
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
  return 'text-slate-600'
}

function multiHitKoColor(prob: number): string {
  if (prob >= 1.0) return 'text-red-500 dark:text-red-400'
  if (prob >= 0.75) return 'text-orange-500 dark:text-orange-400'
  if (prob >= 0.5) return 'text-yellow-600 dark:text-yellow-400'
  if (prob > 0) return 'text-amber-600 dark:text-amber-400'
  return 'text-slate-600'
}

/** StatKey → 日本語ランク表記 (A/B/C/D/S) */
const STAT_LETTER: Record<string, string> = {
  hp: 'HP', atk: 'A', def: 'B', spa: 'C', spd: 'D', spe: 'S',
}

/** 1ロール値をKO判定色でクラス取得 */
function rollKoClass(roll: number, hp: number): string {
  if (roll >= hp) return 'text-red-500 dark:text-red-400 font-bold'
  if (roll * 2 >= hp) return 'text-orange-500 dark:text-orange-400'
  if (roll * 3 >= hp) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-slate-700 dark:text-slate-400'
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
      <div className="text-xs text-slate-700 dark:text-slate-400 mb-1">
        おやこあい合計 (親 + 子×25%) — <span className="text-red-500 dark:text-red-400">赤=確定KO</span>
        <span className="text-orange-500 dark:text-orange-400 ml-2">橙=乱数2発</span>
      </div>
      <table className="text-xs font-mono border-collapse">
        <thead>
          <tr>
            <th className="text-slate-600 dark:text-slate-600 pr-1 text-right">親↓子→</th>
            {childRolls.map((c, j) => (
              <th key={j} className="text-slate-600 w-7 text-center px-0.5">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rolls.map((r, i) => (
            <tr key={i}>
              <td className="text-slate-700 dark:text-slate-400 pr-1 text-right">{r}</td>
              {childRolls.map((c, j) => {
                const total = r + c
                const isKo = total >= defenderHp
                return (
                  <td
                    key={j}
                    className={`text-center px-0.5 ${isKo ? 'text-red-500 dark:text-red-400 font-bold' : 'text-slate-600'}`}
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

  if (koCount === 0) return <div className="text-xs text-slate-600 mt-1">KO不可</div>
  if (koCount === total) return <div className="text-xs text-red-500 dark:text-red-400 mt-1">確定KO (親子愛1発)</div>
  return (
    <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
      乱数KO: {koCount}/{total} ({(prob * 100).toFixed(1)}%)
    </div>
  )
}

/** 変動連続技（2〜5回）の確率計算パネル */
function VariableMultiHitPanel({ rolls, defenderHp }: { rolls: number[]; defenderHp: number }) {
  const res = calcVariableMultiHitKo(rolls, defenderHp)

  return (
    <div className="space-y-1.5">
      <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">
        連続技 KO確率（2〜5回ランダム）
      </div>
      <div className="grid grid-cols-4 gap-x-2 text-xs font-mono">
        {res.perHit.map(({ hits, prob, koProbForHits }) => {
          const hitMin = rolls[0] * hits
          const hitMax = rolls[rolls.length - 1] * hits
          const hitMinPct = hitMin / defenderHp * 100
          const hitMaxPct = hitMax / defenderHp * 100
          const distPct = (prob * 100).toFixed(0)
          const koPct = koProbForHits >= 1 ? '確定' : koProbForHits <= 0 ? '不可' : `${(koProbForHits * 100).toFixed(1)}%`
          return (
            <div key={hits} className="bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-1">
              <div className="text-slate-500 dark:text-slate-500 text-[10px]">{hits}回 ({distPct}%)</div>
              <div className="text-slate-800 dark:text-slate-200">{hitMin}〜{hitMax}</div>
              <div className="text-slate-600 dark:text-slate-400 text-[10px]">
                {hitMinPct.toFixed(1)}〜{hitMaxPct.toFixed(1)}%
              </div>
              <div className={`font-bold text-[10px] mt-0.5 ${multiHitKoColor(koProbForHits)}`}>
                {koPct}
              </div>
            </div>
          )
        })}
      </div>
      <div className="bg-slate-100 dark:bg-slate-800 rounded px-2 py-1.5 flex items-center justify-between">
        <div className="text-xs text-slate-700 dark:text-slate-400">
          期待KO確率（加重平均）
          <span className="ml-2 text-slate-500 dark:text-slate-500 text-[10px]">
            期待ダメ: {res.expectedDmg.toFixed(1)}
          </span>
        </div>
        <span className={`text-sm font-bold ${multiHitKoColor(res.totalKoProb)}`}>
          {res.totalKoProb >= 1 ? '確定KO'
            : res.totalKoProb <= 0 ? '倒せない'
            : `${(res.totalKoProb * 100).toFixed(1)}%`}
        </span>
      </div>
    </div>
  )
}

export function DamageResultRow({ moveName, result, critResult }: DamageResultRowProps) {
  const { min, max, defenderMaxHp } = result
  const [rollsExpanded, setRollsExpanded] = useState(false)
  const [multiHitExpanded, setMultiHitExpanded] = useState(false)
  const [pbExpanded, setPbExpanded] = useState(false)
  const [added, setAdded] = useState(false)
  const [isCritical, setIsCritical] = useState(false)

  const addEntry = useAccumStore(s => s.addEntry)
  const attackerName = useAttackerStore(s => s.pokemonName)
  const attackerAbility = useAttackerStore(s => s.effectiveAbility)
  const attackerRanks = useAttackerStore(s => s.ranks)
  const setAttackerRank = useAttackerStore(s => s.setRank)
  const defenderAbility = useDefenderStore(s => s.effectiveAbility)
  const defenderAbilityActivated = useDefenderStore(s => s.abilityActivated)

  const isParentalBond = attackerAbility === 'おやこあい'
  const isDisguiseIntact = defenderAbility === 'ばけのかわ' && defenderAbilityActivated

  const moveRecord = MoveRepository.findByName(moveName)
  const multiHit: MultiHitData | null | undefined = moveRecord?.multiHit

  // 急所時は critResult のロールを使う（1.5倍・壁無効適用済み）
  const activeResult = isCritical ? critResult : result
  const rolls = Array.from(activeResult.rolls)

  // ── おやこあい: 子ロール (親の25%) と合算ロール ──────────────────
  const childRollsArr = calcChildRolls(rolls)
  // 親+子 合算ロール（おやこあい通常時の主表示）
  const combinedRolls = rolls.map((r, i) => r + childRollsArr[i])

  // ── ばけのかわ: 定数ダメと実効ロール ──────────────────────────────
  // disguiseFlatDmg: ばけのかわ発動時にミミッキュが受ける固定ダメ（HP/8）
  const disguiseFlatDmg = isDisguiseIntact ? Math.floor(defenderMaxHp / 8) : 0
  // ばけのかわ発動時の技ラベル
  let disguiseLabel = ''
  // 実効ロール: ばけのかわ・おやこあいを考慮した最終ダメージのロール列
  let effectiveRolls: number[]

  if (isDisguiseIntact) {
    if (isParentalBond) {
      // 親の一撃→ばけのかわ無効、子の一撃が通る
      effectiveRolls = childRollsArr
      disguiseLabel = 'ばけのかわ発動（親を無効 → 子ダメのみ）'
    } else if (multiHit?.type === 'fixed' && multiHit.count > 1) {
      // 固定複数回: 1発目無効、残り(count-1)発が通る
      const remaining = multiHit.count - 1
      effectiveRolls = rolls.map(r => r * remaining)
      disguiseLabel = `ばけのかわ発動（1発目無効 → 残${remaining}発）`
    } else {
      // 単発技: 全て無効
      effectiveRolls = rolls.map(() => 0)
      disguiseLabel = 'ばけのかわ発動（全弾無効）'
    }
  } else if (isParentalBond) {
    // おやこあい通常: 親+子 合算
    effectiveRolls = combinedRolls
  } else {
    effectiveRolls = rolls
  }

  // ── 表示値（主ダメージ表示に使う） ───────────────────────────────
  const displayMin = effectiveRolls[0]
  const displayMax = effectiveRolls[effectiveRolls.length - 1]
  const displayPercentMin = displayMin / defenderMaxHp * 100
  const displayPercentMax = displayMax / defenderMaxHp * 100

  // KO確率: ばけのかわ定数ダメ分だけ実効HPを減らして再計算
  const effectiveHpForKo = Math.max(1, defenderMaxHp - disguiseFlatDmg)
  let displayKoResult: KoResult
  if (isParentalBond || isDisguiseIntact) {
    if (displayMin === 0 && displayMax === 0) {
      // 単発+ばけのかわ無効: 固定ダメのみでKO判定
      displayKoResult = disguiseFlatDmg >= defenderMaxHp
        ? { type: 'guaranteed', hits: 1 }
        : { type: 'no-ko' }
    } else {
      displayKoResult = calcKoProbability(effectiveRolls, effectiveHpForKo)
    }
  } else {
    displayKoResult = activeResult.koResult
  }

  // タイプ無効（元のダメージが0）→ "効果がない" 表示
  if (min === 0 && max === 0) {
    return (
      <div className="py-2 border-b border-slate-200 dark:border-slate-800">
        <div className="text-sm text-slate-600 dark:text-slate-400 font-medium">{moveName}</div>
        <div className="text-xs text-slate-600 dark:text-slate-600 mt-1">効果がない</div>
      </div>
    )
  }

  function handleAddToAccum() {
    // 加算には実効ロール（おやこあい合算 / ばけのかわ後）を使う
    const critLabel = isCritical ? '(急所)' : ''
    addEntry({
      label: `${attackerName} の${moveName}${critLabel}${isParentalBond ? '(おやこあい)' : ''}${isDisguiseIntact ? '+ばけのかわ' : ''}`,
      rolls: effectiveRolls,
      usages: 1,
      minDmg: displayMin,
      maxDmg: displayMax,
      defenderMaxHp,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 1200)
  }

  return (
    <div className="py-2 border-b border-slate-200 dark:border-slate-800 last:border-0">
      {/* ヘッダー: 技名バッジ + KOラベル + 加算回数セレクター */}
      <div className="flex items-baseline justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{moveName}</span>
          {multiHit && (
            <span className="text-[10px] px-1 py-0 rounded bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-medium">
              {multiHit.type === 'fixed' ? `固定${multiHit.count}回` : '2〜5回'}
            </span>
          )}
          {isParentalBond && (
            <span className="text-[10px] px-1 py-0 rounded bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300 font-medium">
              おやこあい
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-bold ${koLabelColor(displayKoResult)}`}>
            {koLabel(displayKoResult)}
          </span>
          {/* 急所トグル */}
          <button
            type="button"
            onClick={() => setIsCritical(v => !v)}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
              isCritical
                ? 'bg-yellow-500 dark:bg-yellow-600 border-yellow-400 dark:border-yellow-500 text-white font-semibold'
                : 'border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-yellow-400 dark:hover:border-yellow-500 hover:text-yellow-600 dark:hover:text-yellow-400'
            }`}
            title="急所ダメージに切り替え"
          >
            急所
          </button>
          <button
            type="button"
            onClick={handleAddToAccum}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
              added
                ? 'bg-blue-600 dark:bg-blue-700 border-blue-500 dark:border-blue-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-400'
            }`}
            title="加算リストに追加"
          >
            {added ? '✓ 追加' : '+ 加算'}
          </button>
          {/* 使用後の自ステータス変化ボタン（りゅうせいぐん・フレアソング等） */}
          {moveRecord?.selfStatDrop && (() => {
            const { stat, stages } = moveRecord.selfStatDrop
            const letter = STAT_LETTER[stat] ?? stat
            const isBoost = stages > 0
            const sign = isBoost ? '+' : '−'
            const abs = Math.abs(stages)
            const arrow = isBoost ? '↑' : '↓'
            const currentRank = attackerRanks[stat as keyof typeof attackerRanks] ?? 0
            const targetRank = currentRank + stages
            const clamped = Math.max(-6, Math.min(6, targetRank))
            const willApply = clamped !== currentRank
            return (
              <button
                type="button"
                onClick={() => setAttackerRank(stat as keyof typeof attackerRanks, clamped)}
                disabled={!willApply}
                className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                  willApply
                    ? isBoost
                      ? 'border-blue-400 dark:border-blue-600 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950'
                      : 'border-rose-400 dark:border-rose-600 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950'
                    : 'border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                }`}
                title={`攻撃側の${letter}ランクを${abs}段階${isBoost ? '上げる' : '下げる'}（現在: ${currentRank} → ${clamped}）`}
              >
                {arrow}{letter}{sign}{abs}
              </button>
            )
          })()}
        </div>
      </div>

      {/* ばけのかわ発動ライン */}
      {isDisguiseIntact && (
        <div className="text-[10px] text-purple-600 dark:text-purple-400 mb-1 flex items-center gap-2">
          <span>🎭 {disguiseLabel}</span>
          <span className="font-mono">
            +固定{disguiseFlatDmg}
            <span className="text-purple-400 dark:text-purple-500 ml-0.5">
              ({(disguiseFlatDmg / defenderMaxHp * 100).toFixed(1)}%)
            </span>
          </span>
        </div>
      )}

      {/* おやこあい内訳ライン（ばけのかわなし時のみ） */}
      {isParentalBond && !isDisguiseIntact && (
        <div className="text-[10px] text-pink-600 dark:text-pink-400 mb-1 font-mono">
          親: {rolls[0]}〜{rolls[rolls.length - 1]}
          <span className="mx-1 text-pink-400">+</span>
          子: {childRollsArr[0]}〜{childRollsArr[childRollsArr.length - 1]}
          <span className="ml-1 text-pink-500 dark:text-pink-500">= 合算</span>
        </div>
      )}

      {/* ダメージ範囲 + トグルボタン群 */}
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <span className="text-sm font-mono text-slate-900 dark:text-slate-100">{displayMin}〜{displayMax}</span>
        <span className="text-xs text-slate-700 dark:text-slate-400 font-mono">
          ({displayPercentMin.toFixed(1)}%〜{displayPercentMax.toFixed(1)}%)
        </span>
        <span className="text-xs text-slate-600 dark:text-slate-600">/{defenderMaxHp}</span>
        <div className="ml-auto flex items-center gap-1">
          {multiHit?.type === 'variable' && (
            <button
              type="button"
              onClick={() => setMultiHitExpanded(v => !v)}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 transition-colors"
              title="連続技 KO確率"
            >
              {multiHitExpanded ? '▲' : '▼'}連続技
            </button>
          )}
          <button
            type="button"
            onClick={() => setRollsExpanded(v => !v)}
            className="text-xs text-slate-600 hover:text-slate-800 dark:hover:text-slate-300 transition-colors"
            title="15乱数を表示"
          >
            {rollsExpanded ? '▲' : '▼'}乱数
          </button>
        </div>
      </div>

      <DamageBar percentMax={displayPercentMax} koResult={displayKoResult} />

      {/* 変動連続技 KO確率パネル */}
      {multiHitExpanded && multiHit?.type === 'variable' && (
        <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
          <VariableMultiHitPanel rolls={rolls} defenderHp={defenderMaxHp} />
        </div>
      )}

      {/* 乱数展開 */}
      {rollsExpanded && (
        <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1.5">
          {/* 実効ロール */}
          <div>
            <div className="text-xs text-slate-600 dark:text-slate-400 mb-0.5">
              {isParentalBond && !isDisguiseIntact ? '合算15乱数（親+子）'
                : isDisguiseIntact && isParentalBond ? '子ダメ15乱数'
                : isDisguiseIntact ? '実効ダメ15乱数'
                : '15乱数'}
            </div>
            <div className="flex flex-wrap gap-x-1 gap-y-0.5">
              {effectiveRolls.map((r, i) => (
                <span key={i} className={`text-xs font-mono ${rollKoClass(r, effectiveHpForKo)}`}>
                  {r}
                </span>
              ))}
            </div>
          </div>

          {/* おやこあい時: 親の素ロールを参考表示 */}
          {isParentalBond && (
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-500 mb-0.5">
                親ロール（参考）
              </div>
              <div className="flex flex-wrap gap-x-1 gap-y-0.5">
                {rolls.map((r, i) => (
                  <span key={i} className="text-xs font-mono text-slate-500 dark:text-slate-600">
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* おやこあい 15×15乱数表（ばけのかわなし時のみ） */}
          {isParentalBond && !isDisguiseIntact && (
            <div>
              <button
                type="button"
                onClick={() => setPbExpanded(v => !v)}
                className="text-xs text-slate-700 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              >
                {pbExpanded ? '▲' : '▼'} おやこあい 15×15乱数表
              </button>
              {pbExpanded && (
                <ParentalBondTable rolls={rolls} defenderHp={defenderMaxHp} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// 未使用変数の警告を防ぐ
void VARIABLE_MULTI_HIT_DIST
