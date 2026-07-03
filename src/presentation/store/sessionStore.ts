import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  snapshotLiveState, restoreState, cloneSnapshot, type SessionSnapshot,
} from './sessionSnapshot'

export interface Tab {
  id: string
  name: string
  memo: string
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
  updateMemo: (id: string, memo: string) => void
  closeTab: (id: string) => void
  /** タブ順を入れ替える（D&D用） */
  moveTab: (fromId: string, toId: string) => void
  /**
   * アクティブタブの snapshot をライブストアの最新状態で上書きする（ライブUIは変更しない）。
   * ページ離脱時（beforeunload/pagehide）に呼び出し、タブ切替を挟まずに行った編集が
   * リロードで失われないようにするためのもの。
   */
  saveActiveTabSnapshot: () => void
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function nextTabName(tabs: Tab[]): string {
  return `タブ ${tabs.length + 1}`
}

export const useSessionStore = create<SessionStore>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,

      initFirstTab: (name = 'タブ 1') => {
        if (get().tabs.length > 0) return
        const id = genId()
        set({ tabs: [{ id, name, memo: '', snapshot: snapshotLiveState() }], activeTabId: id })
      },

      createTab: () => {
        const { tabs, activeTabId } = get()
        const current = snapshotLiveState()
        const saved = tabs.map(t =>
          t.id === activeTabId ? { ...t, snapshot: current } : t
        )
        const snapshot = cloneSnapshot(current)
        const id = genId()
        const newTab: Tab = { id, name: nextTabName(tabs), memo: '', snapshot }
        set({ tabs: [...saved, newTab], activeTabId: id })
        restoreState(snapshot)
      },

      duplicateTab: (id) => {
        const { tabs, activeTabId } = get()
        const source = tabs.find(t => t.id === id)
        if (!source) return
        // アクティブタブの tabs 配列内 snapshot は前回のタブ切替時点のものであり、
        // 最新のライブ編集を反映していない。まずライブ状態を取得し、
        // 複製元がアクティブタブ自身の場合はそれを複製元として使う
        // （そうしないと複製内容が古くなる上、末尾の restoreState でライブUIが
        // 巻き戻ってしまう）。
        const currentLive = id === activeTabId ? snapshotLiveState() : null
        const baseSnapshot = currentLive ?? source.snapshot
        const saved = tabs.map(t =>
          t.id === activeTabId ? { ...t, snapshot: currentLive ?? snapshotLiveState() } : t
        )
        const snapshot = cloneSnapshot(baseSnapshot)
        const newId = genId()
        const newTab: Tab = { id: newId, name: `${source.name} (コピー)`, memo: source.memo ?? '', snapshot }
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

      updateMemo: (id, memo) => set(s => ({
        tabs: s.tabs.map(t => t.id === id ? { ...t, memo } : t),
      })),

      closeTab: (id) => {
        const { tabs, activeTabId } = get()
        if (tabs.length <= 1) return
        const idx = tabs.findIndex(t => t.id === id)
        if (idx === -1) return
        const remaining = tabs.filter(t => t.id !== id)

        if (id !== activeTabId) {
          set({
            tabs: remaining.map(t =>
              t.id === activeTabId ? { ...t, snapshot: snapshotLiveState() } : t
            ),
          })
          return
        }

        const neighbor = remaining[idx - 1] ?? remaining[0]
        set({ tabs: remaining, activeTabId: neighbor.id })
        restoreState(neighbor.snapshot)
      },

      moveTab: (fromId, toId) => {
        const { tabs } = get()
        const fromIdx = tabs.findIndex(t => t.id === fromId)
        const toIdx = tabs.findIndex(t => t.id === toId)
        if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return
        const next = [...tabs]
        const [moved] = next.splice(fromIdx, 1)
        next.splice(toIdx, 0, moved)
        set({ tabs: next })
      },

      saveActiveTabSnapshot: () => {
        const { tabs, activeTabId } = get()
        if (tabs.length === 0 || !activeTabId) return
        const current = snapshotLiveState()
        set({
          tabs: tabs.map(t => t.id === activeTabId ? { ...t, snapshot: current } : t),
        })
      },
    }),
    {
      name: 'pcma-session-v1',
      onRehydrateStorage: () => (state) => {
        if (!state?.activeTabId) return
        const active = state.tabs.find(t => t.id === state.activeTabId)
        if (active) restoreState(active.snapshot)
      },
    }
  )
)

// ページ離脱時（リロード・タブクローズ・端末スリープ等）にライブ編集をアクティブタブへ
// 保存する。タブ切替を伴わない編集はこれまで tabs 配列（＝localStorage 永続化対象）に
// 反映されるタイミングがなく、リロードで失われていた。
// `beforeunload` はデスクトップ、`pagehide` はモバイル Safari 等の BFCache 環境向け。
// zustand persist は localStorage 使用時 set() の都度、同期的に書き込むため
// 非同期処理を待つ必要はない。
// モジュール読み込みは一度きりだが、開発時の HMR や StrictMode の二重実行に備えて
// モジュールスコープのフラグで多重登録を防止する。
let unloadListenerRegistered = false

function saveActiveTabOnUnload(): void {
  const { tabs, activeTabId } = useSessionStore.getState()
  // initFirstTab 前（tabs が空）に発火した場合は何もしない
  if (tabs.length === 0 || !activeTabId) return
  useSessionStore.getState().saveActiveTabSnapshot()
}

export function registerSessionUnloadListener(): void {
  if (unloadListenerRegistered) return
  if (typeof window === 'undefined') return
  unloadListenerRegistered = true
  window.addEventListener('beforeunload', saveActiveTabOnUnload)
  window.addEventListener('pagehide', saveActiveTabOnUnload)
}
