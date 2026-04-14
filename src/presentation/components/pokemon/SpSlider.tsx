import { SP_MAX_STAT } from '@/domain/constants/spLimits'

interface SpSliderProps {
  label: string
  value: number
  statValue: number
  remaining: number
  onChange: (v: number) => void
  rank?: number
  onChangeRank?: (rank: number) => void
  nature?: number
  onChangeNature?: (val: number) => void
}

const NATURE_OPTIONS: { val: number; label: string }[] = [
  { val: 0.9, label: '0.9' },
  { val: 1.0, label: '1.0' },
  { val: 1.1, label: '1.1' },
]

function natureColor(nature: number): string {
  if (nature > 1.0) return 'text-blue-400'
  if (nature < 1.0) return 'text-red-400'
  return 'text-slate-300'
}

export function SpSlider({ label, value, statValue, remaining, onChange, rank, onChangeRank, nature, onChangeNature }: SpSliderProps) {
  const max = Math.min(SP_MAX_STAT, value + remaining)
  const hasRank = onChangeRank !== undefined && rank !== undefined
  const hasNature = onChangeNature !== undefined && nature !== undefined

  return (
    <div className="flex items-center gap-1.5">
      <span className="label w-4 text-center flex-shrink-0">{label}</span>
      <input
        type="range"
        min={0}
        max={SP_MAX_STAT}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
        style={{ '--max': max } as React.CSSProperties}
      />
      <input
        type="number"
        min={0}
        max={SP_MAX_STAT}
        value={value}
        onChange={e => {
          const v = Math.max(0, Math.min(SP_MAX_STAT, Number(e.target.value)))
          onChange(v)
        }}
        className="input-base w-10 text-center text-xs px-1"
      />
      <span className={`text-xs w-9 text-right font-mono flex-shrink-0 ${hasNature ? natureColor(nature!) : 'text-slate-300'}`}>
        {statValue}
      </span>

      {hasRank && (
        <div className="flex items-center gap-0.5 ml-0.5">
          <button
            type="button"
            className="w-4 h-4 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-300 leading-none"
            onClick={() => onChangeRank(Math.max(-6, rank - 1))}
          >-</button>
          <span className={`text-xs w-5 text-center font-mono ${
            rank > 0 ? 'text-blue-400' : rank < 0 ? 'text-red-400' : 'text-slate-500'
          }`}>
            {rank > 0 ? `+${rank}` : rank}
          </span>
          <button
            type="button"
            className="w-4 h-4 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-300 leading-none"
            onClick={() => onChangeRank(Math.min(6, rank + 1))}
          >+</button>
        </div>
      )}

      {hasNature && (
        <div className="flex gap-px ml-0.5">
          {NATURE_OPTIONS.map(opt => (
            <button
              key={opt.val}
              type="button"
              onClick={() => onChangeNature(opt.val)}
              className={`text-xs px-1 py-0.5 rounded transition-colors leading-none ${
                Math.abs((nature ?? 1.0) - opt.val) < 0.01
                  ? opt.val > 1.0 ? 'bg-blue-700 text-white'
                    : opt.val < 1.0 ? 'bg-red-700 text-white'
                    : 'bg-slate-600 text-white'
                  : 'bg-slate-800 text-slate-500 hover:text-slate-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
