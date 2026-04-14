import { SP_MAX_STAT } from '@/domain/constants/spLimits'

interface SpSliderProps {
  label: string
  value: number
  statValue: number
  remaining: number
  onChange: (v: number) => void
}

export function SpSlider({ label, value, statValue, remaining, onChange }: SpSliderProps) {
  const max = Math.min(SP_MAX_STAT, value + remaining)

  return (
    <div className="flex items-center gap-2">
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
      <span className="text-xs text-slate-300 w-10 text-right font-mono">
        {statValue}
      </span>
    </div>
  )
}
