import { useState, useEffect, useMemo } from 'react'
import { MoveSelect } from './MoveSelect'
import { useAttackerStore, useDefenderStore, type PokemonStore } from '@/presentation/store/pokemonStore'
import { useFieldStore } from '@/presentation/store/fieldStore'
import type { ComputedStats, StatKey, StatusCondition, TypeName } from '@/domain/models/Pokemon'
import type { MoveRecord } from '@/data/schemas/types'
import { MoveRepository } from '@/data/repositories/MoveRepository'
import { calculateStats } from '@/application/usecases/CalculateStatsUseCase'
import { resolveReversalPower } from '@/domain/calculators/SpecialMoveCalc'
import { resolveBasePower } from '@/domain/calculators/MovePowerResolution'
import { resolveWeatherAwareMoveType } from '@/domain/calculators/MoveResolution'
import { typeColor } from '@/presentation/components/shared/typeColors'
import { MoveMetaChips } from './MoveMetaChips'

interface MoveSlotsProps {
  moves: PokemonStore['moves']
  setMove: PokemonStore['setMove']
  movePowers: PokemonStore['movePowers']
  setMovePower: PokemonStore['setMovePower']
  /**
   * この技リストを「撃つ側」がどちらのストアか。
   * - 'attacker': 攻撃側パネルの技（攻撃側 → 防御側）
   * - 'defender': 防御側パネルの「攻撃側被ダメ用の技」（防御側 → 攻撃側）
   */
  side: 'attacker' | 'defender'
  /** 攻撃側の実数値HP（きしかいせい / じたばた の最大HPとして使用） */
  maxHP?: number
}

/** 威力解決に必要な片側ぶんの文脈 */
interface SideContext {
  stats: ComputedStats
  weight: number
  status: StatusCondition
  ranks: Record<StatKey, number>
  ability: string
}

/** 可変威力技の威力の根拠を1行で説明する（ツールチップ用） */
function describeBasePower(
  move: MoveRecord,
  power: number,
  acting: SideContext,
  target: SideContext,
): string | undefined {
  switch (move.special) {
    case 'low-kick':
    case 'grass-knot':
      return `相手体重 ${target.weight.toFixed(1)}kg → 威力${power}`
    case 'heavy-slam': {
      const ratio = target.weight > 0 ? acting.weight / target.weight : 0
      return `体重比 ${ratio.toFixed(1)}倍 (自分${acting.weight.toFixed(1)}kg / 相手${target.weight.toFixed(1)}kg) → 威力${power}`
    }
    case 'gyro-ball':
      return `S比 相手${target.stats.spe} / 自分${acting.stats.spe} → 威力${power}`
    case 'stored-power': {
      const sum = Object.values(acting.ranks).reduce((s, v) => s + Math.max(0, v), 0)
      return `ランク上昇 合計+${sum} → 威力${power}`
    }
    default:
      return undefined
  }
}

