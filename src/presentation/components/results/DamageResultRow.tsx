import { useState } from 'react'
import type { DamageResult } from '@/domain/models/DamageResult'
import type { KoResult } from '@/domain/models/DamageResult'
import { DamageBar } from './DamageBar'
import {
  calcVariableMultiHitKo,
  calcKoProbability,
  getVariableMultiHitDist,
} from '@/domain/calculators/KoProbabilityCalc'
import { calcCritChance } from '@/domain/calculators/CritRank'
import { useAccumStore } from '@/presentation/store/accumStore'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { MoveRepository } from '@/data/repositories/MoveRepository'
import type { MultiHitData } from '@/domain/models/Move'
import { TypeBadge } from '@/presentation/components/shared/Badge'
import type { TypeName } from '@/domain/models/Pokemon'
import { DurabilityPanel } from './DurabilityPanel'

interface DamageResultRowProps {
  moveName: string
  result: DamageResult
  critResult: DamageResult
  /** 段階威力型の各発個別結果 */
  perHitResults?: DamageResult[]
  critPerHitResults?: DamageResult[]
  /** マルチスケイル無効時（2発目以降用）の素ダメ結果 */
  rawResult?: DamageResult
  rawCritResult?: DamageResult
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
function ParentalBondTable({ rolls, childRolls, defenderHp }: { rolls: number[]; childRolls: number[]; defenderHp: number }) {

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

/**
 * rolls/rawRolls と各種フラグから、メイン表示用の実効ロール列を算出する
 * （おやこあい合算・ばけのかわ無効化・固定多段合計 等を統一的に処理）
 */
function computeEffectiveRolls(params: {
  rolls: number[]
  rawRolls: number[]
  multiHit: MultiHitData | null | undefined
  isParentalBond: boolean
  isDisguiseIntact: boolean
  perHitResults?: DamageResult[]
}): number[] {
  const { rolls, rawRolls, multiHit, isParentalBond, isDisguiseIntact, perHitResults } = params
  const childRollsArr = calcChildRolls(rawRolls)
  const combinedRolls = rolls.map((r, i) => r + childRollsArr[i])

  if (isDisguiseIntact) {
    if (isParentalBond) return childRollsArr
    if (multiHit?.type === 'escalating' && perHitResults && perHitResults.length > 1) {
      return perHitResults.slice(1).reduce(
        (acc, r) => acc.map((v, i) => v + r.rolls[i]),
        Array(15).fill(0) as number[],
      )
    }
    if (multiHit?.type === 'fixed' && multiHit.count > 1) {
      const remaining = multiHit.count - 1
      return rolls.map(r => r * remaining)
    }
    return rolls.map(() => 0)
  }
  if (isParentalBond) return combinedRolls
  if (multiHit?.type === 'fixed' && multiHit.count > 1) {
    const count = multiHit.count
    return rolls.map((r, i) => r + rawRolls[i] * (count - 1))
  }
  return rolls
}

/** 変動連続技の確率計算パネル */
function VariableMultiHitPanel({
  rolls, rawRolls, defenderHp, hitRate, dist,
}: {
  rolls: number[]
  /** マルチスケイル無効時（2発目以降用）の素ダメロール。通常時は rolls と同値 */
  rawRolls: number[]
  defenderHp: number
  hitRate: number
  dist: { hits: number; prob: number }[]
}) {
  const res = calcVariableMultiHitKo(rolls, defenderHp, dist)
  const expectedWithAcc = res.expectedDmg * hitRate
  const gridCols = dist.length === 1 ? 'grid-cols-1'
    : dist.length === 2 ? 'grid-cols-2'
    : 'grid-cols-4'

  return (
    <div className="space-y-1.5">
      <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">
        連続技 KO確率
      </div>
      <div className={`grid ${gridCols} gap-x-2 text-xs font-mono`}>
        {res.perHit.map(({ hits, prob, koProbForHits }) => {
          // マルチスケイル発動時: 1発目 rolls + 2発目以降 rawRolls
          const hitMin = rolls[0] + rawRolls[0] * (hits - 1)
          const hitMax = rolls[rolls.length - 1] + rawRolls[rawRolls.length - 1] * (hits - 1)
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
            期待ダメ: {expectedWithAcc.toFixed(1)}
            {hitRate < 1 && <span className="ml-1 text-slate-400">({Math.round(hitRate * 100)}%命中込)</span>}
          </span>
        </div>
        <span className={`text-sm font-bold ${multiHitKoColor(res.totalKoProb * hitRate)}`}>
          {res.totalKoProb * hitRate >= 1 ? '確定KO'
            : res.totalKoProb * hitRate <= 0 ? '倒せない'
            : `${(res.totalKoProb * hitRate * 100).toFixed(1)}%`}
        </span>
      </div>
    </div>
  )
}

export function DamageResultRow(props: DamageResultRowProps) {
  const { moveName, result, critResult } = props
  const { min, max, defenderMaxHp } = result
  const [rollsExpanded, setRollsExpanded] = useState(false)
  const [multiHitExpanded, setMultiHitExpanded] = useState(false)
  const [pbExpanded, setPbExpanded] = useState(false)
  const [durabilityExpanded, setDurabilityExpanded] = useState(false)
  const [added, setAdded] = useState(false)
  const [isCritical, setIsCritical] = useState(false)

  const addEntry = useAccumStore(s => s.addEntry)
  const attackerName = useAttackerStore(s => s.pokemonName)
  const attackerAbility = useAttackerStore(s => s.effectiveAbility)
  const attackerItem = useAttackerStore(s => s.itemName)
  const focusEnergyActive = useAttackerStore(s => s.focusEnergyActive)
  const attackerRanks = useAttackerStore(s => s.ranks)
  const setAttackerRank = useAttackerStore(s => s.setRank)
  const defenderAbility = useDefenderStore(s => s.effectiveAbility)
  const defenderAbilityActivated = useDefenderStore(s => s.abilityActivated)

  const isParentalBond = attackerAbility === 'おやこあい'
  const isDisguiseIntact = defenderAbility === 'ばけのかわ' && defenderAbilityActivated

  const moveRecord = MoveRepository.findByName(moveName)
  const multiHit: MultiHitData | null | undefined = moveRecord?.multiHit
  // 変動連続技のヒット分布（スキルリンク / いかさまダイス で変化）
  const variableMultiHitDist = getVariableMultiHitDist(attackerAbility, attackerItem)
  // 段階威力型の各発個別結果（ばけのかわ等）
  const perHitResults = isCritical ? props.critPerHitResults : props.perHitResults

  // 急所時は critResult のロールを使う（1.5倍・壁無効適用済み）
  const activeResult = isCritical ? critResult : result
  const rolls = Array.from(activeResult.rolls)

  // マルチスケイル/ファントムガード 2発目以降用の素ダメロール（fixed/variable 多段技用）
  // rawResult がない場合（単発技・マルチスケイル無効時）は rolls と同値
  const HP_FULL_ABILITIES = new Set(['マルチスケイル', 'ファントムガード'])
  const hadMultiscale = HP_FULL_ABILITIES.has(defenderAbility) && defenderAbilityActivated
  const activeRawResult = isCritical ? props.rawCritResult : props.rawResult
  const rawRolls = hadMultiscale && activeRawResult
    ? Array.from(activeRawResult.rolls)
    : rolls

  // 確定急所技 / 急所モードで加算された場合は、急所込み計算で再混合しないため isForcedCrit とマーク
  const isForcedCrit = (moveRecord?.alwaysCrit === true) || isCritical
  // 急所率: 技・特性・アイテム・きあいだめを統合したランクベース計算
  const moveCritChance = calcCritChance({
    moveCritBonus: moveRecord?.critChance ?? 0,
    attackerAbility,
    attackerItem,
    focusEnergyActive,
  })

  // ── おやこあい: 子ロール (親の25%) と合算ロール ──────────────────
  // マルチスケイル発動時は「親=半減(1発目), 子=素ダメの25%(2発目)」とする。
  // 無発動時は rawRolls === rolls なので結果は同じ。
  const childRollsArr = calcChildRolls(rawRolls)

  // ── ばけのかわ: 定数ダメと実効ロール ──────────────────────────────
  // disguiseFlatDmg: ばけのかわ発動時にミミッキュが受ける固定ダメ（HP/8）
  const disguiseFlatDmg = isDisguiseIntact ? Math.floor(defenderMaxHp / 8) : 0
  // ばけのかわ発動時の技ラベル
  let disguiseLabel = ''
  if (isDisguiseIntact) {
    if (isParentalBond) disguiseLabel = 'ばけのかわ発動（親を無効 → 子ダメのみ）'
    else if (multiHit?.type === 'escalating' && perHitResults && perHitResults.length > 1)
      disguiseLabel = `ばけのかわ発動（1発目無効 → 残${perHitResults.length - 1}発）`
    else if (multiHit?.type === 'fixed' && multiHit.count > 1)
      disguiseLabel = `ばけのかわ発動（1発目無効 → 残${multiHit.count - 1}発）`
    else disguiseLabel = 'ばけのかわ発動（全弾無効）'
  }

  // 実効ロール: ばけのかわ・おやこあい・固定多段合計 を考慮した最終ダメージのロール列
  const effectiveRolls = computeEffectiveRolls({
    rolls, rawRolls, multiHit, isParentalBond, isDisguiseIntact, perHitResults,
  })

  // 急所ロール（メイン表示では使わない / 加算時と急所込みKO計算で使用）
  const critRollsBase = Array.from(critResult.rolls)
  const rawCritRollsBase = hadMultiscale && props.rawCritResult
    ? Array.from(props.rawCritResult.rolls)
    : critRollsBase
  const critPerHitResults = props.critPerHitResults
  const effectiveCritRolls = computeEffectiveRolls({
    rolls: critRollsBase, rawRolls: rawCritRollsBase, multiHit, isParentalBond, isDisguiseIntact,
    perHitResults: critPerHitResults,
  })

  // ── 表示値（主ダメージ表示に使う） ───────────────────────────────
  const displayMin = effectiveRolls[0]
  const displayMax = effectiveRolls[effectiveRolls.length - 1]
  const displayPercentMin = displayMin / defenderMaxHp * 100
  const displayPercentMax = displayMax / defenderMaxHp * 100

  // ── 期待ダメージ（命中率 × 急所加重平均） ──────────────────────────
  const hitRate = moveRecord?.accuracy != null ? moveRecord.accuracy / 100 : 1.0
  const isAlwaysCrit = moveRecord?.alwaysCrit === true
  const critRate = isAlwaysCrit ? 1.0 : moveCritChance
  const avgNormal = (displayMin + displayMax) / 2
  // 急所倍率スケール: 通常result vs critResultの比率から算出
  const baseRollSum = result.max + result.min
  const critRollSum = critResult.max + critResult.min
  const critScaleFactor = baseRollSum > 0 ? critRollSum / baseRollSum : 1.5
  const avgCrit = avgNormal * critScaleFactor
  const expectedDmg = hitRate * (critRate * avgCrit + (1 - critRate) * avgNormal)

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

    // 素ダメ（マルチスケイルなし）: useDamageCalc が計算した activeRawResult を使う。
    // フォールバックはロール×2 近似（pokeRound の誤差は最大1HP）。
    const accumRawRolls = hadMultiscale
      ? (activeRawResult ? Array.from(activeRawResult.rolls) : effectiveRolls.map(r => r * 2))
      : effectiveRolls
    const accumRawMin = accumRawRolls[0]
    const accumRawMax = accumRawRolls[accumRawRolls.length - 1]

    // 急所ロール: 急所モードで加算または確定急所技の場合は rolls と同じ（急所込み計算で再混合しない）
    const critRolls = isForcedCrit ? effectiveRolls : effectiveCritRolls
    const rawCritRollsStored = isForcedCrit ? accumRawRolls : effectiveCritRolls
    const thisCritChance = isForcedCrit ? 1.0 : moveCritChance

    // おやこあい（ばけのかわ未発動時）: 親・子を独立スロットで急所込み計算するために
    // 親単体ロールと子単体ロールを個別に保存する。
    // rolls（合算）は通常KO確率・ダメージ分布の計算には引き続き使用。
    let pbParentRolls: number[] | undefined
    let pbParentCritRolls: number[] | undefined
    let pbParentRawRolls: number[] | undefined
    let pbParentRawCritRolls: number[] | undefined
    let pbChildRolls: number[] | undefined
    let pbChildCritRolls: number[] | undefined
    if (isParentalBond && !isDisguiseIntact) {
      pbParentRolls = rolls                         // activeResult の親ロール
      pbParentCritRolls = critRollsBase             // 急所時の親ロール
      pbParentRawRolls = rawRolls                   // マルチスケイル無効の親ロール
      pbParentRawCritRolls = rawCritRollsBase       // マルチスケイル無効の急所親ロール
      pbChildRolls = childRollsArr                  // 子ロール = rawRolls * 25%
      pbChildCritRolls = calcChildRolls(rawCritRollsBase)  // 急所子ロール
    }

    // 変動連続技: スキルリンク=確定5発, いかさまダイス=5発デフォルト, 通常=1発
    const defaultUsages = multiHit?.type === 'variable'
      ? variableMultiHitDist[variableMultiHitDist.length - 1].hits
      : 1

    addEntry({
      label: `${attackerName} の${moveName}${critLabel}${isParentalBond ? '(おやこあい)' : ''}${isDisguiseIntact ? '+ばけのかわ' : ''}`,
      rolls: effectiveRolls,
      rawRolls: accumRawRolls,
      usages: defaultUsages,
      minDmg: displayMin,
      maxDmg: displayMax,
      rawMin: accumRawMin,
      rawMax: accumRawMax,
      defenderMaxHp,
      hadMultiscale,
      critRolls,
      rawCritRolls: rawCritRollsStored,
      critMin: critRolls[0],
      critMax: critRolls[critRolls.length - 1],
      rawCritMin: rawCritRollsStored[0],
      rawCritMax: rawCritRollsStored[rawCritRollsStored.length - 1],
      critChance: thisCritChance,
      isForcedCrit,
      pbParentRolls,
      pbParentCritRolls,
      pbParentRawRolls,
      pbParentRawCritRolls,
      pbChildRolls,
      pbChildCritRolls,
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
          {moveRecord?.type && <TypeBadge type={moveRecord.type as TypeName} size="sm" />}
          {multiHit && (
            <span className="text-[10px] px-1 py-0 rounded bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-medium">
              {multiHit.type === 'fixed' ? `固定${multiHit.count}回`
                : multiHit.type === 'escalating' ? multiHit.powers.join('→')
                : attackerAbility === 'スキルリンク' ? '確定5回'
                : attackerItem === 'いかさまダイス' ? '4〜5回'
                : '2〜5回'}
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
          {/* 使用後の自ステータス変化ボタン（りゅうせいぐん・フレアソング等: 単一） */}
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
                key={stat}
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
          {/* 使用後の自ステータス変化ボタン（アーマーキャノン等: 複数） */}
          {moveRecord?.selfStatDrops?.map(({ stat, stages }) => {
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
                key={stat}
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
          })}
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
          <button
            type="button"
            onClick={() => setDurabilityExpanded(v => !v)}
            className={`text-xs transition-colors ${
              durabilityExpanded
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-600 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
            title="耐久調整（H+B/Dの最適SP配分）"
          >
            {durabilityExpanded ? '▲' : '▼'}耐久
          </button>
        </div>
      </div>

      <DamageBar percentMin={displayPercentMin} percentMax={displayPercentMax} koResult={displayKoResult} />
      <div className="flex items-center justify-between text-[10px] font-mono mt-0.5">
        <span className="text-slate-500 dark:text-slate-500">
          期待:
          <span className="ml-0.5 font-semibold text-slate-600 dark:text-slate-400">{expectedDmg.toFixed(1)}</span>
          {hitRate < 1 && (
            <span className="ml-1 text-slate-400 dark:text-slate-600">
              {Math.round(hitRate * 100)}%命中
            </span>
          )}
          {!isAlwaysCrit && critRate >= 1.0 && (
            <span className="ml-1 text-red-500 dark:text-red-400">確定急所</span>
          )}
          {!isAlwaysCrit && critRate >= 0.5 && critRate < 1.0 && (
            <span className="ml-1 text-orange-500 dark:text-orange-400">急所1/2</span>
          )}
          {!isAlwaysCrit && critRate >= 0.12 && critRate < 0.5 && (
            <span className="ml-1 text-yellow-600 dark:text-yellow-500">急所1/8</span>
          )}
        </span>
        <span className="text-slate-400 dark:text-slate-600">
          残HP {Math.max(0, defenderMaxHp - displayMax)}〜{Math.max(0, defenderMaxHp - displayMin)}/{defenderMaxHp}
        </span>
      </div>

      {/* 耐久調整パネル */}
      {durabilityExpanded && (
        <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
          <DurabilityPanel moveName={moveName} />
        </div>
      )}

      {/* 変動連続技 KO確率パネル */}
      {multiHitExpanded && multiHit?.type === 'variable' && (
        <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
          <VariableMultiHitPanel rolls={rolls} rawRolls={rawRolls} defenderHp={defenderMaxHp} hitRate={hitRate} dist={variableMultiHitDist} />
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

          {/* 段階威力型: 各発の内訳 */}
          {multiHit?.type === 'escalating' && perHitResults && perHitResults.map((hr, idx) => (
            <div key={idx}>
              <div className="text-xs text-slate-500 dark:text-slate-500 mb-0.5">
                {idx + 1}発目（威力{(multiHit as { type: 'escalating'; powers: number[] }).powers[idx]}）
              </div>
              <div className="flex flex-wrap gap-x-1 gap-y-0.5">
                {Array.from(hr.rolls).map((r, i) => (
                  <span key={i} className={`text-xs font-mono ${rollKoClass(r, defenderMaxHp)}`}>{r}</span>
                ))}
              </div>
            </div>
          ))}

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
                <ParentalBondTable rolls={rolls} childRolls={childRollsArr} defenderHp={defenderMaxHp} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

