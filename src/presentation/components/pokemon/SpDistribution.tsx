import { SpSlider } from './SpSlider'
import { SP_PRESETS } from '@/application/services/PresetService'
import type { StatKey } from '@/domain/models/Pokemon'
import { STAT_LABEL } from '@/domain/models/Pokemon'
import type { SpDistribution } from '@/domain/models/StatPoints'
import type { ComputedStats } from '@/domain/models/Pokemon'
import { SP_MAX_TOTAL } from '@/domain/constants/spLimits'
import { getTotalSp } from '@/domain/models/StatPoints'

const SP_STAT_KEYS: StatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe']

interface SpDistributionProps {
  sp: SpDistribution
  stats: ComputedStats
  onChangeSp: (stat: StatKey, value: number) => void
  onSetPreset: (sp: SpDistribution) => void
}

export function SpDistributionPanel({ sp, stats, onChangeSp, onSetPreset }: SpDistributionProps) {
  const total = getTotalSp(sp)
  const remaining = SP_MAX_TOTAL - total
  const isOver = remaining < 0

  return (
    <div className="space-y-2">
      {/* SP 合計表示 */}
      <div className="flex items-center justify-between">
        <span className="label">能力ポイント(SP)</span>
        <span className={`text-xs font-mono ${isOver ? 'text-red-400' : 'text-slate-400'}`}>
          {total}/{SP_MAX_TOTAL}
          {isOver && <span className="ml-1 text-red-400">超過!</span>}
          {!isOver && <span className="ml-1 text-slate-500">(残{remaining})</span>}
        </span>
      </div>

      {/* プリセットボタン */}
      <div className="flex flex-wrap gap-1">
        {SP_PRESETS.map(preset => (
          <button
            key={preset.key}
            type="button"
            onClick={() => onSetPreset(preset.sp)}
            className="btn-ghost text-xs px-2 py-0.5 border border-slate-700"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* スライダー */}
      <div className="space-y-1.5">
        {SP_STAT_KEYS.map(stat => (
          <SpSlider
            key={stat}
            label={STAT_LABEL[stat]}
            value={sp[stat]}
            statValue={stats[stat]}
            remaining={remaining}
            onChange={v => onChangeSp(stat, v)}
          />
        ))}
      </div>
    </div>
  )
}
