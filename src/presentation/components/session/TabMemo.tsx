import { useState } from 'react'
import { useSessionStore } from '@/presentation/store/sessionStore'
import { AccumExportButton } from '@/presentation/components/results/AccumExportButton'

export function TabMemo() {
  const [isOpen, setIsOpen] = useState(false)
  const activeTabId = useSessionStore(s => s.activeTabId)
  const tabs = useSessionStore(s => s.tabs)
  const updateMemo = useSessionStore(s => s.updateMemo)

  const tab = tabs.find(t => t.id === activeTabId)
  const memo = tab?.memo ?? ''

  if (!activeTabId) return null

  const firstLine = memo.split('\n')[0]

  return (
    <div className="mb-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setIsOpen(v => !v)}
          className="flex items-center gap-1.5 text-xs text-fg-subtle hover:text-fg transition-colors"
        >
          <span className="text-[9px]">{isOpen ? '▼' : '▶'}</span>
          <span>メモ</span>
          {!isOpen && firstLine && (
            <span className="text-fg-faint truncate max-w-[240px]">{firstLine}</span>
          )}
        </button>
        <AccumExportButton />
      </div>
      {isOpen && (
        <textarea
          className="mt-1.5 w-full input-base text-xs font-mono resize-none leading-relaxed"
          rows={5}
          value={memo}
          onChange={e => updateMemo(activeTabId, e.target.value)}
          placeholder="メモを入力... (# 見出し, - リスト, `コード` など)"
          autoFocus
        />
      )}
    </div>
  )
}
