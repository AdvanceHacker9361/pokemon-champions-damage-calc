import type { StatKey } from '@/domain/models/Pokemon'
import { STAT_LABEL } from '@/domain/models/Pokemon'

const RANK_STATS: StatKey[] = ['atk', 'def', 'spa', 'spd', 'spe']

interface RankModifierProps {
  ranks: Record<StatKey, number>
  onChangeRank: (stat: StatKey, rank: number) => void
  showAttackStats?: boolean  // 攻撃側は A/C 優先, 防御側は B/D 優先
}

export function RankModifier({ ranks, onChangeRank }: RankModifierProps) {
  return (
    <div>
      <label className="label block mb-1">ランク補正</label>
      <div className="flex flex-wrap gap-1">
        {RANK_STATS.map(stat => (
          <div key={stat} className="flex items-center gap-0.5">
            <span className="text-xs text-fg-subtle w-3">{STAT_LABEL[stat]}</span>
            <button
              type="button"
              className="w-5 h-5 text-xs bg-surface-3 hover:bg-surface-2 rounded text-fg-muted"
              onClick={() => onChangeRank(stat, Math.max(-6, ranks[stat] - 1))}
            >-</button>
            <span className={`text-xs w-4 text-center ${
              ranks[stat] !== 0 ? 'text-fg' : 'text-fg-subtle'
            }`}>
              {ranks[stat] > 0 ? `+${ranks[stat]}` : ranks[stat]}
            </span>
            <button
              type="button"
              className="w-5 h-5 text-xs bg-surface-3 hover:bg-surface-2 rounded text-fg-muted"
              onClick={() => onChangeRank(stat, Math.min(6, ranks[stat] + 1))}
            >+</button>
          </div>
        ))}
      </div>
    </div>
  )
}
