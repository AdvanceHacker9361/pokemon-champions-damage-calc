import { useEffect } from 'react'
import { useSessionStore } from '@/presentation/store/sessionStore'


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

      if (cmd && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        onSwap()
        return
      }

      const slot = Number(e.key) - 1
      if (cmd && slot >= 0 && slot <= 3) {
        e.preventDefault()
        document.dispatchEvent(new CustomEvent('kb:focus-move', { detail: { slot } }))
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [activeTabId, duplicateTab, closeTab, onSwap])
}
