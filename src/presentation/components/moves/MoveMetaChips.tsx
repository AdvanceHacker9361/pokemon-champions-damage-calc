import { TypeBadge } from '@/presentation/components/shared/Badge'
import type { MoveRecord } from '@/data/schemas/types'

interface MoveMetaChipsProps {
  move: MoveRecord
  power?: number | null
}

function getPowerLabel(move: MoveRecord, selectedPower?: number | null): string | null {
  if (selectedPower != null) return `威力${selectedPower}`
  if (move.powerOptions && move.powerOptions.length > 0) return `威力${move.powerOptions.join('/')}`
  if (move.multiHit?.type === 'escalating') return `威力${move.multiHit.powers.join('→')}`
  if (move.power != null) return `威力${move.power}`
  if (move.category === '変化') return null
  if (move.special) return '威力可変'
  return null
}

function getHitLabel(move: MoveRecord): string | null {
  if (!move.multiHit) return null
  if (move.multiHit.type === 'fixed') return `${move.multiHit.count}回`
  if (move.multiHit.type === 'variable') return '2-5回'
  return `${move.multiHit.powers.length}段`
}

export function MoveMetaChips({ move, power }: MoveMetaChipsProps) {
  const powerLabel = getPowerLabel(move, power)
  const hitLabel = getHitLabel(move)

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      <TypeBadge type={move.type} />
      <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-fg-muted">
        {move.category}
      </span>
      {powerLabel && (
        <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-mono text-fg-subtle">
          {powerLabel}
        </span>
      )}
      {hitLabel && (
        <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-fg-subtle">
          {hitLabel}
        </span>
      )}
    </div>
  )
}
