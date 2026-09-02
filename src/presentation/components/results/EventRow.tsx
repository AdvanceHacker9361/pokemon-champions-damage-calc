import { useRef, useState, type ReactNode } from 'react'
import type { ProgressionEvent } from '@/presentation/store/progressionStore'
import type { MegaPokemonRecord } from '@/data/schemas/types'
import type { TurnRange } from '@/domain/models/PassiveEffect'
import { EventInsertPopover } from './EventInsertMenu'
import type { InsertEventCtx } from './eventInsertActions'

const RECOVER_FRACTIONS = [
  { label: '1/3', num: 1, den: 3 },
  { label: '1/2', num: 1, den: 2 },
  { label: '2/3', num: 2, den: 3 },
]

function readNonNegative(raw: string): number {
  const value = Number(raw)
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

export interface EventRowProps {
  ev: ProgressionEvent
  idx: number
  total: number
  isHighlighted: boolean
  turnRange?: TurnRange
  insertCtx: InsertEventCtx
  attackerMaxHp: number
  defenderMaxHp: number
  defenderMoveOptions: string[]
  attackerMegaOptions: MegaPokemonRecord[]
  defenderMegaOptions: MegaPokemonRecord[]
  onSetAttackUsages: (id: string, usages: number) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  /** このイベントの直後へ挿入する。key は INSERT_EVENT_ACTIONS のキー */
  onInsertAfter: (key: string) => void
  onUpdate: (patch: Partial<ProgressionEvent>) => void
}

type TimelineRowTone = 'attack' | 'accent' | 'warning' | 'success' | 'default'

function timelineRowClass(tone: TimelineRowTone) {
  const base = 'grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-start gap-2 rounded border border-l-2 px-2 py-1.5 text-xs'
  switch (tone) {
    case 'attack':
      return `${base} border-edge border-l-accent bg-surface-1`
    case 'accent':
      return `${base} border-accent-border border-l-accent bg-accent-bg/30`
    case 'warning':
      return `${base} border-edge border-l-warning bg-surface-2`
    case 'success':
      return `${base} border-edge border-l-success bg-surface-2`
    case 'default':
    default:
      return `${base} border-edge border-l-edge bg-surface-2`
  }
}

/** attack/setupTurn 行の「T{n}」チップ。usages>1 の attack は「T{a}–{b}」 */
function TurnChip({ turnRange }: { turnRange?: TurnRange }) {
  if (!turnRange || turnRange.startTurn <= 0) return null
  const text = turnRange.endTurn > turnRange.startTurn
    ? `T${turnRange.startTurn}–${turnRange.endTurn}`
    : `T${turnRange.startTurn}`
  return (
    <span
      className="rounded border border-edge bg-surface-3 px-1 py-0.5 text-[10px] font-mono text-fg-faint flex-shrink-0"
      title={`ターン ${text.slice(1)}`}
    >
      {text}
    </span>
  )
}

function TimelineRow({
  idx, total, tone, isHighlighted, children,
  insertCtx, onInsertAfter,
  onMoveUp, onMoveDown, onRemove,
}: {
  idx: number
  total: number
  tone: TimelineRowTone
  isHighlighted: boolean
  children: ReactNode
  insertCtx: InsertEventCtx
  onInsertAfter: (key: string) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}) {
  return (
    <div className={`${timelineRowClass(tone)} transition-colors ${isHighlighted ? 'ring-1 ring-accent-border bg-accent-bg/40' : ''}`}>
      <span className="text-fg-faint text-right font-mono pt-0.5">{idx + 1}</span>
      <div className="min-w-0">{children}</div>
      <RowControls
        idx={idx}
        total={total}
        insertCtx={insertCtx}
        onInsertAfter={onInsertAfter}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onRemove={onRemove}
      />
    </div>
  )
}

export function EventRow({
  ev, idx, total,
  isHighlighted, turnRange, insertCtx,
  attackerMaxHp, defenderMaxHp, defenderMoveOptions,
  attackerMegaOptions, defenderMegaOptions,
  onSetAttackUsages, onRemove, onMoveUp, onMoveDown, onInsertAfter, onUpdate,
}: EventRowProps) {
  const rowProps = { idx, total, isHighlighted, insertCtx, onInsertAfter, onMoveUp, onMoveDown, onRemove }

  if (ev.kind === 'attack') {
    const subMin = ev.minDmg * ev.usages
    const subMax = ev.maxDmg * ev.usages
    return (
      <TimelineRow {...rowProps} tone="attack">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <TurnChip turnRange={turnRange} />
          <span className="min-w-[8rem] flex-1 truncate font-medium text-fg">{ev.label}</span>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => onSetAttackUsages(ev.id, ev.usages - 1)}
              disabled={ev.usages <= 1}
              className="w-5 h-5 text-xs bg-surface-3 hover:bg-surface-2 rounded text-fg-muted disabled:opacity-40"
              title="回数を減らす"
            >−</button>
            <span className="w-6 text-center font-mono text-accent font-medium">×{ev.usages}</span>
            <button
              type="button"
              onClick={() => onSetAttackUsages(ev.id, ev.usages + 1)}
              disabled={ev.usages >= 9}
              className="w-5 h-5 text-xs bg-surface-3 hover:bg-surface-2 rounded text-fg-muted disabled:opacity-40"
              title="回数を増やす"
            >+</button>
          </div>
          <span className="font-mono text-fg-muted">{subMin}〜{subMax}</span>
        </div>
      </TimelineRow>
    )
  }

  if (ev.kind === 'painSplit') {
    return (
      <TimelineRow {...rowProps} tone="accent">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-accent">↺ 痛み分け</span>
          <span
            className="text-fg-muted"
            title="その時点で追跡している攻撃側HP・防御側HPから自動計算します（手入力は不要）"
          >
            両者のHPを平均化（追跡中のHPで自動計算）
          </span>
        </div>
      </TimelineRow>
    )
  }

  if (ev.kind === 'incoming') {
    const hasMoveOptions = defenderMoveOptions.length > 0
    return (
      <TimelineRow {...rowProps} tone="warning">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-warning">攻撃側被ダメ</span>
          <select
            value={ev.moveName ?? ''}
            onChange={e => onUpdate({ moveName: e.target.value || null } as Partial<ProgressionEvent>)}
            className="input-base min-w-[8rem] max-w-full text-xs px-1 py-0.5"
            disabled={!hasMoveOptions}
          >
            <option value="">{hasMoveOptions ? '技を選択' : '防御側の技未設定'}</option>
            {defenderMoveOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          {!hasMoveOptions && (
            <span className="text-[10px] text-fg-faint">
              防御側の「攻撃側被ダメ用の技」から追加
            </span>
          )}
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={ev.crit}
              onChange={e => onUpdate({ crit: e.target.checked } as Partial<ProgressionEvent>)}
              className="accent-accent"
            />
            <span className="text-[10px] text-fg-muted">急所</span>
          </label>
        </div>
      </TimelineRow>
    )
  }

  if (ev.kind === 'setupTurn') {
    const sideLabel = ev.side === 'attacker' ? '攻撃側' : '防御側'
    return (
      <TimelineRow {...rowProps} tone="default">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <TurnChip turnRange={turnRange} />
          <span className="font-semibold text-fg-muted">{sideLabel}補助技</span>
          <input
            type="text"
            value={ev.label ?? ''}
            onChange={e => onUpdate({ label: e.target.value } as Partial<ProgressionEvent>)}
            placeholder="補助技名"
            className="input-base min-w-[7rem] max-w-full text-xs px-1 py-0.5"
          />
          <span className="text-[10px] text-fg-faint">ターン経過</span>
        </div>
      </TimelineRow>
    )
  }

  if (ev.kind === 'megaEvolve') {
    const sideLabel = ev.side === 'attacker' ? '攻撃側' : '防御側'
    const options = ev.side === 'attacker' ? attackerMegaOptions : defenderMegaOptions
    const selectedMega = options.find(m => m.key === ev.megaKey)
    return (
      <TimelineRow {...rowProps} tone="accent">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-accent">{sideLabel}メガシンカ</span>
          {options.length > 1 ? (
            <select
              value={ev.megaKey}
              onChange={e => onUpdate({ megaKey: e.target.value } as Partial<ProgressionEvent>)}
              className="input-base min-w-[8rem] max-w-full text-xs px-1 py-0.5"
            >
              {options.map(mega => <option key={mega.key} value={mega.key}>{mega.name}</option>)}
            </select>
          ) : (
            <span className="text-fg-muted">{selectedMega?.name ?? ev.megaKey}</span>
          )}
          <span className="text-[10px] text-fg-faint">以降メガ後で計算</span>
        </div>
      </TimelineRow>
    )
  }

  if (ev.kind === 'rearmBerry') {
    const sideLabel = ev.side === 'attacker' ? '攻撃側' : '防御側'
    return (
      <TimelineRow {...rowProps} tone="success">
        <span className="font-semibold text-success">リサイクル（{sideLabel}きのみ再装填）</span>
      </TimelineRow>
    )
  }

  if (ev.kind === 'leechSeed') {
    // レガシー表示専用（V3.18.0 でカタログ方式へ統合済み。挿入UIは撤去、既存イベントの表示のみ維持）
    const arrow = ev.direction === 'fromAttacker' ? '攻→防' : '防→攻'
    return (
      <TimelineRow {...rowProps} tone="success">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-success">宿り木 ({arrow})</span>
          <span className="text-[10px] text-fg-faint">
            {ev.direction === 'fromAttacker'
              ? '防御側 -1/8 → 攻撃側 +同量'
              : '攻撃側 -1/8 → 防御側 +同量'}
          </span>
        </div>
      </TimelineRow>
    )
  }

  // const / recover 系
  const labels: Record<string, { text: string; color: string }> = {
    defenderConst:   { text: '防御側ダメ', color: 'text-warning' },
    attackerConst:   { text: '攻撃側ダメ', color: 'text-warning' },
    defenderRecover: { text: '防御側回復', color: 'text-success' },
    attackerRecover: { text: '攻撃側回復', color: 'text-success' },
  }
  const meta = labels[ev.kind]
  // 回復イベントには再生技（つきのひかり等）用の天候プリセット（1/2・1/3・2/3）を表示
  const isRecover = ev.kind === 'defenderRecover' || ev.kind === 'attackerRecover'
  const recoverBaseHp = ev.kind === 'attackerRecover' ? attackerMaxHp : defenderMaxHp
  return (
    <TimelineRow {...rowProps} tone={isRecover ? 'success' : 'warning'}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`font-semibold ${meta.color}`}>{ev.label ?? meta.text}</span>
        {ev.source === 'background' && (
          <span className="rounded border border-accent-border bg-accent-bg px-1 py-0.5 text-[10px] text-accent">
            背景
          </span>
        )}
        <input
          type="number"
          min={0}
          value={ev.amount}
          onChange={e => onUpdate({ amount: readNonNegative(e.target.value) } as Partial<ProgressionEvent>)}
          className="input-base w-16 text-center text-xs px-1 py-0.5"
        />
        {isRecover && recoverBaseHp > 0 && RECOVER_FRACTIONS.map(f => {
          const val = Math.floor(recoverBaseHp * f.num / f.den)
          return (
            <button
              key={f.label}
              type="button"
              onClick={() => onUpdate({ amount: val } as Partial<ProgressionEvent>)}
              className="text-[10px] px-1 py-0.5 rounded border border-edge text-fg-muted hover:border-success hover:text-success transition-colors"
              title={`再生技: ${f.label} 回復 (${val})${f.label === '1/2' ? ' = つきのひかり通常/じこさいせい等' : f.label === '1/3' ? ' = つきのひかり雨/砂/雪' : ' = つきのひかり晴'}`}
            >
              {f.label}<span className="ml-0.5 opacity-60">{val}</span>
            </button>
          )
        })}
      </div>
    </TimelineRow>
  )
}

