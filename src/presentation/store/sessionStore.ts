import { create } from 'zustand'
import {
  snapshotLiveState, restoreState, cloneSnapshot, type SessionSnapshot,
} from './sessionSnapshot'

export interface Tab {
  id: string
  name: string
  snapshot: SessionSnapshot
}

interface SessionStore {
  tabs: Tab[]
  activeTabId: string | null

  /** 初回マウント時に1つ目のタブを生成（ライブストアは initDefaults 済み前提） */
  initFirstTab: (name?: string) => void
  /** 現在のタブを保存して、新しいタブ（デフォルト盤面）を作成・切替 */
  createTab: () => void
  /** 指定タブを複製して新タブとして開く */
  duplicateTab: (id: string) => void
  /** タブ切替（現タブをスナップショット保存 → 対象タブを復元） */
  switchTab: (id: string) => void
  renameTab: (id: string, name: string) => void
  closeTab: (id: string) => void
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function nextTabName(tabs: Tab[]): string {
  return `タブ ${tabs.length + 1}`
}

/** 新規タブの初期盤面（最初のタブ生成時のライブ状態 = デフォルト盤面）*/
export const useSessionStore = create<SessionStore>((set, get) => ({
  tabs: [],
  activeTabId: null,

  initFirstTab: (name = 'タブ 1') => {
    if (get().tabs.length > 0) return
    const id = genId()
    set({ tabs: [{ id, name, snapshot: snapshotLiveState() }], activeTabId: id })
  },

  createTab: () => {
    // 追加前に表示されていたタブの計算状態を複製して引き継ぐ（計算の継続性）
    const { tabs, activeTabId } = get()
    const current = snapshotLiveState()
    const saved = tabs.map(t =>
      t.id === activeTabId ? { ...t, snapshot: current } : t
    )
    const snapshot = cloneSnapshot(current)
    const id = genId()
    const newTab: Tab = { id, name: nextTabName(tabs), snapshot }
    set({ tabs: [...saved, newTab], activeTabId: id })
    restoreState(snapshot)
  },

  duplicateTab: (id) => {
    const { tabs, activeTabId } = get()
    const source = tabs.find(t => t.id === id)
    if (!source) return
    const saved = tabs.map(t =>
      t.id === activeTabId ? { ...t, snapshot: snapshotLiveState() } : t
    )
    const snapshot = cloneSnapshot(source.snapshot)
    const newId = genId()
    const newTab: Tab = { id: newId, name: `${source.name} (コピー)`, snapshot }
    set({ tabs: [...saved, newTab], activeTabId: newId })
    restoreState(snapshot)
  },

  switchTab: (id) => {
    const { activeTabId, tabs } = get()
    if (id === activeTabId) return
    const target = tabs.find(t => t.id === id)
    if (!target) return
    const saved = tabs.map(t =>
      t.id === activeTabId ? { ...t, snapshot: snapshotLiveState() } : t
    )
    set({ tabs: saved, activeTabId: id })
    restoreState(target.snapshot)
  },

  renameTab: (id, name) => set(s => ({
    tabs: s.tabs.map(t => t.id === id ? { ...t, name: name.trim() || t.name } : t),
  })),

  closeTab: (id) => {
    const { tabs, activeTabId } = get()
    if (tabs.length <= 1) return
    const idx = tabs.findIndex(t => t.id === id)
    if (idx === -1) return
    const remaining = tabs.filter(t => t.id !== id)

    if (id !== activeTabId) {
      // 背景タブを閉じる: アクティブタブには現在のライブ状態を保存しておく
      set({
        tabs: remaining.map(t =>
          t.id === activeTabId ? { ...t, snapshot: snapshotLiveState() } : t
        ),
      })
      return
    }

    // アクティブタブを閉じる: 左隣（なければ先頭）へ切替
    const neighbor = remaining[idx - 1] ?? remaining[0]
    set({ tabs: remaining, activeTabId: neighbor.id })
    restoreState(neighbor.snapshot)
  },
}))
