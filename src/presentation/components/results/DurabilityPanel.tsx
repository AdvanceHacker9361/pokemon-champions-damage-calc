import { useState, useMemo } from 'react'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { useFieldStore } from '@/presentation/store/fieldStore'
import { MoveRepository } from '@/data/repositories/MoveRepository'
import { findOptimalDurability } from '@/application/usecases/FindOptimalSpUseCase'
import type { DurabilitySearchResult } from '@/application/usecases/FindOptimalSpUseCase'
import { calculateStats } from '@/application/usecases/CalculateStatsUseCase'
import { calculateHP } from '@/domain/calculators/StatCalculator'

interface DurabilityPanelProps {
  moveName: string
}

function natureSymbol(n: 0.9 | 1.0 | 1.1): string {
  if (n > 1.0) return '↑'
  if (n < 1.0) return '↓'
  return '―'
}

function natureClass(n: 0.9 | 1.0 | 1.1): string {
  if (n > 1.0) return 'text-accent'
  if (n < 1.0) return 'text-danger-2'
  return 'text-fg-subtle'
}

export function DurabilityPanel({ moveName }: DurabilityPanelProps) {
  const [hitsToSurvive, setHitsToSurvive] = useState<1 | 2>(1)

  const attackerBaseStats         = useAttackerStore(s => s.baseStats)
  const attackerSp                = useAttackerStore(s => s.sp)
  const attackerNatures           = useAttackerStore(s => s.statNatures)
  const attackerRanks             = useAttackerStore(s => s.ranks)
  const attackerTypes             = useAttackerStore(s => s.types)
  const attackerAbility           = useAttackerStore(s => s.effectiveAbility)
  const attackerItem              = useAttackerStore(s => s.itemName)
  const attackerStatus            = useAttackerStore(s => s.status)
  const attackerAbilityActivated  = useAttackerStore(s => s.abilityActivated)
  const attackerProteanStab       = useAttackerStore(s => s.proteanStab)
  const attackerSupremeOverlordBoost = useAttackerStore(s => s.supremeOverlordBoost)
  const attackerWeight            = useAttackerStore(s => s.weight)
  const attackerChargeActive      = useAttackerStore(s => s.chargeActive)

  const defenderBaseStats         = useDefenderStore(s => s.baseStats)
  const defenderSp                = useDefenderStore(s => s.sp)
  const defenderNatures           = useDefenderStore(s => s.statNatures)
  const defenderRanks             = useDefenderStore(s => s.ranks)
  const defenderTypes             = useDefenderStore(s => s.types)
  const defenderAbility           = useDefenderStore(s => s.effectiveAbility)
  const defenderItem              = useDefenderStore(s => s.itemName)
  const defenderStatus            = useDefenderStore(s => s.status)
  const defenderAbilityActivated  = useDefenderStore(s => s.abilityActivated)
  const defenderProteanType       = useDefenderStore(s => s.proteanType)
  const defenderWeight            = useDefenderStore(s => s.weight)

  const weather       = useFieldStore(s => s.weather)
  const terrain       = useFieldStore(s => s.terrain)
  const isReflect     = useFieldStore(s => s.isReflect)
  const isLightScreen = useFieldStore(s => s.isLightScreen)
  const isAuroraVeil  = useFieldStore(s => s.isAuroraVeil)
  const isTrickRoom   = useFieldStore(s => s.isTrickRoom)
  const isGravity     = useFieldStore(s => s.isGravity)

  const moveRecord = useMemo(() => MoveRepository.findByName(moveName), [moveName])

  const result = useMemo<DurabilitySearchResult | null>(() => {
    if (!moveRecord || moveRecord.category === '変化') return null

    const attackerStats = calculateStats({
      baseStats: attackerBaseStats,
      sp: attackerSp,
      statNatures: attackerNatures,
      ranks: attackerRanks,
    })

    return findOptimalDurability({
      attackerStats,
      attackerTypes,
      attackerAbility,
      attackerItem,
      attackerStatus,
      attackerAbilityActivated,
      attackerProteanStab,
      attackerSupremeOverlordBoost,
      attackerRankModifiers: attackerRanks as Record<string, number>,
      attackerWeight,
      attackerChargeActive,
      move: moveRecord,
      field: { weather, terrain, isReflect, isLightScreen, isAuroraVeil, isTrickRoom, isGravity },
      defenderBaseStats,
      defenderStatNatures: defenderNatures,
      defenderCurrentSp: defenderSp,
      defenderRanks,
      defenderTypes,
      defenderAbility,
      defenderItem,
      defenderStatus,
      defenderAbilityActivated,
      defenderProteanType,
      defenderWeight,
      hitsToSurvive,
    })
  }, [
    moveRecord, hitsToSurvive,
    attackerBaseStats, attackerSp, attackerNatures, attackerRanks,
    attackerTypes, attackerAbility, attackerItem, attackerStatus,
    attackerAbilityActivated, attackerProteanStab, attackerSupremeOverlordBoost, attackerWeight, attackerChargeActive,
    defenderBaseStats, defenderSp, defenderNatures, defenderRanks,
    defenderTypes, defenderAbility, defenderItem, defenderStatus,
    defenderAbilityActivated, defenderProteanType, defenderWeight,
    weather, terrain, isReflect, isLightScreen, isAuroraVeil, isTrickRoom, isGravity,
  ])

  const currentHp = useMemo(
    () => calculateHP(defenderBaseStats.hp, defenderSp.hp),
    [defenderBaseStats.hp, defenderSp.hp],
  )

  if (!result) return null

  const { defStatLabel, budget, currentMaxDmg, points } = result
  const displayPoints = points.slice(0, 20)
  const currentSurvives = currentMaxDmg > 0 && currentHp > currentMaxDmg * hitsToSurvive

  return (
    <div className="space-y-2">
      {/* タイトル + 耐え数切り替え */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-fg-muted">
          耐久調整 H + {defStatLabel}
        </span>
        <div className="flex gap-0.5 ml-auto">
          {([1, 2] as const).map(n => (
            <button
              key={n}
              type="button"
              onClick={() => setHitsToSurvive(n)}
              className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                hitsToSurvive === n
                  ? 'bg-accent-bg border-accent-border text-accent'
                  : 'border-edge text-fg-muted hover:bg-surface-3'
              }`}
            >
              {n}発耐え
            </button>
          ))}
        </div>
      </div>

      {/* 現状サマリ */}
      <div className="flex items-center justify-between text-[10px] text-fg-subtle">
        <span>
          現在 HP
          <span className="font-mono text-fg-muted ml-0.5">{currentHp}</span>
          {'　'}最大被ダメ
          <span className="font-mono text-fg-muted ml-0.5">{currentMaxDmg}</span>
          {'　'}予算
          <span className="font-mono text-fg-muted ml-0.5">{budget}</span>SP
        </span>
        <span className={`font-semibold ${currentSurvives ? 'text-success' : 'text-danger-2'}`}>
          {currentSurvives ? `✓ ${hitsToSurvive}発耐え済み` : `✗ ${hitsToSurvive}発耐えできない`}
        </span>
      </div>

      {/* 結果テーブル */}
      {points.length === 0 ? (
        <div className="text-xs text-fg-subtle py-1 text-center">
          {hitsToSurvive}発耐えを達成できる組み合わせが見つかりません
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-xs font-mono w-full">
            <thead>
              <tr className="text-[10px] text-fg-subtle border-b border-edge">
                <th className="text-right pr-2 py-0.5 font-normal">計</th>
                <th className="text-right pr-2 font-normal">H</th>
                <th className="text-right pr-2 font-normal">{defStatLabel}</th>
                <th className="text-center px-1 font-normal">性</th>
                <th className="text-right pr-2 font-normal">HP実数</th>
                <th className="text-right pr-2 font-normal">{defStatLabel}実数</th>
                <th className="text-right pr-2 font-normal">被ダメ</th>
                <th className="text-right font-normal">残HP</th>
              </tr>
            </thead>
            <tbody>
              {displayPoints.map((p, i) => (
                <tr
                  key={`${p.spH}-${p.spDef}-${p.defNature}`}
                  className={`border-b border-edge last:border-0 ${
                    i === 0
                      ? 'bg-emerald-50 dark:bg-emerald-950/40'
                      : 'hover:bg-surface-2'
                  }`}
                >
                  <td className={`text-right pr-2 py-0.5 font-bold ${i === 0 ? 'text-success' : 'text-fg-muted'}`}>
                    {p.totalSp}
                  </td>
                  <td className="text-right pr-2 text-fg-muted">{p.spH}</td>
                  <td className="text-right pr-2 text-fg-muted">{p.spDef}</td>
                  <td className={`text-center px-1 ${natureClass(p.defNature)}`}>
                    {natureSymbol(p.defNature)}
                  </td>
                  <td className="text-right pr-2 text-fg">{p.hp}</td>
                  <td className="text-right pr-2 text-fg">{p.defStat}</td>
                  <td className="text-right pr-2 text-fg-subtle">{p.maxDmgPerHit}</td>
                  <td className={`text-right ${p.remainHp > 0 ? 'text-success' : 'text-fg-subtle'}`}>
                    +{p.remainHp}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {points.length > 20 && (
            <div className="text-[10px] text-fg-faint mt-1 text-right">
              他 {points.length - 20} 件
            </div>
          )}
        </div>
      )}
    </div>
  )
}
