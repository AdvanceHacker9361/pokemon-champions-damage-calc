import type { TypeName } from '@/domain/models/Pokemon'

const TYPE_COLORS: Record<TypeName, string> = {
  ノーマル:  'bg-stone-500',
  ほのお:    'bg-orange-500',
  みず:      'bg-blue-500',
  でんき:    'bg-yellow-400 text-slate-900',
  くさ:      'bg-green-500',
  こおり:    'bg-cyan-400 text-slate-900',
  かくとう:  'bg-red-700',
  どく:      'bg-purple-600',
  じめん:    'bg-amber-600',
  ひこう:    'bg-indigo-400 text-slate-900',
  エスパー:  'bg-pink-500',
  むし:      'bg-lime-600',
  いわ:      'bg-stone-600',
  ゴースト:  'bg-purple-800',
  ドラゴン:  'bg-violet-700',
  あく:      'bg-stone-800',
  はがね:    'bg-slate-500',
  フェアリー:'bg-pink-400 text-slate-900',
}

interface BadgeProps {
  type: TypeName
  size?: 'sm' | 'md'
}

export function TypeBadge({ type, size = 'sm' }: BadgeProps) {
  const colorClass = TYPE_COLORS[type] ?? 'bg-slate-600'
  const sizeClass = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1'
  return (
    <span className={`inline-block rounded font-medium text-white ${colorClass} ${sizeClass}`}>
      {type}
    </span>
  )
}
