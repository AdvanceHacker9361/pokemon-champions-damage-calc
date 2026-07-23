import { create } from 'zustand'
import { useAttackerStore } from './pokemonStore'
import {
  clonePokemonSnapshot, genId, type AttackerTab, type PokemonSnapshot,
} from './sessionSnapshot'

/** 攻撃側ポケモンタブの上限数 */
export const ATTACKER_TABS_MAX = 8

interface AttackerTabsStore {
  tabs: AttackerTab[]
  activeTabId: string | null

  /** tabs が空のときのみ、ライブ攻撃側から1つ目のタブを生成（冪等） */
  initIfEmpty: () => void
  /**
   * 新規タブを追加。上限到達時は何もしない。
   * ライブ攻撃側をアクティブタブへ保存してから、現ライブ内容を複製した
   * 新タブを作りアクティブにする（sessionStore.createTab の継続性慣例）。
   * ライブ攻撃側ストアはそのまま（新タブ内容と一致しているため復元不要）。
   */
  addTab: () => void
  /**
   * タブ切替。既にアクティブ or 不明な id のときは何もしない。
   * ライブ攻撃側を現アクティブタブへ保存してから、対象タブの内容を
   * ライブ攻撃側ストアへ復元する。
   */
  switchTab: (id: string) => void
  /**
   * タブを閉じる。残り1件のときは何もしない。
   * アクティブタブを閉じる場合はライブ状態を破棄し、左隣（無ければ先頭）を
   * アクティブにしてその内容をライブへ復元。非アクティブタブは削除のみ。
   */
  closeTab: (id: string) => void
  /** ライブUIに触れず、アクティブタブのスナップショットをライブ攻撃側で上書きする */
  saveActiveSnapshot: () => void
}

function liveAttackerSnapshot(): PokemonSnapshot {
  return clonePokemonSnapshot(useAttackerStore.getState())
}

export const useAttackerTabsStore = create<AttackerTabsStore>((set, get) => ({
  tabs: [],
  activeTabId: null,

  initIfEmpty: () => {
    if (get().tabs.length > 0) return
    const id = genId()
    set({ tabs: [{ id, snapshot: liveAttackerSnapshot() }], activeTabId: id })
  },

  addTab: () => {
    const { tabs, activeTabId } = get()
    if (tabs.length >= ATTACKER_TABS_MAX) return
    const live = liveAttackerSnapshot()
    const saved = tabs.map(t => t.id === activeTabId ? { ...t, snapshot: live } : t)
    const id = genId()
    const newTab: AttackerTab = { id, snapshot: clonePokemonSnapshot(live) }
    set({ tabs: [...saved, newTab], activeTabId: id })
    // ライブ攻撃側はそのまま（新タブ内容と一致）
  },

  switchTab: (id) => {
    const { tabs, activeTabId } = get()
    if (id === activeTabId) return
    const target = tabs.find(t => t.id === id)
    if (!target) return
    const saved = tabs.map(t =>
      t.id === activeTabId ? { ...t, snapshot: liveAttackerSnapshot() } : t
    )
    set({ tabs: saved, activeTabId: id })
    useAttackerStore.setState(clonePokemonSnapshot(target.snapshot))
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get()
    if (tabs.length <= 1) return
    const idx = tabs.findIndex(t => t.id === id)
    if (idx === -1) return
    const remaining = tabs.filter(t => t.id !== id)

    if (id !== activeTabId) {
      // 非アクティブタブ: ライブUIには触れず、現アクティブの編集を保存しつつ削除
      set({
        tabs: remaining.map(t =>
          t.id === activeTabId ? { ...t, snapshot: liveAttackerSnapshot() } : t
        ),
      })
      return
    }

    // アクティブタブ: ライブ状態を破棄し、左隣（無ければ先頭）へ切替・復元
    const neighbor = remaining[idx - 1] ?? remaining[0]
    set({ tabs: remaining, activeTabId: neighbor.id })
    useAttackerStore.setState(clonePokemonSnapshot(neighbor.snapshot))
  },

  saveActiveSnapshot: () => {
    const { tabs, activeTabId } = get()
    if (tabs.length === 0 || !activeTabId) return
    const live = liveAttackerSnapshot()
    set({ tabs: tabs.map(t => t.id === activeTabId ? { ...t, snapshot: live } : t) })
  },
}))
