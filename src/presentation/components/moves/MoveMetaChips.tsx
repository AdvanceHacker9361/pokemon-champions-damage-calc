import { TypeBadge } from '@/presentation/components/shared/Badge'
import type { MoveRecord } from '@/data/schemas/types'
import type { TypeName } from '@/domain/models/Pokemon'
import { getPowerLabel } from './movePowerLabel'

interface MoveMetaChipsProps {
  move: MoveRecord
  power?: number | null
  displayType?: TypeName
  /** 可変威力技で威力の根拠を説明するツールチップ（技スロットのみ） */
  powerTitle?: string
}

function getHitLabel(move: MoveRecord): string | null {
  if (!move.multiHit) return null
  if (move.multiHit.type === 'fixed') return `${move.multiHit.count}回`
  if (move.multiHit.type === 'variable') return '2-5回'
  return `${move.multiHit.powers.length}段`
}

export function MoveMetaChips({ move, power, displayType, powerTitle }: MoveMetaChipsProps) {
  const powerLabel = getPowerLabel(move, power)
  const hitLabel = getHitLabel(move)

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      <TypeBadge type={displayType ?? move.type} />
      <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-fg-muted">
        {move.category}
      </span>
      {powerLabel && (
        <span
          className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-mono text-fg-subtle"
          title={powerTitle}
        >
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