export function MoveSlots({ moves, setMove, movePowers, setMovePower, side, maxHP }: MoveSlotsProps) {
  const weather = useFieldStore(s => s.weather)

  const atkBaseStats = useAttackerStore(s => s.baseStats)
  const atkSp = useAttackerStore(s => s.sp)
  const atkNatures = useAttackerStore(s => s.statNatures)
  const atkRanks = useAttackerStore(s => s.ranks)
  const atkWeight = useAttackerStore(s => s.weight)
  const atkStatus = useAttackerStore(s => s.status)
  const attackerAbility = useAttackerStore(s => s.effectiveAbility)

  const defBaseStats = useDefenderStore(s => s.baseStats)
  const defSp = useDefenderStore(s => s.sp)
  const defNatures = useDefenderStore(s => s.statNatures)
  const defRanks = useDefenderStore(s => s.ranks)
  const defWeight = useDefenderStore(s => s.weight)
  const defStatus = useDefenderStore(s => s.status)
  const defenderAbility = useDefenderStore(s => s.effectiveAbility)

  const attackerCtx = useMemo<SideContext>(() => ({
    stats: calculateStats({
      baseStats: atkBaseStats, sp: atkSp, statNatures: atkNatures, ranks: atkRanks,
    }),
    weight: atkWeight, status: atkStatus, ranks: atkRanks, ability: attackerAbility,
  }), [atkBaseStats, atkSp, atkNatures, atkRanks, atkWeight, atkStatus, attackerAbility])

  const defenderCtx = useMemo<SideContext>(() => ({
    stats: calculateStats({
      baseStats: defBaseStats, sp: defSp, statNatures: defNatures, ranks: defRanks,
    }),
    weight: defWeight, status: defStatus, ranks: defRanks, ability: defenderAbility,
  }), [defBaseStats, defSp, defNatures, defRanks, defWeight, defStatus, defenderAbility])

  // 防御側パネルの「攻撃側被ダメ用の技」では防御側が撃つ側になる（useBattleSequence の incoming と同じ向き）
  const acting = side === 'attacker' ? attackerCtx : defenderCtx
  const target = side === 'attacker' ? defenderCtx : attackerCtx

  // きしかいせい / じたばた 用の HP テキスト入力（スロットごと）
  const [hpInputs, setHpInputs] = useState<[string, string, string, string]>(['', '', '', ''])

  // 技が変わったら HP 入力をリセット
  useEffect(() => {
    setHpInputs(prev => {
      const next = [...prev] as typeof prev
      ;([0, 1, 2, 3] as const).forEach(slot => {
        const move = moves[slot] ? MoveRepository.findByName(moves[slot]!) : null
        if (move?.special !== 'reversal') next[slot] = ''
      })
      return next
    })
  }, [moves[0], moves[1], moves[2], moves[3]]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleHpChange(slot: 0 | 1 | 2 | 3, raw: string) {
    const next = [...hpInputs] as typeof hpInputs
    next[slot] = raw
    setHpInputs(next)

    const val = parseInt(raw, 10)
    const max = maxHP ?? 1
    if (!raw || isNaN(val) || val < 1) {
      setMovePower(slot, null)
      return
    }
    const clamped = Math.min(val, max)
    setMovePower(slot, resolveReversalPower(clamped, max))
  }

  return (
    <div className="space-y-1.5">
      <span className="label">技</span>
      <div className="grid grid-cols-2 gap-1.5">
        {([0, 1, 2, 3] as const).map(slot => {
          const moveName = moves[slot]
          const moveRecord = moveName ? MoveRepository.findByName(moveName) : null
          const isReversal   = moveRecord?.special === 'reversal'
          const hasPowerOpts = (moveRecord?.powerOptions?.length ?? 0) > 0

          // きしかいせい / じたばた: 現在の威力を表示
          const currentHP = parseInt(hpInputs[slot], 10)
          const max = maxHP ?? 0
          const reversalPower =
            isReversal && !isNaN(currentHP) && currentHP >= 1
              ? resolveReversalPower(Math.min(currentHP, max), max)
              : movePowers[slot] ?? moveRecord?.power ?? null

          const displayType = moveRecord
            ? resolveWeatherAwareMoveType({
                moveType: moveRecord.type as TypeName,
                moveSpecial: moveRecord.special,
                weather,
                attackerAbility: acting.ability,
                defenderAbility: target.ability,
              })
            : null

          // 表示威力は計算エンジンと同じ resolveBasePower を通す（可変威力の選択と HP 入力を優先）
          const selectedPower = movePowers[slot]
          let displayPower: number | null = null
          let powerTitle: string | undefined
          if (moveRecord) {
            if (hasPowerOpts && selectedPower != null && moveRecord.powerOptions!.includes(selectedPower)) {
              displayPower = selectedPower
            } else if (isReversal) {
              displayPower = reversalPower
            } else {
              displayPower = resolveBasePower({
                move: moveRecord,
                attackerStats: acting.stats,
                defenderStats: target.stats,
                attackerWeight: acting.weight,
                defenderWeight: target.weight,
                attackerStatus: acting.status,
                attackerRankModifiers: acting.ranks,
                weather,
                attackerAbility: acting.ability,
                defenderAbility: target.ability,
              })
              powerTitle = describeBasePower(moveRecord, displayPower, acting, target)
            }
          }
          const typeBarColor = displayType ? typeColor(displayType) : 'transparent'

          return (
            <div key={slot} className="space-y-1">
              <div
                className="rounded"
                style={{ borderLeft: `3px solid ${typeBarColor}`, paddingLeft: moveRecord ? 4 : 0 }}
              >
                <MoveSelect
                  value={moveName}
                  onChange={name => setMove(slot, name)}
                  placeholder={`技${slot + 1}`}
                  slot={slot}
                />
              </div>
              {moveRecord && (
                <div className="pl-1">
                  <MoveMetaChips
                    move={moveRecord}
                    power={displayPower}
                    displayType={displayType ?? undefined}
                    powerTitle={powerTitle}
                  />
                </div>
              )}

              {/* ── きしかいせい / じたばた: HP入力 ── */}
              {isReversal && moveName && (
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min={1}
                      max={max || undefined}
                      value={hpInputs[slot]}
                      onChange={e => handleHpChange(slot, e.target.value)}
                      placeholder={max ? `HP (最大${max})` : 'HP入力'}
                      className="input-base w-full text-xs pr-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                  <span className="text-xs text-fg-muted whitespace-nowrap">
                    → 威力
                    <span className={`ml-1 font-medium ${reversalPower !== null ? 'text-fg' : 'text-fg-subtle'}`}>
                      {reversalPower ?? '—'}
                    </span>
                  </span>
                </div>
              )}

              {/* ── 可変威力ボタン (powerOptions, おはかまいり等) ── */}
              {hasPowerOpts && moveName && (
                <div className="flex flex-wrap gap-1">
                  {moveRecord!.powerOptions!.map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setMovePower(slot, p)}
                      className={`min-w-10 flex-1 text-xs py-0.5 rounded border transition-colors ${
                        (movePowers[slot] ?? moveRecord!.power) === p
                          ? 'bg-accent-bg border-accent-border text-accent font-medium'
                          : 'text-fg-muted border-edge hover:bg-surface-3'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
