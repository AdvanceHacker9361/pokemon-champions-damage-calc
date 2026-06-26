import { useState } from 'react'
import type { DamageResult } from '@/domain/models/DamageResult'
import type { KoResult } from '@/domain/models/DamageResult'
import { DamageBar } from './DamageBar'
import {
  calcVariableMultiHitKo,
  calcVariableMultiHitKoWithCrit,
  calcKoProbability,
  getVariableMultiHitDist,
} from '@/domain/calculators/KoProbabilityCalc'
import { calcCritChance } from '@/domain/calculators/CritRank'
import { useProgressionStore } from '@/presentation/store/progressionStore'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { useFieldStore } from '@/presentation/store/fieldStore'
import { MoveRepository } from '@/data/repositories/MoveRepository'
import { resolveWeatherAwareMovePower, resolveWeatherAwareMoveType } from '@/domain/calculators/MoveResolution'
import type { MultiHitData } from '@/domain/models/Move'
import { TypeBadge } from '@/presentation/components/shared/Badge'
import type { TypeName } from '@/domain/models/Pokemon'

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
  /** くだけるよろい発動時の固定多段技の各発個別結果 */
  weakArmorPerHitResults?: DamageResult[]
  weakArmorCritPerHitResults?: DamageResult[]
  /** くだけるよろい + 変動連続技用: B-2,-3,-4 の追加素ダメ（3〜5発目用）*/
  weakArmorVariableRawResults?: DamageResult[]
  weakArmorVariableRawCritResults?: DamageResult[]
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
    if (koResult.hits === 1) return 'text-danger-1'
    if (koResult.hits === 2) return 'text-danger-2'
    if (koResult.hits === 3) return 'text-danger-3'
    return 'text-danger-4'
  }
  if (koResult.type === 'chance') return 'text-danger-4'
  return 'text-neutral'
}

function multiHitKoColor(prob: number): string {
  if (prob >= 1.0) return 'text-danger-1'
  if (prob >= 0.75) return 'text-danger-2'
  if (prob >= 0.5) return 'text-danger-3'
  if (prob > 0) return 'text-danger-4'
  return 'text-neutral'
}

/** StatKey → 日本語ランク表記 (A/B/C/D/S) */
const STAT_LETTER: Record<string, string> = {
  hp: 'HP', atk: 'A', def: 'B', spa: 'C', spd: 'D', spe: 'S',
}

/** 1ロール値をKO判定色でクラス取得 */
function rollKoClass(roll: number, hp: number): string {
  if (roll >= hp) return 'text-danger-1 font-bold'
  if (roll * 2 >= hp) return 'text-danger-2'
  if (roll * 3 >= hp) return 'text-danger-3'
  return 'text-fg-subtle'
}

/** おやこあい: 子の一撃ロールを計算 (各ロールの25%) */
function calcChildRolls(parentRolls: number[]): number[] {
  return parentRolls.map(r => Math.floor(r * 0.25))
}

