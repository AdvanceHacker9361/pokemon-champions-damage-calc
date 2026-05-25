import type { TypeName } from '@/domain/models/Pokemon'
import { typeBadgeStyle } from './typeColors'

interface BadgeProps {
  type: TypeName
  size?: 'sm' | 'md'
}

export function TypeBadge({ type, size = 'sm' }: BadgeProps) {
  const sizeClass = size === 'sm' ? 'text-[11px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'
  return (
    <span
      className={`inline-block rounded font-medium ${sizeClass}`}
      style={typeBadgeStyle(type)}
    >
      {type}
    </span>
  )
}
