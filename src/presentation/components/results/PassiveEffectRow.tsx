import { useState } from 'react'
import type { PassiveEffect, PassiveTiming } from '@/domain/models/PassiveEffect'
import { TIMING_BADGE } from './passiveCatalogUtils'

export interface PassiveEffectRowProps {
  testId: string
  mainLabel: string
  sources?: string
  timing: PassiveTiming
  amountPreview: string
  /** 現在の適用回数。0 = 未設定（この側では積まれていない） */
  count: number | 'all' | 0
  /** 「全」チップを出すか（turnEnd / perAttack のみ） */
  canAll: boolean
  /** 詳細（開始ターン）を出す対象の常時効果。未設定行では undefined */
  effect?: PassiveEffect
  onIncrement: () => void
  onDecrement: () => void
  onToggleAll: () => void
  onStartTurnChange?: (turn: number) => void
  /** カスタム行のみ: ✕ で丸ごと削除 */
  onDelete?: () => void
}

/**
 * 常時効果カタログの1行（V3.18.0 フェーズC）。
 * ラベル・発生源・タイミングバッジ・1適用あたりの実量・ステッパー（[−] N [+] / 全）を持つ。
 */
export function PassiveEffectRow({
  testId, mainLabel, sources, timing, amountPreview,
  count, canAll, effect,
  onIncrement, onDecrement, onToggleAll, onStartTurnChange, onDelete,
}: PassiveEffectRowProps) {
  const [detailOpen, setDetailOpen] = useState(false)
  const isActive = count !== 0
  const badge = TIMING_BADGE[timing]
  const countText = count === 'all' ? '全' : String(count)

  return (
    <div
      data-testid={testId}
      className={`rounded border px-2 py-1.5 transition-colors ${
        isActive ? 'border-accent-border bg-accent-bg/20' : 'border-edge bg-surface-2'
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <div className="min-w-0 flex-1 basis-[9rem]">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className="text-xs font-semibold text-fg">{mainLabel}</span>
            <span
              className="rounded border border-edge bg-surface-3 px-1 py-0.5 text-[10px] text-fg-faint whitespace-nowrap"
              title={badge.title}
            >
              {badge.text}
            </span>
          </div>
          {sources && <div className="text-[10px] text-fg-faint leading-tight">{sources}</div>}
        </div>

        <span className="font-mono text-[11px] text-fg-muted whitespace-nowrap" data-testid={`${testId}-amount`}>
          {amountPreview}
        </span>

        <div className="flex flex-shrink-0 items-center gap-0.5 whitespace-nowrap">
          <button
            type="button"
            onClick={onDecrement}
            disabled={count === 0}
            className="h-5 w-5 rounded bg-surface-3 text-xs text-fg-muted hover:bg-surface-2 disabled:opacity-30"
            title="回数を減らす（1で削除）"
            aria-label={`${mainLabel} の回数を減らす`}
          >−</button>
          <span
            data-testid={`${testId}-count`}
            className={`w-6 text-center font-mono text-xs ${isActive ? 'font-medium text-accent' : 'text-fg-faint'}`}
          >{countText}</span>
          <button
            type="button"
            onClick={onIncrement}
            className="h-5 w-5 rounded bg-surface-3 text-xs text-fg-muted hover:bg-surface-2"
            title="回数を増やす"
            aria-label={`${mainLabel} の回数を増やす`}
          >＋</button>
          {canAll && (
            <button
              type="button"
              onClick={onToggleAll}
              aria-pressed={count === 'all'}
              className={`ml-0.5 rounded border px-1 py-0.5 text-[10px] transition-colors ${
                count === 'all'
                  ? 'border-accent-border bg-accent-bg text-accent'
                  : 'border-edge bg-surface-3 text-fg-muted hover:bg-surface-2'
              }`}
              title="時系列の全ターンに適用する"
              aria-label={`${mainLabel} を全ターンに適用`}
            >全</button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="ml-0.5 h-5 w-5 rounded bg-surface-3 text-xs text-fg-faint transition-colors hover:text-danger-2"
              title="この効果を削除"
              aria-label={`${mainLabel} を削除`}
            >✕</button>
          )}
        </div>
      </div>

      {isActive && effect && timing !== 'start' && (
        <div className="mt-1">
          <button
            type="button"
            aria-expanded={detailOpen}
            onClick={() => setDetailOpen(v => !v)}
            className="text-[10px] text-fg-faint hover:text-fg-muted"
          >
            {detailOpen ? '▲ 詳細' : '▼ 詳細'}
          </button>
          {detailOpen && (
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-fg-muted">
              <span>開始ターン</span>
              <input
                type="number"
                min={1}
                value={effect.startTurn}
                onChange={e => {
                  const n = Number(e.target.value)
                  onStartTurnChange?.(Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1)
                }}
                aria-label={`${mainLabel} の開始ターン`}
                className="input-base w-12 px-1 py-0.5 text-center text-[11px]"
              />
              <span className="text-fg-faint">T 以降に適用</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
