import { useRef, useState } from 'react'
import { EventInsertGrid, type InsertEventCtx } from './EventInsertMenu'
import { PassiveDamageTab } from './PassiveDamageTab'
import { PassiveRecoverTab } from './PassiveRecoverTab'

export type ProgressionTabKey = 'events' | 'damage' | 'recover'

const TABS: { key: ProgressionTabKey; label: string }[] = [
  { key: 'events', label: 'イベント' },
  { key: 'damage', label: '定数ダメ' },
  { key: 'recover', label: '回復' },
]

export interface ProgressionTabsProps {
  ctx: InsertEventCtx
  /** イベントタブでアクションが選ばれたときに末尾追加する */
  onSelectEvent: (key: string) => void
  defenderMaxHp: number
  attackerMaxHp: number
}

/**
 * イベント時系列直下のタブ群（V3.18.0 フェーズB）。
 * イベント / 定数ダメ / 回復 の3タブ。定数ダメ・回復タブの中身はフェーズCまでスタブ。
 */
export function ProgressionTabs({ ctx, onSelectEvent, defenderMaxHp, attackerMaxHp }: ProgressionTabsProps) {
  const [active, setActive] = useState<ProgressionTabKey>('events')
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  function focusAndActivate(key: ProgressionTabKey) {
    setActive(key)
    tabRefs.current[key]?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (e.key) {
      case 'ArrowLeft': {
        e.preventDefault()
        const prev = TABS[(index - 1 + TABS.length) % TABS.length]
        focusAndActivate(prev.key)
        break
      }
      case 'ArrowRight': {
        e.preventDefault()
        const next = TABS[(index + 1) % TABS.length]
        focusAndActivate(next.key)
        break
      }
      case 'Home':
        e.preventDefault()
        focusAndActivate(TABS[0].key)
        break
      case 'End':
        e.preventDefault()
        focusAndActivate(TABS[TABS.length - 1].key)
        break
    }
  }

  return (
    <div className="space-y-2">
      <div
        role="tablist"
        aria-label="ダメージ進行タブ"
        className="flex items-stretch gap-1 overflow-x-auto border-b border-edge"
      >
        {TABS.map((tab, index) => {
          const isActive = tab.key === active
          return (
            <button
              key={tab.key}
              ref={node => { tabRefs.current[tab.key] = node }}
              type="button"
              role="tab"
              id={`progression-tab-${tab.key}`}
              aria-controls={`progression-tabpanel-${tab.key}`}
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActive(tab.key)}
              onKeyDown={e => handleKeyDown(e, index)}
              className={`flex-shrink-0 whitespace-nowrap px-3 py-1.5 text-xs font-medium border-b-2 outline-none transition-colors focus-visible:ring-1 focus-visible:ring-accent-border ${
                isActive
                  ? 'text-accent border-accent'
                  : 'text-fg-muted border-transparent hover:bg-surface-3'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={`progression-tabpanel-${active}`}
        aria-labelledby={`progression-tab-${active}`}
      >
        {active === 'events' && <EventInsertGrid ctx={ctx} onSelect={onSelectEvent} />}
        {active === 'damage' && <PassiveDamageTab defenderMaxHp={defenderMaxHp} attackerMaxHp={attackerMaxHp} />}
        {active === 'recover' && <PassiveRecoverTab defenderMaxHp={defenderMaxHp} attackerMaxHp={attackerMaxHp} />}
      </div>
    </div>
  )
}
