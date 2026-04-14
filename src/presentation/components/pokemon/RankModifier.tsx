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
            <span className="text-xs text-slate-400 w-3">{STAT_LABEL[stat]}</span>
            <button
              type="button"
              className="w-5 h-5 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-300"
              onClick={() => onChangeRank(stat, Math.max(-6, ranks[stat] - 1))}
            >-</button>
            <span className={`text-xs w-4 text-center font-mono ${
              ranks[stat] > 0 ? 'text-blue-400' : ranks[stat] < 0 ? 'text-red-400' : 'text-slate-400'
            }`}>
              {ranks[stat] > 0 ? `+${ranks[stat]}` : ranks[stat]}
            </span>
            <button
              type="button"
              className="w-5 h-5 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-300"
              onClick={() => onChangeRank(stat, Math.min(6, ranks[stat] + 1))}
            >+</button>
          </div>
        ))}
      </div>
    </div>
  )
}