/** おやこあい 16×16 テーブル */
function ParentalBondTable({ rolls, childRolls, defenderHp }: { rolls: number[]; childRolls: number[]; defenderHp: number }) {

  return (
    <div className="mt-1 overflow-x-auto">
      <div className="text-xs text-fg-muted mb-1">
        おやこあい合計 (親 + 子×25%) —{' '}
        <span className="text-danger-1">赤=確定KO</span>
        <span className="text-danger-3 ml-2">橙=乱数2発</span>
      </div>
      <table className="text-xs font-mono border-collapse">
        <thead>
          <tr>
            <th className="text-fg-subtle pr-1 text-right">親↓子→</th>
            {childRolls.map((c, j) => (
              <th key={j} className="text-fg-subtle w-7 text-center px-0.5">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rolls.map((r, i) => (
            <tr key={i}>
              <td className="text-fg-muted pr-1 text-right">{r}</td>
              {childRolls.map((c, j) => {
                const total = r + c
                const isKo = total >= defenderHp
                return (
                  <td
                    key={j}
                    className={`text-center px-0.5 ${isKo ? 'text-danger-1 font-bold' : 'text-fg-subtle'}`}
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

  if (koCount === 0) return <div className="text-xs text-fg-subtle mt-1">KO不可</div>
  if (koCount === total) return <div className="text-xs text-danger-1 mt-1">確定KO (親子愛1発)</div>
  return (
    <div className="text-xs text-danger-4 mt-1">
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
  weakArmorPerHitResults?: DamageResult[]
}): number[] {
  const { rolls, rawRolls, multiHit, isParentalBond, isDisguiseIntact, perHitResults, weakArmorPerHitResults } = params
  const childRollsArr = calcChildRolls(rawRolls)
  const combinedRolls = rolls.map((r, i) => r + childRollsArr[i])

  if (isDisguiseIntact) {
    if (isParentalBond) return childRollsArr
    if (multiHit?.type === 'escalating' && perHitResults && perHitResults.length > 1) {
      return perHitResults.slice(1).reduce(
        (acc, r) => acc.map((v, i) => v + r.rolls[i]),
        Array(16).fill(0) as number[],
      )
    }
    if (multiHit?.type === 'fixed' && multiHit.count > 1) {
      const remaining = multiHit.count - 1
      return rolls.map(r => r * remaining)
    }
    return rolls.map(() => 0)
  }
  if (isParentalBond) return combinedRolls
  // くだけるよろい: 固定多段技の各発でBランク低下を反映した個別結果を合算
  if (weakArmorPerHitResults && multiHit?.type === 'fixed') {
    return weakArmorPerHitResults[0].rolls.map((_, i) =>
      weakArmorPerHitResults.reduce((sum, r) => sum + r.rolls[i], 0)
    )
  }
  if (multiHit?.type === 'fixed' && multiHit.count > 1) {
    const count = multiHit.count
    return rolls.map((r, i) => r + rawRolls[i] * (count - 1))
  }
  return rolls
}

/** 変動連続技の確率計算パネル */
function VariableMultiHitPanel({
  rolls, rawRolls, defenderHp, hitRate, dist, weakArmorRawRollsByHit,
  critRolls, rawCritRolls, weakArmorRawCritRollsByHit, critChance,
}: {
  rolls: number[]
  rawRolls: number[]
  defenderHp: number
  hitRate: number
  dist: { hits: number; prob: number }[]
  weakArmorRawRollsByHit?: number[][]
  critRolls: number[]
  rawCritRolls: number[]
  weakArmorRawCritRollsByHit?: number[][]
  critChance: number
}) {
  let effectiveRawRolls: number[] | number[][] | undefined
  if (weakArmorRawRollsByHit && weakArmorRawRollsByHit.length > 0) {
    effectiveRawRolls = [rawRolls, ...weakArmorRawRollsByHit]
  } else if (rawRolls !== rolls) {
    effectiveRawRolls = rawRolls
  }
  const res = calcVariableMultiHitKo(rolls, defenderHp, dist, effectiveRawRolls)
  const expectedWithAcc = res.expectedDmg * hitRate

  let effectiveRawCritRolls: number[] | number[][] | undefined
  if (weakArmorRawCritRollsByHit && weakArmorRawCritRollsByHit.length > 0) {
    effectiveRawCritRolls = [rawCritRolls, ...weakArmorRawCritRollsByHit]
  } else if (rawCritRolls !== critRolls) {
    effectiveRawCritRolls = rawCritRolls
  }
  const resCrit = calcVariableMultiHitKoWithCrit(
    rolls, critRolls, critChance, defenderHp, dist,
    effectiveRawRolls, effectiveRawCritRolls,
  )
  const expectedDmgCrit = resCrit.expectedDmg * hitRate
  const koCritWithAcc = resCrit.totalKoProb * hitRate

  const gridCols = dist.length === 1 ? 'grid-cols-1'
    : dist.length === 2 ? 'grid-cols-2'
    : 'grid-cols-4'

  function getRollsForHit(hitNum: number): number[] {
    if (hitNum === 1) return rolls
    if (weakArmorRawRollsByHit && weakArmorRawRollsByHit.length > 0) {
      if (hitNum === 2) return rawRolls
      const idx = Math.min(hitNum - 3, weakArmorRawRollsByHit.length - 1)
      return weakArmorRawRollsByHit[idx]
    }
    return rawRolls
  }
  function sumOverHits(numHits: number, picker: (rolls: number[]) => number): number {
    let total = 0
    for (let h = 1; h <= numHits; h++) total += picker(getRollsForHit(h))
    return total
  }

  return (
    <div className="space-y-1.5">
      <div className="text-xs text-fg-muted font-medium">
        連続技 KO確率
      </div>
      <div className={`grid ${gridCols} gap-x-2 text-xs font-mono`}>
        {res.perHit.map(({ hits, prob, koProbForHits }) => {
          const hitMin = sumOverHits(hits, r => r[0])
          const hitMax = sumOverHits(hits, r => r[r.length - 1])
          const hitMinPct = hitMin / defenderHp * 100
          const hitMaxPct = hitMax / defenderHp * 100
          const distPct = (prob * 100).toFixed(0)
          const koPct = koProbForHits >= 1 ? '確定' : koProbForHits <= 0 ? '不可' : `${(koProbForHits * 100).toFixed(1)}%`
          return (
            <div key={hits} className="bg-surface-2 rounded px-1.5 py-1">
              <div className="text-fg-subtle text-[10px]">{hits}回 ({distPct}%)</div>
              <div className="text-fg">{hitMin}〜{hitMax}</div>
              <div className="text-fg-subtle text-[10px]">
                {hitMinPct.toFixed(1)}〜{hitMaxPct.toFixed(1)}%
              </div>
              <div className={`font-bold text-[10px] mt-0.5 ${multiHitKoColor(koProbForHits)}`}>
                {koPct}
              </div>
            </div>
          )
        })}
      </div>
      <div className="bg-surface-2 rounded px-2 py-1.5 flex items-center justify-between">
        <div className="text-xs text-fg-muted">
          期待KO確率（加重平均）
          <span className="ml-2 text-fg-subtle text-[10px]">
            期待ダメ: {expectedWithAcc.toFixed(1)}
            {hitRate < 1 && <span className="ml-1 text-fg-faint">({Math.round(hitRate * 100)}%命中込)</span>}
          </span>
        </div>
        <span className={`text-sm font-bold ${multiHitKoColor(res.totalKoProb * hitRate)}`}>
          {res.totalKoProb * hitRate >= 1 ? '確定KO'
            : res.totalKoProb * hitRate <= 0 ? '倒せない'
            : `${(res.totalKoProb * hitRate * 100).toFixed(1)}%`}
        </span>
      </div>
      {critChance > 0 && critChance < 1 && (
        <div className="bg-surface-2 border border-edge rounded px-2 py-1.5 flex items-center justify-between">
          <div className="text-xs text-warning">
            期待KO確率（急所込み）
            <span className="ml-2 text-fg-subtle text-[10px]">
              急所率: {(critChance * 100).toFixed(1)}%
              <span className="ml-1">期待ダメ: {expectedDmgCrit.toFixed(1)}</span>
              {hitRate < 1 && <span className="ml-1 text-fg-faint">({Math.round(hitRate * 100)}%命中込)</span>}
            </span>
          </div>
          <span className={`text-sm font-bold ${multiHitKoColor(koCritWithAcc)}`}>
            {koCritWithAcc >= 1 ? '確定KO'
              : koCritWithAcc <= 0 ? '倒せない'
              : `${(koCritWithAcc * 100).toFixed(1)}%`}
          </span>
        </div>
      )}
    </div>
  )
}

export function DamageResultRow(props: DamageResultRowProps) {
  const {
    moveName, result, critResult,
    weakArmorPerHitResults: weakArmorPerHitResultsNormal, weakArmorCritPerHitResults,
    weakArmorVariableRawResults, weakArmorVariableRawCritResults,
  } = props
  const { min, max, defenderMaxHp } = result
  const [rollsExpanded, setRollsExpanded] = useState(false)
  const [multiHitExpanded, setMultiHitExpanded] = useState(false)
  const [pbExpanded, setPbExpanded] = useState(false)
  const [added, setAdded] = useState(false)
  const [isCritical, setIsCritical] = useState(false)

  const addEntry = useProgressionStore(s => s.addAttack)
  const attackerName = useAttackerStore(s => s.pokemonName)
  const attackerAbility = useAttackerStore(s => s.effectiveAbility)
  const attackerItem = useAttackerStore(s => s.itemName)
  const focusEnergyActive = useAttackerStore(s => s.focusEnergyActive)
  const attackerRanks = useAttackerStore(s => s.ranks)
  const setAttackerRank = useAttackerStore(s => s.setRank)
  const defenderAbility = useDefenderStore(s => s.effectiveAbility)
  const defenderAbilityActivated = useDefenderStore(s => s.abilityActivated)
  const weather = useFieldStore(s => s.weather)
  const isGravity = useFieldStore(s => s.isGravity)

  const isParentalBond = attackerAbility === 'おやこあい'
  const isDisguiseIntact = defenderAbility === 'ばけのかわ' && defenderAbilityActivated

  const moveRecord = MoveRepository.findByName(moveName)
  const displayMoveType = moveRecord
    ? resolveWeatherAwareMoveType({
        moveType: moveRecord.type as TypeName,
        moveSpecial: moveRecord.special,
        weather,
        attackerAbility,
        defenderAbility,
      })
    : null
  const displayMovePower = moveRecord
    ? resolveWeatherAwareMovePower({
        movePower: moveRecord.power,
        moveSpecial: moveRecord.special,
        weather,
        attackerAbility,
        defenderAbility,
      })
    : null
  const multiHit: MultiHitData | null | undefined = moveRecord?.multiHit
  const variableMultiHitDist = getVariableMultiHitDist(attackerAbility, attackerItem)
  const perHitResults = isCritical ? props.critPerHitResults : props.perHitResults
  const weakArmorPerHitResults = isCritical ? weakArmorCritPerHitResults : weakArmorPerHitResultsNormal
  const weakArmorVariableRawActive = isCritical ? weakArmorVariableRawCritResults : weakArmorVariableRawResults
  const weakArmorVariableRawRollsByHit: number[][] | undefined = weakArmorVariableRawActive
    ? weakArmorVariableRawActive.map(r => Array.from(r.rolls))
    : undefined
  const weakArmorVariableRawCritRollsByHit: number[][] | undefined = weakArmorVariableRawCritResults
    ? weakArmorVariableRawCritResults.map(r => Array.from(r.rolls))
    : undefined

  const activeResult = isCritical ? critResult : result
  const rolls = Array.from(activeResult.rolls)

  const HP_FULL_ABILITIES = new Set(['マルチスケイル', 'ファントムガード'])
  const activeRawResult = isCritical ? props.rawCritResult : props.rawResult
  const rawRolls = activeRawResult
    ? Array.from(activeRawResult.rolls)
    : rolls
  const hadHpFullAbility = HP_FULL_ABILITIES.has(defenderAbility) && defenderAbilityActivated
  const hadMultiscale = hadHpFullAbility || !!props.rawResult

  const isForcedCrit = (moveRecord?.alwaysCrit === true) || isCritical
  const moveCritChance = calcCritChance({
    moveCritBonus: moveRecord?.critChance ?? 0,
    attackerAbility,
    attackerItem,
    focusEnergyActive,
  })

  const childRollsArr = calcChildRolls(rawRolls)

  const disguiseFlatDmg = isDisguiseIntact ? Math.floor(defenderMaxHp / 8) : 0
  let disguiseLabel = ''
  if (isDisguiseIntact) {
    if (isParentalBond) disguiseLabel = 'ばけのかわ発動（親を無効 → 子ダメのみ）'
    else if (multiHit?.type === 'escalating' && perHitResults && perHitResults.length > 1)
      disguiseLabel = `ばけのかわ発動（1発目無効 → 残${perHitResults.length - 1}発）`
    else if (multiHit?.type === 'fixed' && multiHit.count > 1)
      disguiseLabel = `ばけのかわ発動（1発目無効 → 残${multiHit.count - 1}発）`
    else disguiseLabel = 'ばけのかわ発動（全弾無効）'
  }

  const effectiveRolls = computeEffectiveRolls({
    rolls, rawRolls, multiHit, isParentalBond, isDisguiseIntact, perHitResults, weakArmorPerHitResults,
  })

  const critRollsBase = Array.from(critResult.rolls)
  const rawCritRollsBase = props.rawCritResult
    ? Array.from(props.rawCritResult.rolls)
    : critRollsBase
  const critPerHitResults = props.critPerHitResults
  const effectiveCritRolls = computeEffectiveRolls({
    rolls: critRollsBase, rawRolls: rawCritRollsBase, multiHit, isParentalBond, isDisguiseIntact,
    perHitResults: critPerHitResults, weakArmorPerHitResults: weakArmorCritPerHitResults,
  })

  const displayMin = effectiveRolls[0]
  const displayMax = effectiveRolls[effectiveRolls.length - 1]
  const displayPercentMin = displayMin / defenderMaxHp * 100
  const displayPercentMax = displayMax / defenderMaxHp * 100

  // じゅうりょく: 命中率5/3倍（最大100%）。必中技（accuracy=null）は影響なし
  const accuracyMult = isGravity ? 5 / 3 : 1
  const hitRate = moveRecord?.accuracy != null
    ? Math.min(1, moveRecord.accuracy / 100 * accuracyMult)
    : 1.0
  const isAlwaysCrit = moveRecord?.alwaysCrit === true
  const critRate = isAlwaysCrit ? 1.0 : moveCritChance
  const avgNormal = (displayMin + displayMax) / 2
  const baseRollSum = result.max + result.min
  const critRollSum = critResult.max + critResult.min
  const critScaleFactor = baseRollSum > 0 ? critRollSum / baseRollSum : 1.5
  const avgCrit = avgNormal * critScaleFactor
  const expectedDmg = hitRate * (critRate * avgCrit + (1 - critRate) * avgNormal)

  const effectiveHpForKo = Math.max(1, defenderMaxHp - disguiseFlatDmg)
  let displayKoResult: KoResult
  if (isParentalBond || isDisguiseIntact) {
    if (displayMin === 0 && displayMax === 0) {
      displayKoResult = disguiseFlatDmg >= defenderMaxHp
        ? { type: 'guaranteed', hits: 1 }
        : { type: 'no-ko' }
    } else {
      displayKoResult = calcKoProbability(effectiveRolls, effectiveHpForKo)
    }
  } else if (weakArmorPerHitResults && multiHit?.type === 'fixed') {
    displayKoResult = calcKoProbability(effectiveRolls, effectiveHpForKo)
  } else {
    displayKoResult = activeResult.koResult
  }

  if (min === 0 && max === 0) {
    return (
      <div>
        <div className="text-sm text-fg font-medium">{moveName}</div>
        <div className="text-xs text-fg-subtle mt-1">効果がない</div>
      </div>
    )
  }

  function handleAddToAccum() {
    const critLabel = isCritical ? '(急所)' : ''

    const isFixedMultiHit = multiHit?.type === 'fixed' && multiHit.count > 1 && !isDisguiseIntact
    const fixedHitCount = isFixedMultiHit ? (multiHit as { type: 'fixed'; count: number }).count : 1
    const isVariableMultiHit = multiHit?.type === 'variable' && !isDisguiseIntact

    // 変動連続技は 1発分のロールを保存し、useAccumulatedDamage 側で 1使用分の
    // ダメージ分布（ヒット数加重）を組み立てて DP スロットへ流し込む
    const accumRolls = isVariableMultiHit ? rolls
      : isFixedMultiHit ? rolls
      : effectiveRolls

    const useHadMultiscale = isVariableMultiHit ? (activeRawResult != null)
      : isFixedMultiHit ? (activeRawResult != null)
      : hadMultiscale
    const accumRawRolls = isVariableMultiHit
      ? (activeRawResult ? Array.from(activeRawResult.rolls) : rolls)
      : isFixedMultiHit
        ? (activeRawResult ? Array.from(activeRawResult.rolls) : accumRolls)
        : (hadMultiscale
            ? (activeRawResult ? Array.from(activeRawResult.rolls) : effectiveRolls.map(r => r * 2))
            : effectiveRolls)

    // 変動連続技: 単一使用の最小〜最大ダメ（ヒット数分布の両端で算出）
    const variableMinHits = isVariableMultiHit ? variableMultiHitDist[0].hits : 1
    const variableMaxHits = isVariableMultiHit
      ? variableMultiHitDist[variableMultiHitDist.length - 1].hits
      : 1
    const accumMin = isVariableMultiHit
      ? accumRolls[0] + accumRawRolls[0] * (variableMinHits - 1)
      : accumRolls[0]
    const accumMax = isVariableMultiHit
      ? accumRolls[accumRolls.length - 1] + accumRawRolls[accumRawRolls.length - 1] * (variableMaxHits - 1)
      : accumRolls[accumRolls.length - 1]
    const accumRawMin = isVariableMultiHit
      ? accumRawRolls[0] * variableMinHits
      : accumRawRolls[0]
    const accumRawMax = isVariableMultiHit
      ? accumRawRolls[accumRawRolls.length - 1] * variableMaxHits
      : accumRawRolls[accumRawRolls.length - 1]

    const accumCritRolls = isForcedCrit ? accumRolls
      : isVariableMultiHit ? critRollsBase
      : isFixedMultiHit ? critRollsBase
      : effectiveCritRolls
    const accumRawCritRolls = isForcedCrit ? accumRawRolls
      : isVariableMultiHit
        ? (props.rawCritResult ? Array.from(props.rawCritResult.rolls) : critRollsBase)
        : isFixedMultiHit
          ? (props.rawCritResult ? Array.from(props.rawCritResult.rolls) : critRollsBase)
          : effectiveCritRolls
    const thisCritChance = isForcedCrit ? 1.0 : moveCritChance

    let pbParentRolls: number[] | undefined
    let pbParentCritRolls: number[] | undefined
    let pbParentRawRolls: number[] | undefined
    let pbParentRawCritRolls: number[] | undefined
    let pbChildRolls: number[] | undefined
    let pbChildCritRolls: number[] | undefined
    if (isParentalBond && !isDisguiseIntact) {
      pbParentRolls = rolls
      pbParentCritRolls = critRollsBase
      pbParentRawRolls = rawRolls
      pbParentRawCritRolls = rawCritRollsBase
      pbChildRolls = childRollsArr
      pbChildCritRolls = calcChildRolls(rawCritRollsBase)
    }

    const defaultUsages = isFixedMultiHit ? fixedHitCount : 1

    const variableLabelTag = isVariableMultiHit
      ? (variableMinHits === variableMaxHits ? `(${variableMaxHits}発)` : `(${variableMinHits}〜${variableMaxHits}発加重)`)
      : ''

    addEntry({
      label: `${attackerName} の ${moveName}${critLabel}${variableLabelTag}${isParentalBond ? '(おやこあい)' : ''}${isDisguiseIntact ? '+ばけのかわ' : ''}`,
      moveName,
      rolls: accumRolls,
      rawRolls: accumRawRolls,
      usages: defaultUsages,
      minDmg: accumMin,
      maxDmg: accumMax,
      rawMin: accumRawMin,
      rawMax: accumRawMax,
      defenderMaxHp,
      hadMultiscale: useHadMultiscale,
      critRolls: accumCritRolls,
      rawCritRolls: accumRawCritRolls,
      critMin: isVariableMultiHit
        ? accumCritRolls[0] + accumRawCritRolls[0] * (variableMinHits - 1)
        : accumCritRolls[0],
      critMax: isVariableMultiHit
        ? accumCritRolls[accumCritRolls.length - 1] + accumRawCritRolls[accumRawCritRolls.length - 1] * (variableMaxHits - 1)
        : accumCritRolls[accumCritRolls.length - 1],
      rawCritMin: isVariableMultiHit
        ? accumRawCritRolls[0] * variableMinHits
        : accumRawCritRolls[0],
      rawCritMax: isVariableMultiHit
        ? accumRawCritRolls[accumRawCritRolls.length - 1] * variableMaxHits
        : accumRawCritRolls[accumRawCritRolls.length - 1],
      critChance: thisCritChance,
      isForcedCrit,
      pbParentRolls,
      pbParentCritRolls,
      pbParentRawRolls,
      pbParentRawCritRolls,
      pbChildRolls,
      pbChildCritRolls,
      variableHitDist: isVariableMultiHit ? variableMultiHitDist : undefined,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 1200)
  }

  return (
    <div>
      {/* ヘッダー: 技名バッジ + KOラベル */}
      <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1 mb-1">
        <div className="min-w-0 flex flex-1 flex-wrap items-center gap-1.5">
          <span className="block min-w-0 max-w-full text-sm font-medium text-fg truncate">{moveName}</span>
          {displayMoveType && <TypeBadge type={displayMoveType} size="sm" />}
          {moveRecord?.special === 'weather-ball' && displayMovePower != null && (
            <span className="text-[10px] px-1 py-0 rounded bg-surface-3 text-fg-muted font-mono">
              威力{displayMovePower}
            </span>
          )}
          {multiHit && (
            <span className="text-[10px] px-1 py-0 rounded bg-surface-3 text-fg-muted font-medium">
              {multiHit.type === 'fixed' ? `固定${multiHit.count}回`
                : multiHit.type === 'escalating' ? multiHit.powers.join('→')
                : attackerAbility === 'スキルリンク' ? '確定5回'
                : attackerItem === 'いかさまダイス' ? '4〜5回'
                : '2〜5回'}
            </span>
          )}
          {isParentalBond && (
            <span className="text-[10px] px-1 py-0 rounded bg-surface-3 text-fg-muted font-medium">
              おやこあい
            </span>
          )}
        </div>
        <span className={`shrink-0 text-xs font-bold text-right ${koLabelColor(displayKoResult)}`}>
          {koLabel(displayKoResult)}
        </span>
      </div>

      {/* 主操作 */}
      <div className="mb-1.5 flex min-w-0 flex-wrap items-center gap-1.5 rounded border border-edge bg-surface-2 px-2 py-1.5">
        <span className="shrink-0 text-[10px] font-semibold text-fg-subtle">主操作</span>
        {isAlwaysCrit ? (
          <span className="min-w-0 rounded border border-warning bg-surface-3 px-2.5 py-1 text-xs font-semibold text-warning">
            確定急所
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setIsCritical(v => !v)}
            aria-pressed={isCritical}
            className={`min-w-0 text-xs px-2.5 py-1 rounded border transition-colors ${
              isCritical
                ? 'bg-surface-3 border-warning text-warning font-semibold'
                : 'border-edge text-fg-muted hover:border-warning hover:text-warning'
            }`}
            title="急所ダメージに切り替え"
          >
            急所
          </button>
        )}
        <button
          type="button"
          onClick={handleAddToAccum}
          aria-label={`${moveName}をダメージ進行へ追加`}
          className={`min-w-0 text-xs px-2.5 py-1 rounded border transition-colors ${
            added
              ? 'bg-accent-bg border-accent-border text-accent font-medium'
              : 'bg-surface-3 border-accent-border text-accent hover:bg-accent-bg'
          }`}
          title="時系列に追加"
        >
          {added ? '✓ 時系列へ' : '+ 加算'}
        </button>
        <span
          role="status"
          aria-hidden={!added}
          className={`min-w-[4.75rem] text-[10px] transition-opacity ${
            added ? 'text-accent opacity-100' : 'text-fg-faint invisible opacity-0'
          }`}
        >
          末尾に追加
        </span>
        {/* 使用後の自ステータス変化ボタン（りゅうせいぐん・フレアソング等: 単一） */}
        {moveRecord?.selfStatDrop && (() => {
          const { stat, stages } = moveRecord.selfStatDrop
          const effectiveStages = attackerAbility === 'あまのじゃく' ? -stages : stages
          const letter = STAT_LETTER[stat] ?? stat
          const isBoost = effectiveStages > 0
          const sign = isBoost ? '+' : '−'
          const abs = Math.abs(effectiveStages)
          const arrow = isBoost ? '↑' : '↓'
          const currentRank = attackerRanks[stat as keyof typeof attackerRanks] ?? 0
          const targetRank = currentRank + effectiveStages
          const clamped = Math.max(-6, Math.min(6, targetRank))
          const willApply = clamped !== currentRank
          const contraryNote = attackerAbility === 'あまのじゃく' ? '（あまのじゃくで反転）' : ''
          return (
            <button
              key={stat}
              type="button"
              onClick={() => setAttackerRank(stat as keyof typeof attackerRanks, clamped)}
              disabled={!willApply}
              className={`min-w-0 text-xs px-2 py-1 rounded border transition-colors ${
                willApply
                  ? isBoost
                    ? 'border-accent-border text-accent hover:bg-accent-bg'
                    : 'border-danger-2 text-danger-2 hover:bg-surface-3'
                  : 'border-edge text-fg-faint cursor-not-allowed'
              }`}
              title={`攻撃側の${letter}ランクを${abs}段階${isBoost ? '上げる' : '下げる'}${contraryNote}（現在: ${currentRank} → ${clamped}）`}
            >
              {arrow}{letter}{sign}{abs}
            </button>
          )
        })()}
        {/* 使用後の自ステータス変化ボタン（アーマーキャノン等: 複数） */}
        {moveRecord?.selfStatDrops?.map(({ stat, stages }) => {
          const effectiveStages = attackerAbility === 'あまのじゃく' ? -stages : stages
          const letter = STAT_LETTER[stat] ?? stat
          const isBoost = effectiveStages > 0
          const sign = isBoost ? '+' : '−'
          const abs = Math.abs(effectiveStages)
          const arrow = isBoost ? '↑' : '↓'
          const currentRank = attackerRanks[stat as keyof typeof attackerRanks] ?? 0
          const targetRank = currentRank + effectiveStages
          const clamped = Math.max(-6, Math.min(6, targetRank))
          const willApply = clamped !== currentRank
          const contraryNote = attackerAbility === 'あまのじゃく' ? '（あまのじゃくで反転）' : ''
          return (
            <button
              key={stat}
              type="button"
              onClick={() => setAttackerRank(stat as keyof typeof attackerRanks, clamped)}
              disabled={!willApply}
              className={`min-w-0 text-xs px-2 py-1 rounded border transition-colors ${
                willApply
                  ? isBoost
                    ? 'border-accent-border text-accent hover:bg-accent-bg'
                    : 'border-danger-2 text-danger-2 hover:bg-surface-3'
                  : 'border-edge text-fg-faint cursor-not-allowed'
              }`}
              title={`攻撃側の${letter}ランクを${abs}段階${isBoost ? '上げる' : '下げる'}${contraryNote}（現在: ${currentRank} → ${clamped}）`}
            >
              {arrow}{letter}{sign}{abs}
            </button>
          )
        })}
      </div>

      {/* ばけのかわ発動ライン */}
      {isDisguiseIntact && (
        <div className="text-[10px] text-fg-muted mb-1 flex items-center gap-2">
          <span>{disguiseLabel}</span>
          <span className="font-mono">
            +固定{disguiseFlatDmg}
            <span className="text-fg-subtle ml-0.5">
              ({(disguiseFlatDmg / defenderMaxHp * 100).toFixed(1)}%)
            </span>
          </span>
        </div>
      )}

      {/* おやこあい内訳ライン（ばけのかわなし時のみ） */}
      {isParentalBond && !isDisguiseIntact && (
        <div className="text-[10px] text-fg-muted mb-1 font-mono">
          親: {rolls[0]}〜{rolls[rolls.length - 1]}
          <span className="mx-1 text-fg-subtle">+</span>
          子: {childRollsArr[0]}〜{childRollsArr[childRollsArr.length - 1]}
          <span className="ml-1 text-fg-subtle">= 合算</span>
        </div>
      )}

      {/* ダメージ範囲 + 詳細分析 */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 mb-1.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-mono text-fg">{displayMin}〜{displayMax}</span>
          <span className="text-xs text-fg-muted font-mono">
            ({displayPercentMin.toFixed(1)}%〜{displayPercentMax.toFixed(1)}%)
          </span>
          <span className="text-xs text-fg-subtle">/{defenderMaxHp}</span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1 rounded border border-edge bg-surface-2 px-1.5 py-0.5 sm:ml-auto">
          <span className="text-[10px] font-medium text-fg-faint">詳細</span>
          {multiHit?.type === 'variable' && (
            <button
              type="button"
              onClick={() => setMultiHitExpanded(v => !v)}
              aria-pressed={multiHitExpanded}
              className="rounded px-1.5 py-0.5 text-[11px] text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg"
              title="連続技 KO確率"
            >
              {multiHitExpanded ? '▲' : '▼'}連続技
            </button>
          )}
          <button
            type="button"
            onClick={() => setRollsExpanded(v => !v)}
            aria-pressed={rollsExpanded}
            className="rounded px-1.5 py-0.5 text-[11px] text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg"
            title="16乱数を表示"
          >
            {rollsExpanded ? '▲' : '▼'}乱数
          </button>
        </div>
      </div>

      <DamageBar percentMin={displayPercentMin} percentMax={displayPercentMax} koResult={displayKoResult} />
      <div className="flex items-center justify-between text-[10px] font-mono mt-0.5">
        <span className="text-fg-subtle">
          期待:
          <span className="ml-0.5 font-semibold text-fg-muted">{expectedDmg.toFixed(1)}</span>
          {hitRate < 1 && (
            <span className="ml-1 text-fg-faint">
              {Math.round(hitRate * 100)}%命中
            </span>
          )}
          {!isAlwaysCrit && critRate >= 1.0 && (
            <span className="ml-1 text-danger-1">確定急所</span>
          )}
          {!isAlwaysCrit && critRate >= 0.5 && critRate < 1.0 && (
            <span className="ml-1 text-danger-2">急所1/2</span>
          )}
          {!isAlwaysCrit && critRate >= 0.12 && critRate < 0.5 && (
            <span className="ml-1 text-danger-3">急所1/8</span>
          )}
        </span>
        <span className="text-fg-faint">
          残HP {Math.max(0, defenderMaxHp - displayMax)}〜{Math.max(0, defenderMaxHp - displayMin)}/{defenderMaxHp}
        </span>
      </div>

      {/* 変動連続技 KO確率パネル */}
      {multiHitExpanded && multiHit?.type === 'variable' && (
        <div className="mt-2 pt-2 border-t border-edge">
          <VariableMultiHitPanel
            rolls={rolls}
            rawRolls={rawRolls}
            defenderHp={defenderMaxHp}
            hitRate={hitRate}
            dist={variableMultiHitDist}
            weakArmorRawRollsByHit={weakArmorVariableRawRollsByHit}
            critRolls={critRollsBase}
            rawCritRolls={rawCritRollsBase}
            weakArmorRawCritRollsByHit={weakArmorVariableRawCritRollsByHit}
            critChance={isForcedCrit ? 1.0 : moveCritChance}
          />
        </div>
      )}

      {/* 乱数展開 */}
      {rollsExpanded && (
        <div className="mt-2 pt-2 border-t border-edge space-y-1.5">
          {/* 実効ロール */}
          <div>
            <div className="text-xs text-fg-muted mb-1">
              {isParentalBond && !isDisguiseIntact ? '合算乱数（親+子）'
                : isDisguiseIntact && isParentalBond ? '子ダメ16乱数'
                : isDisguiseIntact ? '実効ダメ16乱数'
                : '16乱数'}
            </div>
            <div className="grid grid-cols-4 gap-1">
              {effectiveRolls.map((r, i) => (
                <span
                  key={i}
                  className={`text-[12px] font-mono tabular-nums text-center bg-surface-3 rounded px-1 py-0.5 ${rollKoClass(r, effectiveHpForKo)}`}
                >
                  {r}
                </span>
              ))}
            </div>
          </div>

          {/* 段階威力型: 各発の内訳 */}
          {multiHit?.type === 'escalating' && perHitResults && perHitResults.map((hr, idx) => (
            <div key={idx}>
              <div className="text-xs text-fg-subtle mb-1">
                {idx + 1}発目（威力{(multiHit as { type: 'escalating'; powers: number[] }).powers[idx]}）
              </div>
              <div className="grid grid-cols-4 gap-1">
                {Array.from(hr.rolls).map((r, i) => (
                  <span key={i} className={`text-[12px] font-mono tabular-nums text-center bg-surface-3 rounded px-1 py-0.5 ${rollKoClass(r, defenderMaxHp)}`}>{r}</span>
                ))}
              </div>
            </div>
          ))}

          {/* おやこあい時: 親の素ロールを参考表示 */}
          {isParentalBond && (
            <div>
              <div className="text-xs text-fg-subtle mb-1">
                親ロール（参考）
              </div>
              <div className="grid grid-cols-4 gap-1">
                {rolls.map((r, i) => (
                  <span key={i} className="text-[12px] font-mono tabular-nums text-center bg-surface-3 rounded px-1 py-0.5 text-fg-subtle">
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* おやこあい 16×16乱数表（ばけのかわなし時のみ） */}
          {isParentalBond && !isDisguiseIntact && (
            <div>
              <button
                type="button"
                onClick={() => setPbExpanded(v => !v)}
                className="text-xs text-fg-muted hover:text-fg transition-colors"
              >
                {pbExpanded ? '▲' : '▼'} おやこあい 16×16乱数表
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
