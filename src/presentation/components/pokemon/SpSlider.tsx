import { useEffect, useState } from 'react'
import { SP_MAX_STAT } from '@/domain/constants/spLimits'

interface SpSliderProps {
  label: string
  value: number
  statValue: number
  remaining: number
  onChange: (v: number) => void
  rank?: number
  onChangeRank?: (rank: number) => void
  nature?: number
  onChangeNature?: (val: number) => void
}

const NATURE_OPTIONS: { val: number; label: string }[] = [
  { val: 0.9, label: '0.9' },
  { val: 1.0, label: '1.0' },
  { val: 1.1, label: '1.1' },
]

export function SpSlider({ label, value, statValue, remaining, onChange, rank, onChangeRank, nature, onChangeNature }: SpSliderProps) {
  const [blockedByTotal, setBlockedByTotal] = useState(false)
  const maxAllowed = Math.max(value, Math.min(SP_MAX_STAT, value + remaining))
  const isLimitedByTotal = maxAllowed < SP_MAX_STAT
  const canIncreaseBy = Math.max(0, maxAllowed - value)
  const hasRank = onChangeRank !== undefined && rank !== undefined
  const hasNature = onChangeNature !== undefined && nature !== undefined
  const hasModifiers = hasRank || hasNature

  useEffect(() => {
    if (!blockedByTotal) return
    const timer = window.setTimeout(() => setBlockedByTotal(false), 1400)
    return () => window.clearTimeout(timer)
  }, [blockedByTotal])

  function requestChange(raw: number) {
    const requested = Math.max(0, Math.min(SP_MAX_STAT, raw))
    if (requested > maxAllowed) setBlockedByTotal(true)
    onChange(requested)
  }

  return (
    <div className="space-y-0.5">
      {/* メイン行: ラベル + スライダー + 数値入力 + 実数値 */}
      <div className="flex items-center gap-1.5">
        <span className={`label w-4 text-center flex-shrink-0 ${blockedByTotal ? 'text-warning' : ''}`}>
          {label}
        </span>
        <input
          type="range"
          min={0}
          max={SP_MAX_STAT}
          value={value}
          onChange={e => requestChange(Number(e.target.value))}
          className="flex-1 min-w-0 h-1.5 bg-surface-3 rounded appearance-none cursor-pointer accent-accent"
          title={isLimitedByTotal ? `合計SPの残りにより、この行は${maxAllowed}まで` : undefined}
        />
        <input
          type="number"
          min={0}
          max={SP_MAX_STAT}
          value={value}
          onChange={e => {
            requestChange(Number(e.target.value))
          }}
          className={`input-base w-10 text-center text-xs px-1 flex-shrink-0 ${
            blockedByTotal || (isLimitedByTotal && canIncreaseBy === 0) ? 'border-warning' : ''
          }`}
        />
        <span className="text-sm w-10 text-right font-medium flex-shrink-0 text-fg">
          {statValue}
        </span>
        {isLimitedByTotal && (
          <span
            className={`hidden sm:inline-flex w-12 justify-end text-[10px] font-mono ${
              blockedByTotal || canIncreaseBy === 0 ? 'text-warning' : 'text-fg-faint'
            }`}
            title="合計SPの残りから、この行で追加できる量"
            aria-live="polite"
          >
            {canIncreaseBy === 0 ? '残0' : `+${canIncreaseBy}`}
          </span>
        )}
      </div>
      {blockedByTotal && (
        <div className="pl-5 text-[10px] leading-4 text-warning" aria-live="polite">
          {canIncreaseBy === 0
            ? '残り0: 他の能力を下げてください'
            : `この能力はあと${canIncreaseBy}まで`}
        </div>
      )}

      {/* 補正行: ランク + 性格（右寄せ） */}
      {hasModifiers && (
        <div className="flex items-center justify-end gap-2 pl-5">
          {hasRank && (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                className="w-5 h-5 text-xs bg-surface-3 hover:bg-surface-2 rounded text-fg-muted leading-none flex-shrink-0"
                onClick={() => onChangeRank(Math.max(-6, rank - 1))}
              >−</button>
              <span className={`text-xs w-6 text-center ${
                rank !== 0 ? 'text-fg' : 'text-fg-subtle'
              }`}>
                {rank > 0 ? `+${rank}` : rank}
              </span>
              <button
                type="button"
                className="w-5 h-5 text-xs bg-surface-3 hover:bg-surface-2 rounded text-fg-muted leading-none flex-shrink-0"
                onClick={() => onChangeRank(Math.min(6, rank + 1))}
              >+</button>
            </div>
          )}

          {hasNature && (
            <div className="inline-flex rounded border border-edge overflow-hidden">
              {NATURE_OPTIONS.map((opt, i) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => onChangeNature(opt.val)}
                  className={`text-xs px-1.5 py-0.5 transition-colors leading-none min-h-[20px] ${i > 0 ? 'border-l border-edge' : ''} ${
                    Math.abs((nature ?? 1.0) - opt.val) < 0.01
                      ? 'bg-accent-bg text-accent'
                      : 'text-fg-muted hover:bg-surface-3'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
