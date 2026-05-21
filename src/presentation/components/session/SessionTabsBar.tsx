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
    <div className="flex items-stretch gap-1 overflow-x-auto mb-3 pb-1 border-b border-slate-200 dark:border-slate-800">
      {tabs.map(tab => {
        const isActive = tab.id === activeTabId
        return (
          <div
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            className={`group flex items-center gap-1 px-2.5 py-1 rounded-t text-xs cursor-pointer border border-b-0 transition-colors flex-shrink-0 ${
              isActive
                ? 'bg-blue-600 dark:bg-blue-700 border-blue-500 dark:border-blue-600 text-white'
                : 'text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-600 hover:border-slate-500 dark:hover:border-slate-500'
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
                className="input-base w-24 px-1 py-0 text-xs text-slate-900 dark:text-slate-100"
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
                className={`leading-none rounded px-1 ${
                  isActive ? 'hover:bg-blue-500' : 'hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
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
        className="flex-shrink-0 px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-slate-500 dark:hover:border-slate-500 transition-colors"
        title="新しいタブ"
      >
        ＋
      </button>
    </div>
  )
}
