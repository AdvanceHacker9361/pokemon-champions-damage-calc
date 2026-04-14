import type { StatusCondition } from '@/domain/models/Pokemon'

interface StatusToggleProps {
  value: StatusCondition
  onChange: (s: StatusCondition) => void
}

const STATUS_OPTIONS: { value: StatusCondition; label: string; color: string }[] = [
  { value: null,      label: 'なし',     color: 'text-slate-400' },
  { value: 'やけど',  label: 'やけど',   color: 'text-orange-400' },
  { value: 'まひ',    label: 'まひ',     color: 'text-yellow-400' },
  { value: 'どく',    label: 'どく',     color: 'text-purple-400' },
  { value: 'もうどく',label: 'もうどく', color: 'text-purple-600' },
  { value: 'ねむり',  label: 'ねむり',   color: 'text-blue-400' },
]

export function StatusToggle({ value, onChange }: StatusToggleProps) {
  return (
    <div>
      <label className="label block mb-1">状態異常</label>
      <div className="flex flex-wrap gap-1">
        {STATUS_OPTIONS.map(opt => (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
              value === opt.value
                ? `${opt.color} border-current bg-slate-800`
                : 'text-slate-500 border-slate-700 hover:border-slate-600'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
