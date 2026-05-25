import { useState } from 'react'
import { useSessionStore } from '@/presentation/store/sessionStore'

export function SessionTabsBar() {
  const tabs = useSessionStore(s => s.tabs)
  const activeTabId = useSessionStore(s => s.activeTabId)
  const switchTab = useSessionStore(s => s.switchTab)
  const createTab = useSessionStore(s => s.createTab)
  const closeTab = useSessionStore(s => s.closeTab)
  const renameTab = useSessionStore(s => s.renameTab)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  function beginEdit(id: string, name: string) {
    setEditingId(id)
    setDraft(name)
  }

  function commitEdit(id: string) {
    renameTab(id, draft)
    setEditingId(null)
  }

  if (tabs.length === 0) return null

  return (
    <div className="flex items-stretch gap-1 overflow-x-auto mb-3 pb-1 border-b border-edge">
      {tabs.map(tab => {
        const isActive = tab.id === activeTabId
        return (
          <div
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium cursor-pointer border-b-2 transition-colors flex-shrink-0 ${
              isActive
                ? 'bg-accent-bg text-accent border-accent'
                : 'text-fg-muted border-transparent hover:bg-surface-3'
            }`}
          >
            {editingId === tab.id ? (
              <input
                autoFocus
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={() => commitEdit(tab.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitEdit(tab.id)
                  if (e.key === 'Escape') setEditingId(null)
                }}
                onClick={e => e.stopPropagation()}
                className="input-base w-28 px-1 py-0 text-[13px]"
              />
            ) : (
              <span
                onDoubleClick={e => { e.stopPropagation(); beginEdit(tab.id, tab.name) }}
                className="select-none whitespace-nowrap"
                title="ダブルクリックで名前を変更"
              >
                {tab.name}
              </span>
            )}
            {tabs.length > 1 && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); closeTab(tab.id) }}
                className="leading-none rounded px-1 text-fg-subtle hover:text-fg-muted hover:bg-surface-2"
                title="タブを閉じる"
              >
                ×
              </button>
            )}
          </div>
        )
      })}
      <button
        type="button"
        onClick={createTab}
        className="flex-shrink-0 px-2.5 py-1.5 text-[13px] rounded-md border border-edge text-fg-muted hover:bg-surface-3 transition-colors"
        title="新しいタブ"
      >
        ＋
      </button>
    </div>
  )
}
