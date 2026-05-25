import { useEffect } from 'react'
import { useSessionStore } from '@/presentation/store/sessionStore'

function isEditable(target: EventTarget | null): boolean {
  if (!target) return false
  const el = target as HTMLElement
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

export function useKeyboardShortcuts(onSwap: () => void) {
  const activeTabId = useSessionStore(s => s.activeTabId)
  const duplicateTab = useSessionStore(s => s.duplicateTab)
  const closeTab = useSessionStore(s => s.closeTab)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const cmd = e.metaKey || e.ctrlKey

      if (cmd && e.key === 'd') {
        e.preventDefault()
        if (activeTabId) duplicateTab(activeTabId)
        return
      }
      if (cmd && e.key === 'w') {
        e.preventDefault()
        if (activeTabId) closeTab(activeTabId)
        return
      }
      if (cmd && e.key === 'k') {
        e.preventDefault()
        document.dispatchEvent(new CustomEvent('kb:focus-pokemon-search'))
        return
      }

      if (isEditable(e.target)) return

      if (e.key === 's' || e.key === 'S') {
        onSwap()
        return
      }

      const slot = Number(e.key) - 1
      if (slot >= 0 && slot <= 3) {
        document.dispatchEvent(new CustomEvent('kb:focus-move', { detail: { slot } }))
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [activeTabId, duplicateTab, closeTab, onSwap])
}
