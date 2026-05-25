import type { TypeName } from '@/domain/models/Pokemon'
import { typeBadgeStyle } from '@/presentation/components/shared/typeColors'

const ALL_TYPES: TypeName[] = [
  'ノーマル', 'ほのお', 'みず', 'でんき', 'くさ', 'こおり',
  'かくとう', 'どく', 'じめん', 'ひこう', 'エスパー', 'むし',
  'いわ', 'ゴースト', 'ドラゴン', 'あく', 'はがね', 'フェアリー',
]

interface ProteanTypePickerProps {
  value: TypeName | null
  onChange: (type: TypeName | null) => void
}

export function ProteanTypePicker({ value, onChange }: ProteanTypePickerProps) {
  return (
    <div>
      <label className="label block mb-1">変換後タイプ</label>
      <div className="flex flex-wrap gap-1">
        {ALL_TYPES.map(t => {
          const isActive = value === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => onChange(isActive ? null : t)}
              className="text-[11px] px-1.5 py-0.5 rounded font-medium transition-opacity"
              style={{
                ...typeBadgeStyle(t),
                opacity: isActive ? 1 : 0.5,
                outline: isActive ? '2px solid var(--accent)' : 'none',
                outlineOffset: '1px',
              }}
            >
              {t}
            </button>
          )
        })}
      </div>
    </div>
  )
}
