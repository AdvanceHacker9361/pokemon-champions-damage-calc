import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { EventKind } from '@/presentation/store/progressionStore'

/**
 * イベント挿入メニューの単一情報源（V3.18.0 フェーズB）。
 *
 * 「イベント時系列」へ新しいイベントを差し込むための全アクションを1か所で定義する。
 * - タブ（ProgressionTabs のイベントタブ）: `<EventInsertGrid>` で末尾追加
 * - 各行の「＋」ボタン: `<EventInsertPopover>` でそのイベント直後へ挿入
 * 両者は同じ `key` を `onSelect` に渡すだけで、実際のディスパッチ（addAfter/addSetupTurn/
 * addMegaEvolve への振り分け）は呼び出し側（DamageProgressionPanel）が1か所で担う。
 */

export type InsertEventGroup = 'turn' | 'manual'

export const INSERT_EVENT_GROUP_LABELS: Record<InsertEventGroup, string> = {
  turn: 'ターン進行',
  manual: '手動HP補正',
}

export interface InsertEventCtx {
  attackerCanMega: boolean
  defenderCanMega: boolean
}

/** 実際にディスパッチする際に必要な最小情報。呼び出し側の switch で分岐する。 */
export type InsertEventDispatch =
  | { type: 'event'; kind: EventKind }
  | { type: 'setupTurn'; side: 'attacker' | 'defender' }
  | { type: 'megaEvolve'; side: 'attacker' | 'defender' }

export interface InsertEventActionDef {
  key: string
  label: string
  group: InsertEventGroup
  tone: 'accent' | 'warning' | 'success'
  dispatch: InsertEventDispatch
  title?: string
  disabled: (ctx: InsertEventCtx) => boolean
}

const NEVER_DISABLED = () => false

export const INSERT_EVENT_ACTIONS: InsertEventActionDef[] = [
  // ---------- ターン進行 ----------
  {
    key: 'incoming',
    label: '＋攻撃側被ダメ',
    group: 'turn',
    tone: 'warning',
    dispatch: { type: 'event', kind: 'incoming' },
    disabled: NEVER_DISABLED,
  },
  {
    key: 'painSplit',
    label: '＋痛み分け',
    group: 'turn',
    tone: 'accent',
    dispatch: { type: 'event', kind: 'painSplit' },
    disabled: NEVER_DISABLED,
  },
  {
    key: 'setupTurn-attacker',
    label: '＋攻撃側補助',
    group: 'turn',
    tone: 'accent',
    dispatch: { type: 'setupTurn', side: 'attacker' },
    title: '攻撃側が積み技などの補助技を使うターンを時系列に追加',
    disabled: NEVER_DISABLED,
  },
  {
    key: 'setupTurn-defender',
    label: '＋防御側補助',
    group: 'turn',
    tone: 'accent',
    dispatch: { type: 'setupTurn', side: 'defender' },
    title: '防御側が積み技などの補助技を使うターンを時系列に追加',
    disabled: NEVER_DISABLED,
  },
  {
    key: 'megaEvolve-attacker',
    label: '＋攻撃側メガ',
    group: 'turn',
    tone: 'accent',
    dispatch: { type: 'megaEvolve', side: 'attacker' },
    title: 'この時点以降、攻撃側をメガシンカ後のステータス・特性として扱います',
    disabled: ctx => !ctx.attackerCanMega,
  },
  {
    key: 'megaEvolve-defender',
    label: '＋防御側メガ',
    group: 'turn',
    tone: 'accent',
    dispatch: { type: 'megaEvolve', side: 'defender' },
    title: 'この時点以降、防御側をメガシンカ後のステータス・特性として扱います',
    disabled: ctx => !ctx.defenderCanMega,
  },
  {
    key: 'rearmBerry',
    label: '＋リサイクル',
    group: 'turn',
    tone: 'success',
    dispatch: { type: 'event', kind: 'rearmBerry' },
    title: '消費済みのきのみを再装填し、直後の与ダメで再びきのみが発動できるようにする',
    disabled: NEVER_DISABLED,
  },
  // ---------- 手動HP補正 ----------
  {
    key: 'defenderConst',
    label: '＋防御側ダメ',
    group: 'manual',
    tone: 'warning',
    dispatch: { type: 'event', kind: 'defenderConst' },
    disabled: NEVER_DISABLED,
  },
  {
    key: 'defenderRecover',
    label: '＋防御側回復',
    group: 'manual',
    tone: 'success',
    dispatch: { type: 'event', kind: 'defenderRecover' },
    disabled: NEVER_DISABLED,
  },
  {
    key: 'attackerConst',
    label: '＋攻撃側ダメ',
    group: 'manual',
    tone: 'warning',
    dispatch: { type: 'event', kind: 'attackerConst' },
    disabled: NEVER_DISABLED,
  },
  {
    key: 'attackerRecover',
    label: '＋攻撃側回復',
    group: 'manual',
    tone: 'success',
    dispatch: { type: 'event', kind: 'attackerRecover' },
    disabled: NEVER_DISABLED,
  },
]

