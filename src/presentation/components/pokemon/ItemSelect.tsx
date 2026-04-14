import { ItemRepository } from '@/data/repositories/ItemRepository'

interface ItemSelectProps {
  value: string | null
  onChange: (name: string | null) => void
}

const items = ItemRepository.getAll()

export function ItemSelect({ value, onChange }: ItemSelectProps) {
  return (
    <div>
      <label className="label block mb-1">持ち物</label>
      <select
        value={value ?? 'なし'}
        onChange={e => onChange(e.target.value === 'なし' ? null : e.target.value)}
        className="input-base w-full text-sm"
      >
        {items.map(i => (
          <option key={i.name} value={i.name}>{i.name}</option>
        ))}
      </select>
    </div>
  )
}
