import type { TypeName } from '@/domain/models/Pokemon'

const ALL_TYPES: TypeName[] = [
  'ノーマル', 'ほのお', 'みず', 'でんき', 'くさ', 'こおり',
  'かくとう', 'どく', 'じめん', 'ひこう', 'エスパー', 'むし',
  'いわ', 'ゴースト', 'ドラゴン', 'あく', 'はがね', 'フェアリー',
]

/** タイプ名ごとの背景色クラス（TypeBadge と同じ配色） */
const TYPE_BG: Record<TypeName, string> = {
  ノーマル:  'bg-stone-500  text-white',
  ほのお:    'bg-orange-500 text-white',
  みず:      'bg-blue-500   text-white',
  でんき:    'bg-yellow-400 text-slate-900',
  くさ:      'bg-green-500  text-white',
  こおり:    'bg-cyan-400   text-slate-900',
  かくとう:  'bg-red-700    text-white',
  どく:      'bg-purple-600 text-white',
  じめん:    'bg-amber-600  text-white',
  ひこう:    'bg-indigo-400 text-slate-900',
  エスパー:  'bg-pink-500   text-white',
  むし:      'bg-lime-600   text-white',
  いわ:      'bg-stone-600  text-white',
  ゴースト:  'bg-purple-800 text-white',
  ドラゴン:  'bg-violet-700 text-white',
  あく:      'bg-stone-800  text-white',
  はがね:    'bg-slate-500  text-white',
  フェアリー:'bg-pink-400   text-slate-900',
}

interface ProteanTypePickerProps {
  value: TypeName | null
  onChange: (type: TypeName | null) => void
}

export function ProteanTypePicker({ value, onChange }: ProteanTypePickerProps) {
  return (
    <div>
      <label className="label block mb-1">変換後タイプ</label>
      <div className="flex flex-wrap gap-1">
        {ALL_TYPES.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => onChange(value === t ? null : t)}
            className={`text-xs px-1.5 py-0.5 rounded font-medium transition-opacity ${
              TYPE_BG[t]
            } ${value === t ? 'opacity-100 ring-2 ring-white/60 ring-offset-1 ring-offset-transparent' : 'opacity-50 hover:opacity-80'}`}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  )
}
