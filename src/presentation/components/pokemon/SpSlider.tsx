import { SP_MAX_STAT } from '@/domain/constants/spLimits'

interface SpSliderProps {
  label: string
  value: number
  statValue: number
  remaining: number
  onChange: (v: number) => void
  rank?: number
  onChangeRank?: (rank: number) => void
}

export function SpSlider({ label, value, statValue, remaining, onChange, rank, onChangeRank }: SpSliderProps) {
  const max = Math.min(SP_MAX_STAT, value + remaining)
  const hasRank = onChangeRank !== undefined && rank !== undefined

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
      <span className="text-xs text-slate-300 w-9 text-right font-mono">
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
    </div>
  )
}