function RowControls({
  idx, total, insertCtx, onInsertAfter, onMoveUp, onMoveDown, onRemove,
}: {
  idx: number
  total: number
  insertCtx: InsertEventCtx
  onInsertAfter: (key: string) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}) {
  const [insertOpen, setInsertOpen] = useState(false)
  const insertButtonRef = useRef<HTMLButtonElement>(null)

  function handleSelect(key: string) {
    setInsertOpen(false)
    onInsertAfter(key)
  }

  return (
    <div className="flex items-center gap-0.5 flex-shrink-0">
      <button
        ref={insertButtonRef}
        type="button"
        onClick={() => setInsertOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={insertOpen}
        className="w-5 h-5 text-xs bg-surface-3 hover:bg-surface-2 rounded text-fg-muted hover:text-accent transition-colors"
        aria-label="このイベントの直後に挿入"
        title="直後に挿入"
      >＋</button>
      {insertOpen && (
        <EventInsertPopover
          ctx={insertCtx}
          anchor={insertButtonRef}
          onSelect={handleSelect}
          onClose={() => setInsertOpen(false)}
        />
      )}
      <button
        type="button"
        onClick={onMoveUp}
        disabled={idx === 0}
        className="w-5 h-5 text-xs bg-surface-3 hover:bg-surface-2 rounded text-fg-muted disabled:opacity-30"
        aria-label="イベントを上へ移動"
        title="上へ"
      >↑</button>
      <button
        type="button"
        onClick={onMoveDown}
        disabled={idx === total - 1}
        className="w-5 h-5 text-xs bg-surface-3 hover:bg-surface-2 rounded text-fg-muted disabled:opacity-30"
        aria-label="イベントを下へ移動"
        title="下へ"
      >↓</button>
      <button
        type="button"
        onClick={onRemove}
        className="w-5 h-5 text-xs bg-surface-3 hover:bg-surface-2 rounded text-fg-faint hover:text-danger-2 transition-colors flex-shrink-0 ml-0.5"
        aria-label="イベントを削除"
        title="削除"
      >✕</button>
    </div>
  )
}
