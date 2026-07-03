import type { ReactNode } from 'react'
import type { ProgressionEvent, EventKind } from '@/presentation/store/progressionStore'
import type { MegaPokemonRecord } from '@/data/schemas/types'

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
  attackerMaxHp: number
  defenderMaxHp: number
  defenderMoveOptions: string[]
  attackerMegaOptions: MegaPokemonRecord[]
  defenderMegaOptions: MegaPokemonRecord[]
  onSetAttackUsages: (id: string, usages: number) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onAddPainSplit: () => void
  onAddAfter: (kind: EventKind) => void
  onAddSetupTurn: (side: 'attacker' | 'defender') => void
  onAddMegaEvolve: (side: 'attacker' | 'defender') => void
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

function TimelineRow({
  idx, total, tone, isHighlighted, children,
  onMoveUp, onMoveDown, onRemove,
}: {
  idx: number
  total: number
  tone: TimelineRowTone
  isHighlighted: boolean
  children: ReactNode
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}) {
  return (
    <div className={`${timelineRowClass(tone)} transition-colors ${isHighlighted ? 'ring-1 ring-accent-border bg-accent-bg/40' : ''}`}>
      <span className="text-fg-faint text-right font-mono pt-0.5">{idx + 1}</span>
      <div className="min-w-0">{children}</div>
      <RowControls idx={idx} total={total} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onRemove={onRemove} />
    </div>
  )
}

