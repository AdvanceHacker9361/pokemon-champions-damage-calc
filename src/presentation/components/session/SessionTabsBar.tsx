import { useState, useRef } from 'react'
import { useSessionStore } from '@/presentation/store/sessionStore'

export function SessionTabsBar() {
  const tabs = useSessionStore(s => s.tabs)
  const activeTabId = useSessionStore(s => s.activeTabId)
  const switchTab = useSessionStore(s => s.switchTab)
  const createTab = useSessionStore(s => s.createTab)
  const closeTab = useSessionStore(s => s.closeTab)
  const renameTab = useSessionStore(s => s.renameTab)
  const duplicateTab = useSessionStore(s => s.duplicateTab)
  const moveTab = useSessionStore(s => s.moveTab)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null)

  const dragId = useRef<string | null>(null)

  function beginEdit(id: string, name: string) {
    setEditingId(id)
    setDraft(name)
    setContextMenu(null)
  }

  function commitEdit(id: string) {
    renameTab(id, draft)
    setEditingId(null)
  }

  function handleContextMenu(e: React.MouseEvent, id: string) {
    e.preventDefault()
    setContextMenu({ id, x: e.clientX, y: e.clientY })
  }

  function handleDragStart(e: React.DragEvent, id: string) {
    dragId.current = id
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault()
    if (dragId.current && dragId.current !== id) {
      e.dataTransfer.dropEffect = 'move'
    }
  }

  function handleDrop(e: React.DragEvent, id: string) {
    e.preventDefault()
    if (dragId.current && dragId.current !== id) {
      moveTab(dragId.current, id)
    }
    dragId.current = null
  }

  if (tabs.length === 0) return null

  return (
    <>
      <div className="flex items-stretch gap-1 overflow-x-auto mb-3 pb-1 border-b border-edge">
        {tabs.map(tab => {
          const isActive = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              draggable
              onClick={() => switchTab(tab.id)}
              onContextMenu={e => handleContextMenu(e, tab.id)}
              onDragStart={e => handleDragStart(e, tab.id)}
              onDragOver={e => handleDragOver(e, tab.id)}
              onDrop={e => handleDrop(e, tab.id)}
              onDragEnd={() => { dragId.current = null }}
              className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium cursor-pointer border-b-2 transition-colors flex-shrink-0 select-none ${
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
                  className="whitespace-nowrap"
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

      {/* 右クリックコンテキストメニュー */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
            onContextMenu={e => { e.preventDefault(); setContextMenu(null) }}
          />
          <div
            className="fixed z-50 bg-surface-1 border border-edge rounded-lg shadow-sm py-1 min-w-[140px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 text-[13px] text-fg-muted hover:bg-surface-3 hover:text-fg transition-colors"
              onClick={() => { beginEdit(contextMenu.id, tabs.find(t => t.id === contextMenu.id)?.name ?? '') }}
            >
              名前を変更
            </button>
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 text-[13px] text-fg-muted hover:bg-surface-3 hover:text-fg transition-colors"
              onClick={() => { duplicateTab(contextMenu.id); setContextMenu(null) }}
            >
              複製
            </button>
            {tabs.length > 1 && (
              <>
                <div className="border-t border-edge my-1" />
                <button
                  type="button"
                  className="w-full text-left px-3 py-1.5 text-[13px] text-danger-2 hover:bg-surface-3 transition-colors"
                  onClick={() => { closeTab(contextMenu.id); setContextMenu(null) }}
                >
                  閉じる
                </button>
              </>
            )}
          </div>
        </>
      )}
    </>
  )
}
