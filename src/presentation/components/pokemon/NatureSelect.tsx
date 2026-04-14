import { NATURE_TABLE } from '@/domain/constants/natureModifiers'

interface NatureSelectProps {
  value: string
  onChange: (name: string) => void
}

const NATURES = Object.values(NATURE_TABLE)

export function NatureSelect({ value, onChange }: NatureSelectProps) {
  return (
    <div>
      <label className="label block mb-1">性格</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="input-base w-full text-sm"
      >
        {NATURES.map(n => (
          <option key={n.name} value={n.name}>
            {n.name}
            {n.up ? ` (+${n.up === 'atk' ? 'A' : n.up === 'def' ? 'B' : n.up === 'spa' ? 'C' : n.up === 'spd' ? 'D' : 'S'})` : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
