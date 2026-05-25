import { SpSlider } from './SpSlider'
import { SP_PRESETS } from '@/application/services/PresetService'
import type { StatKey } from '@/domain/models/Pokemon'
import { STAT_LABEL } from '@/domain/models/Pokemon'
import type { SpDistribution } from '@/domain/models/StatPoints'
import type { ComputedStats } from '@/domain/models/Pokemon'
import { SP_MAX_TOTAL } from '@/domain/constants/spLimits'
import { getTotalSp } from '@/domain/models/StatPoints'
import type { StatNatures } from '@/application/usecases/CalculateStatsUseCase'

const SP_STAT_KEYS: StatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe']
// HP にはランク補正・性格補正なし
const NATURE_RANK_STATS = new Set<StatKey>(['atk', 'def', 'spa', 'spd', 'spe'])

interface SpDistributionProps {
  sp: SpDistribution
  stats: ComputedStats
  onChangeSp: (stat: StatKey, value: number) => void
  onSetPreset: (sp: SpDistribution) => void
  ranks?: Partial<Record<StatKey, number>>
  onChangeRank?: (stat: StatKey, rank: number) => void
  statNatures?: StatNatures
  onChangeNature?: (stat: StatKey, val: number) => void
}

export function SpDistributionPanel({ sp, stats, onChangeSp, onSetPreset, ranks, onChangeRank, statNatures, onChangeNature }: SpDistributionProps) {
  const total = getTotalSp(sp)
  const remaining = SP_MAX_TOTAL - total
  const isOver = remaining < 0

  return (
    <div className="space-y-2">
      {/* SP 合計表示 */}
      <div className="flex items-center justify-between">
        <span className="label">能力ポイント(SP)</span>
        <span className={`text-xs ${isOver ? 'text-warning' : 'text-fg-muted'}`}>
          {total}/{SP_MAX_TOTAL}
          {isOver && <span className="ml-1 text-warning">超過!</span>}
          {!isOver && <span className="ml-1 text-fg-subtle">(残{remaining})</span>}
        </span>
      </div>

      {/* プリセットボタン（横一行） */}
      <div className="flex flex-wrap gap-1">
        {SP_PRESETS.filter(p => ['AS', 'CS', 'HS', 'HB', 'HD', 'HC', 'HA', '均等', 'クリア'].includes(p.label)).map(preset => (
          <button
            key={preset.key}
            type="button"
            onClick={() => onSetPreset(preset.sp)}
            className={`text-xs px-2.5 py-1 rounded transition-colors ${
              preset.label === 'クリア'
                ? 'text-fg-muted hover:bg-surface-3 border border-edge'
                : 'bg-surface-3 text-fg-muted hover:bg-surface-2'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* スライダー + ランク補正 + 性格 */}
      <div className="space-y-1.5">
        {SP_STAT_KEYS.map(stat => (
          <SpSlider
            key={stat}
            label={STAT_LABEL[stat]}
            value={sp[stat]}
            statValue={stats[stat]}
            remaining={remaining}
            onChange={v => onChangeSp(stat, v)}
            rank={NATURE_RANK_STATS.has(stat) && ranks ? (ranks[stat] ?? 0) : undefined}
            onChangeRank={NATURE_RANK_STATS.has(stat) && onChangeRank
              ? (r) => onChangeRank(stat, r)
              : undefined}
            nature={NATURE_RANK_STATS.has(stat) && statNatures
              ? (statNatures[stat] ?? 1.0)
              : undefined}
            onChangeNature={NATURE_RANK_STATS.has(stat) && onChangeNature
              ? (v) => onChangeNature(stat, v)
              : undefined}
          />
        ))}
      </div>
    </div>
  )
}
