import type { MegaPokemonRecord } from '@/data/schemas/types'

interface MegaToggleProps {
  isMega: boolean
  canMega: boolean
  availableMegas: MegaPokemonRecord[]
  megaKey: string | null
  onChange: (v: boolean) => void
  onFormChange: (key: string) => void
}

const SEG = 'text-[11px] px-2.5 py-1 font-medium transition-colors'
const SEG_ON = 'bg-accent-bg text-accent'
const SEG_OFF = 'text-fg-muted hover:bg-surface-3'

/**
 * メガシンカトグル（セグメントコントロール）
 * - 1形態: ノーマル | メガ の2択
 * - 複数形態（リザードンX/Y・ミュウツーX/Y等）: 通常 | メガX | メガY
 */
export function MegaToggle({ isMega, canMega, availableMegas, megaKey, onChange, onFormChange }: MegaToggleProps) {
  if (!canMega) return null

  const hasMultipleForms = availableMegas.length > 1

  if (!hasMultipleForms) {
    return (
      <div className="inline-flex rounded-md border border-edge overflow-hidden">
        <button type="button" onClick={() => onChange(false)} className={`${SEG} ${!isMega ? SEG_ON : SEG_OFF}`}>
          ノーマル
        </button>
        <button type="button" onClick={() => onChange(true)} className={`${SEG} border-l border-edge ${isMega ? SEG_ON : SEG_OFF}`}>
          メガ
        </button>
      </div>
    )
  }

  return (
    <div className="inline-flex rounded-md border border-edge overflow-hidden">
      <button type="button" onClick={() => onChange(false)} className={`${SEG} ${!isMega ? SEG_ON : SEG_OFF}`}>
        通常
      </button>
      {availableMegas.map(mega => {
        const suffix = mega.key.split('-').pop()?.toUpperCase() ?? mega.name
        const isActive = isMega && megaKey === mega.key
        return (
          <button
            key={mega.key}
            type="button"
            onClick={() => {
              if (!isMega) onChange(true)
              onFormChange(mega.key)
            }}
            className={`${SEG} border-l border-edge ${isActive ? SEG_ON : SEG_OFF}`}
            title={mega.name}
          >
            メガ{suffix}
          </button>
        )
      })}
    </div>
  )
}
