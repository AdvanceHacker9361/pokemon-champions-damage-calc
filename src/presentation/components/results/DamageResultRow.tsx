import { useState } from 'react'
import type { DamageResult } from '@/domain/models/DamageResult'
import type { KoResult } from '@/domain/models/DamageResult'
import { DamageBar } from './DamageBar'
import {
  calcKoProbability,
  getVariableMultiHitDist,
} from '@/domain/calculators/KoProbabilityCalc'
import { calcCritChance } from '@/domain/calculators/CritRank'
import { calcChildRolls, computeEffectiveRolls } from '@/domain/calculators/RollAggregation'
import { useProgressionStore } from '@/presentation/store/progressionStore'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { useFieldStore } from '@/presentation/store/fieldStore'
import { MoveRepository } from '@/data/repositories/MoveRepository'
import { resolveWeatherAwareMovePower, resolveWeatherAwareMoveType } from '@/domain/calculators/MoveResolution'
import type { MultiHitData } from '@/domain/models/Move'
import { TypeBadge } from '@/presentation/components/shared/Badge'
import type { TypeName } from '@/domain/models/Pokemon'
import { ParentalBondTable } from './ParentalBondTable'
import { VariableMultiHitPanel } from './VariableMultiHitPanel'
import { SelfStatChangeButton } from './SelfStatChangeButton'
import { buildAttackPayload } from './buildAttackPayload'

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

/** 1ロール値をKO判定色でクラス取得 */
function rollKoClass(roll: number, hp: number): string {
  if (roll >= hp) return 'text-danger-1 font-bold'
  if (roll * 2 >= hp) return 'text-danger-2'
  if (roll * 3 >= hp) return 'text-danger-3'
  return 'text-fg-subtle'
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
    const payload = buildAttackPayload({
      attackerName, moveName, isCritical, isParentalBond, isDisguiseIntact, isForcedCrit,
      hadMultiscale, multiHit, moveCritChance, variableMultiHitDist,
      rolls, rawRolls, effectiveRolls, critRollsBase, rawCritRollsBase, effectiveCritRolls,
      activeRawResult, rawCritResult: props.rawCritResult, defenderMaxHp,
    })
    addEntry(payload)
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
        {moveRecord?.selfStatDrop && (
          <SelfStatChangeButton
            key={moveRecord.selfStatDrop.stat}
            stat={moveRecord.selfStatDrop.stat}
            stages={moveRecord.selfStatDrop.stages}
            attackerAbility={attackerAbility}
            attackerRanks={attackerRanks}
            setAttackerRank={setAttackerRank}
          />
        )}
        {/* 使用後の自ステータス変化ボタン（アーマーキャノン等: 複数） */}
        {moveRecord?.selfStatDrops?.map(({ stat, stages }) => (
          <SelfStatChangeButton
            key={stat}
            stat={stat}
            stages={stages}
            attackerAbility={attackerAbility}
            attackerRanks={attackerRanks}
            setAttackerRank={setAttackerRank}
          />
        ))}
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
