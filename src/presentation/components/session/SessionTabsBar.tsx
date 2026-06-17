import { useState, useRef } from 'react'
import { useSessionStore } from '@/presentation/store/sessionStore'
import type { Tab } from '@/presentation/store/sessionStore'

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
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

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
    openMenuAt(id, e.clientX, e.clientY)
  }

  function openTabMenu(e: React.MouseEvent<HTMLButtonElement>, id: string) {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    openMenuAt(id, rect.left, rect.bottom + 4)
  }

  function openMenuAt(id: string, x: number, y: number) {
    const menuWidth = 160
    const menuHeight = 220
    const left = Math.min(x, window.innerWidth - menuWidth - 8)
    const top = Math.min(y, window.innerHeight - menuHeight - 8)
    setContextMenu({ id, x: Math.max(8, left), y: Math.max(8, top) })
  }

  function focusTab(id: string) {
    window.setTimeout(() => {
      const tab = tabRefs.current[id]
      tab?.focus()
      tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }, 0)
  }

  function focusActiveTab() {
    window.setTimeout(() => {
      const id = useSessionStore.getState().activeTabId
      if (id) focusTab(id)
    }, 0)
  }

  function switchAndFocus(id: string) {
    switchTab(id)
    focusTab(id)
  }

  function handleTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, tab: Tab, index: number) {
    if (editingId === tab.id) return

    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault()
        switchTab(tab.id)
        break
      case 'ArrowLeft': {
        e.preventDefault()
        const prev = tabs[(index - 1 + tabs.length) % tabs.length]
        if (prev) switchAndFocus(prev.id)
        break
      }
      case 'ArrowRight': {
        e.preventDefault()
        const next = tabs[(index + 1) % tabs.length]
        if (next) switchAndFocus(next.id)
        break
      }
      case 'Home': {
        e.preventDefault()
        const first = tabs[0]
        if (first) switchAndFocus(first.id)
        break
      }
      case 'End': {
        e.preventDefault()
        const last = tabs[tabs.length - 1]
        if (last) switchAndFocus(last.id)
        break
      }
      case 'F2':
        e.preventDefault()
        beginEdit(tab.id, tab.name)
        break
      case 'ContextMenu':
        e.preventDefault()
        openMenuAt(tab.id, e.currentTarget.getBoundingClientRect().left, e.currentTarget.getBoundingClientRect().bottom + 4)
        break
      case 'Delete':
      case 'Backspace':
        if (tabs.length > 1) {
          e.preventDefault()
          closeTab(tab.id)
          focusActiveTab()
        }
        break
    }

    if (e.key === 'F10' && e.shiftKey) {
      e.preventDefault()
      const rect = e.currentTarget.getBoundingClientRect()
      openMenuAt(tab.id, rect.left, rect.bottom + 4)
    }
  }

  function handleCreateTab() {
    createTab()
    focusActiveTab()
  }

  function handleDuplicateTab(id: string) {
    duplicateTab(id)
    setContextMenu(null)
    focusActiveTab()
  }

  function handleCloseTab(id: string) {
    closeTab(id)
    setContextMenu(null)
    focusActiveTab()
  }

  function moveTabByOffset(id: string, offset: -1 | 1) {
    const index = tabs.findIndex(t => t.id === id)
    const target = tabs[index + offset]
    if (!target) return
    moveTab(id, target.id)
    setContextMenu(null)
    focusTab(id)
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
      <div
        role="tablist"
        aria-label="計算タブ"
        className="flex items-stretch gap-1 overflow-x-auto mb-3 pb-1 border-b border-edge"
      >
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              role="presentation"
              draggable={editingId !== tab.id}
              onContextMenu={e => handleContextMenu(e, tab.id)}
              onDragStart={e => handleDragStart(e, tab.id)}
              onDragOver={e => handleDragOver(e, tab.id)}
              onDrop={e => handleDrop(e, tab.id)}
              onDragEnd={() => { dragId.current = null }}
              className={`group flex items-center gap-1 rounded-md border-b-2 transition-colors flex-shrink-0 select-none ${
                isActive
                  ? 'bg-accent-bg border-accent'
                  : 'border-transparent hover:bg-surface-3'
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
                  className="input-base mx-2 my-1 w-28 px-1 py-0 text-[13px]"
                />
              ) : (
                <button
                  ref={node => { tabRefs.current[tab.id] = node }}
                  type="button"
                  role="tab"
                  tabIndex={isActive ? 0 : -1}
                  aria-selected={isActive}
                  aria-label={`${tab.name}${isActive ? '、選択中' : ''}`}
                  onClick={() => switchTab(tab.id)}
                  onKeyDown={e => handleTabKeyDown(e, tab, index)}
                  onDoubleClick={e => { e.stopPropagation(); beginEdit(tab.id, tab.name) }}
                  className={`whitespace-nowrap px-3 py-1.5 text-[13px] font-medium outline-none focus-visible:ring-1 focus-visible:ring-accent-border ${
                    isActive ? 'text-accent' : 'text-fg-muted'
                  }`}
                  title="ダブルクリックで名前を変更"
                >
                  {tab.name}
                </button>
              )}
              {tabs.length > 1 && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); handleCloseTab(tab.id) }}
                  className="leading-none rounded px-1 text-fg-subtle hover:text-fg-muted hover:bg-surface-2"
                  title="タブを閉じる"
                  aria-label={`${tab.name}を閉じる`}
                >
                  ×
                </button>
              )}
              <button
                type="button"
                onClick={e => openTabMenu(e, tab.id)}
                className="leading-none rounded px-1 text-fg-subtle hover:text-fg-muted hover:bg-surface-2"
                title="タブ操作"
                aria-label={`${tab.name}の操作メニュー`}
              >
                …
              </button>
            </div>
          )
        })}
        <button
          type="button"
          onClick={handleCreateTab}
          className="flex-shrink-0 px-2.5 py-1.5 text-[13px] rounded-md border border-edge text-fg-muted hover:bg-surface-3 transition-colors"
          title="新しいタブ"
          aria-label="新しいタブを作成"
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
            role="menu"
            className="fixed z-50 bg-surface-1 border border-edge rounded-lg shadow-sm py-1 min-w-[140px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              type="button"
              role="menuitem"
              className="w-full text-left px-3 py-1.5 text-[13px] text-fg-muted hover:bg-surface-3 hover:text-fg transition-colors"
              onClick={() => { beginEdit(contextMenu.id, tabs.find(t => t.id === contextMenu.id)?.name ?? '') }}
            >
              名前を変更
            </button>
            <button
              type="button"
              role="menuitem"
              className="w-full text-left px-3 py-1.5 text-[13px] text-fg-muted hover:bg-surface-3 hover:text-fg transition-colors"
              onClick={() => handleDuplicateTab(contextMenu.id)}
            >
              複製
            </button>
            {(() => {
              const tabIndex = tabs.findIndex(t => t.id === contextMenu.id)
              return (
                <>
                  <div className="border-t border-edge my-1" />
                  <button
                    type="button"
                    role="menuitem"
                    disabled={tabIndex <= 0}
                    className="w-full text-left px-3 py-1.5 text-[13px] text-fg-muted hover:bg-surface-3 hover:text-fg transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg-muted"
                    onClick={() => moveTabByOffset(contextMenu.id, -1)}
                  >
                    左へ移動
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={tabIndex === -1 || tabIndex >= tabs.length - 1}
                    className="w-full text-left px-3 py-1.5 text-[13px] text-fg-muted hover:bg-surface-3 hover:text-fg transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg-muted"
                    onClick={() => moveTabByOffset(contextMenu.id, 1)}
                  >
                    右へ移動
                  </button>
                </>
              )
            })()}
            {tabs.length > 1 && (
              <>
                <div className="border-t border-edge my-1" />
                <button
                  type="button"
                  role="menuitem"
                  className="w-full text-left px-3 py-1.5 text-[13px] text-danger-2 hover:bg-surface-3 transition-colors"
                  onClick={() => handleCloseTab(contextMenu.id)}
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