export const INSERT_EVENT_GROUPS: InsertEventGroup[] = ['turn', 'manual']

export function findInsertEventAction(key: string): InsertEventActionDef | undefined {
  return INSERT_EVENT_ACTIONS.find(a => a.key === key)
}

// ---------------------------------------------------------------------------
// 見た目
// ---------------------------------------------------------------------------

const BUTTON_BASE = 'text-[11px] px-1.5 py-0.5 rounded border border-edge text-fg-muted transition-colors whitespace-nowrap disabled:opacity-30 disabled:pointer-events-none'

function toneClass(tone: InsertEventActionDef['tone']) {
  switch (tone) {
    case 'warning':
      return 'hover:border-warning hover:text-warning'
    case 'success':
      return 'hover:border-success hover:text-success'
    case 'accent':
    default:
      return 'hover:border-accent hover:text-accent'
  }
}

// ---------------------------------------------------------------------------
// タブ用: インライングリッド（末尾追加）
// ---------------------------------------------------------------------------

export function EventInsertGrid({
  ctx,
  onSelect,
}: {
  ctx: InsertEventCtx
  onSelect: (key: string) => void
}) {
  return (
    <div className="space-y-2">
      {INSERT_EVENT_GROUPS.map(group => (
        <div key={group} className="flex items-start gap-2">
          <div className="w-16 flex-shrink-0 pt-0.5">
            <div className="text-[11px] font-medium text-fg-muted leading-tight">
              {INSERT_EVENT_GROUP_LABELS[group]}
            </div>
          </div>
          <div className="flex flex-wrap gap-1 min-w-0">
            {INSERT_EVENT_ACTIONS.filter(a => a.group === group).map(action => (
              <button
                key={action.key}
                type="button"
                onClick={() => onSelect(action.key)}
                disabled={action.disabled(ctx)}
                className={`${BUTTON_BASE} ${toneClass(action.tone)}`}
                title={action.title}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 行内「＋」用: ポップオーバー（直後挿入）
// ---------------------------------------------------------------------------

const POPOVER_WIDTH = 220
const VIEWPORT_MARGIN = 8

export function EventInsertPopover({
  ctx,
  onSelect,
  onClose,
  anchor,
}: {
  ctx: InsertEventCtx
  onSelect: (key: string) => void
  onClose: () => void
  /** ポップオーバーの基準位置となる要素（通常は開いた「＋」ボタン） */
  anchor: React.RefObject<HTMLElement | null>
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  const enabledActions = INSERT_EVENT_ACTIONS.filter(a => !a.disabled(ctx))

  useLayoutEffect(() => {
    const el = anchor.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const left = Math.min(rect.right - POPOVER_WIDTH, window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN)
    const top = rect.bottom + 4
    setPos({ left: Math.max(VIEWPORT_MARGIN, left), top })
  }, [anchor])

  useEffect(() => {
    itemRefs.current[0]?.focus()
  }, [])

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node
      if (menuRef.current?.contains(target)) return
      if (anchor.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [anchor, onClose])

  function focusIndex(i: number) {
    const clamped = (i + enabledActions.length) % enabledActions.length
    itemRefs.current[clamped]?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent, index: number) {
    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        onClose()
        break
      case 'ArrowDown':
        e.preventDefault()
        focusIndex(index + 1)
        break
      case 'ArrowUp':
        e.preventDefault()
        focusIndex(index - 1)
        break
      case 'Home':
        e.preventDefault()
        focusIndex(0)
        break
      case 'End':
        e.preventDefault()
        focusIndex(enabledActions.length - 1)
        break
      case 'Tab':
        onClose()
        break
    }
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="イベントを挿入"
      className="fixed z-50 rounded-lg border border-edge bg-surface-1 shadow-lg py-1.5 px-1.5"
      style={{
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        width: POPOVER_WIDTH,
        maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`,
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      {INSERT_EVENT_GROUPS.map(group => {
        const groupActions = INSERT_EVENT_ACTIONS.filter(a => a.group === group)
        return (
          <div key={group} className="mb-1 last:mb-0">
            <div className="px-1.5 py-0.5 text-[10px] font-medium text-fg-faint">
              {INSERT_EVENT_GROUP_LABELS[group]}
            </div>
            <div className="flex flex-col">
              {groupActions.map(action => {
                const disabled = action.disabled(ctx)
                const enabledIndex = enabledActions.indexOf(action)
                return (
                  <button
                    key={action.key}
                    ref={node => { if (enabledIndex >= 0) itemRefs.current[enabledIndex] = node }}
                    type="button"
                    role="menuitem"
                    disabled={disabled}
                    tabIndex={-1}
                    onClick={() => onSelect(action.key)}
                    onKeyDown={e => enabledIndex >= 0 && handleKeyDown(e, enabledIndex)}
                    title={action.title}
                    className={`text-left text-[12px] px-1.5 py-1 rounded transition-colors text-fg-muted hover:bg-surface-3 disabled:opacity-30 disabled:pointer-events-none focus-visible:outline-none focus-visible:bg-surface-3 ${toneClass(action.tone)}`}
                  >
                    {action.label}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