export function EventRow({
  ev, idx, total,
  isHighlighted,
  attackerMaxHp, defenderMaxHp, defenderMoveOptions,
  attackerMegaOptions, defenderMegaOptions,
  onSetAttackUsages, onRemove, onMoveUp, onMoveDown, onAddPainSplit, onAddAfter, onAddSetupTurn, onAddMegaEvolve, onUpdate,
}: EventRowProps) {
  if (ev.kind === 'attack') {
    const subMin = ev.minDmg * ev.usages
    const subMax = ev.maxDmg * ev.usages
    return (
      <TimelineRow idx={idx} total={total} tone="attack" isHighlighted={isHighlighted} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onRemove={onRemove}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
          <button
            type="button"
            onClick={onAddPainSplit}
            className="text-[10px] px-1.5 py-0.5 rounded border border-edge text-fg-faint hover:border-accent hover:text-accent transition-colors"
            title="このエントリの直後に痛み分けを挿入"
          >+痛み分け</button>
          <button
            type="button"
            onClick={() => onAddAfter('defenderConst')}
            className="text-[10px] px-1.5 py-0.5 rounded border border-edge text-fg-faint hover:border-warning hover:text-warning transition-colors"
            title="このエントリの直後に防御側への定数ダメージを挿入"
          >+防ダメ</button>
          <button
            type="button"
            onClick={() => onAddAfter('defenderRecover')}
            className="text-[10px] px-1.5 py-0.5 rounded border border-edge text-fg-faint hover:border-success hover:text-success transition-colors"
            title="このエントリの直後に防御側の定数回復を挿入"
          >+防回復</button>
          <button
            type="button"
            onClick={() => onAddSetupTurn('defender')}
            className="text-[10px] px-1.5 py-0.5 rounded border border-edge text-fg-faint hover:border-accent hover:text-accent transition-colors"
            title="このエントリの直後に防御側の補助技ターンを挿入"
          >+防補助</button>
          <button
            type="button"
            onClick={() => onAddMegaEvolve('defender')}
            disabled={defenderMegaOptions.length === 0}
            className="text-[10px] px-1.5 py-0.5 rounded border border-edge text-fg-faint hover:border-accent hover:text-accent transition-colors disabled:opacity-30"
            title="このエントリの直後に防御側のメガシンカを挿入"
          >+防メガ</button>
        </div>
      </TimelineRow>
    )
  }

  if (ev.kind === 'painSplit') {
    return (
      <TimelineRow idx={idx} total={total} tone="accent" isHighlighted={isHighlighted} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onRemove={onRemove}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-accent">↺ 痛み分け</span>
          <span
            className="text-fg-muted"
            title="累積モードでの攻撃側HP（被ダメ等を含むシーケンス時は追跡中のHPが使われ、この値は無視されます）"
          >
            累積時HP
          </span>
          <input
            type="number"
            min={0}
            value={ev.attackerHp}
            onChange={e => onUpdate({ attackerHp: Math.max(0, Number(e.target.value)) } as Partial<ProgressionEvent>)}
            className="input-base w-14 text-center text-xs px-1"
            title="累積（被ダメなし）モードでのみ使用。シーケンス出力は両者の追跡HPで均します。"
          />
          {attackerMaxHp > 0 && (
            <span className="text-[10px] text-fg-faint">/ 最大{attackerMaxHp}</span>
          )}
        </div>
      </TimelineRow>
    )
  }

  if (ev.kind === 'incoming') {
    const hasMoveOptions = defenderMoveOptions.length > 0
    return (
      <TimelineRow idx={idx} total={total} tone="warning" isHighlighted={isHighlighted} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onRemove={onRemove}>
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
          <button
            type="button"
            onClick={() => onAddAfter('attackerConst')}
            className="text-[10px] px-1.5 py-0.5 rounded border border-edge text-fg-faint hover:border-warning hover:text-warning transition-colors"
            title="このエントリの直後に攻撃側への定数ダメージを挿入"
          >+攻ダメ</button>
          <button
            type="button"
            onClick={() => onAddAfter('attackerRecover')}
            className="text-[10px] px-1.5 py-0.5 rounded border border-edge text-fg-faint hover:border-success hover:text-success transition-colors"
            title="このエントリの直後に攻撃側の定数回復を挿入"
          >+攻回復</button>
          <button
            type="button"
            onClick={() => onAddSetupTurn('attacker')}
            className="text-[10px] px-1.5 py-0.5 rounded border border-edge text-fg-faint hover:border-accent hover:text-accent transition-colors"
            title="このエントリの直後に攻撃側の補助技ターンを挿入"
          >+攻補助</button>
          <button
            type="button"
            onClick={() => onAddMegaEvolve('attacker')}
            disabled={attackerMegaOptions.length === 0}
            className="text-[10px] px-1.5 py-0.5 rounded border border-edge text-fg-faint hover:border-accent hover:text-accent transition-colors disabled:opacity-30"
            title="このエントリの直後に攻撃側のメガシンカを挿入"
          >+攻メガ</button>
        </div>
      </TimelineRow>
    )
  }

  if (ev.kind === 'setupTurn') {
    const sideLabel = ev.side === 'attacker' ? '攻撃側' : '防御側'
    return (
      <TimelineRow idx={idx} total={total} tone="default" isHighlighted={isHighlighted} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onRemove={onRemove}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
      <TimelineRow idx={idx} total={total} tone="accent" isHighlighted={isHighlighted} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onRemove={onRemove}>
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
    return (
      <TimelineRow idx={idx} total={total} tone="success" isHighlighted={isHighlighted} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onRemove={onRemove}>
        <span className="font-semibold text-success">リサイクル（きのみ再装填）</span>
      </TimelineRow>
    )
  }

  if (ev.kind === 'leechSeed') {
    const arrow = ev.direction === 'fromAttacker' ? '攻→防' : '防→攻'
    return (
      <TimelineRow idx={idx} total={total} tone="success" isHighlighted={isHighlighted} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onRemove={onRemove}>
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
    <TimelineRow
      idx={idx}
      total={total}
      tone={isRecover ? 'success' : 'warning'}
      isHighlighted={isHighlighted}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      onRemove={onRemove}
    >
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

function RowControls({ idx, total, onMoveUp, onMoveDown, onRemove }: {
  idx: number; total: number; onMoveUp: () => void; onMoveDown: () => void; onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-0.5 flex-shrink-0">
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
