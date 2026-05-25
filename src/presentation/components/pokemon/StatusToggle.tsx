import type { StatusCondition } from '@/domain/models/Pokemon'

interface StatusToggleProps {
  value: StatusCondition
  onChange: (s: StatusCondition) => void
}

const STATUS_OPTIONS: { value: StatusCondition; label: string }[] = [
  { value: null,       label: 'なし' },
  { value: 'やけど',   label: 'やけど' },
  { value: 'まひ',     label: 'まひ' },
  { value: 'どく',     label: 'どく' },
  { value: 'もうどく', label: 'もうどく' },
  { value: 'ねむり',   label: 'ねむり' },
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
            className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
              value === opt.value
                ? 'bg-accent-bg text-accent border-accent-border'
                : 'text-fg-muted border-edge hover:bg-surface-3'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
