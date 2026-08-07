import { create } from 'zustand'
import { useAttackerStore, useDefenderStore } from './pokemonStore'
import {
  clonePokemonSnapshot, genId, type PokemonTab, type PokemonSnapshot,
} from './sessionSnapshot'

/** ポケモンタブの上限数（攻撃側・防御側とも共通） */
export const POKEMON_TABS_MAX = 8

/** 攻撃側・防御側のライブポケモンストア（zustand フック） */
type PokemonStoreHook = typeof useAttackerStore

export interface PokemonTabsStore {
  tabs: PokemonTab[]
  activeTabId: string | null

  /** tabs が空のときのみ、対応するライブストアから1つ目のタブを生成（冪等） */
  initIfEmpty: () => void
  /**
   * 新規タブを追加。上限到達時は何もしない。
   * ライブ状態をアクティブタブへ保存してから、現ライブ内容を複製した
   * 新タブを作りアクティブにする（sessionStore.createTab の継続性慣例）。
   * ライブストアはそのまま（新タブ内容と一致しているため復元不要）。
   */
  addTab: () => void
  /**
   * タブ切替。既にアクティブ or 不明な id のときは何もしない。
   * ライブ状態を現アクティブタブへ保存してから、対象タブの内容を
   * ライブストアへ復元する。
   */
  switchTab: (id: string) => void
  /**
   * タブを閉じる。残り1件のときは何もしない。
   * アクティブタブを閉じる場合はライブ状態を破棄し、左隣（無ければ先頭）を
   * アクティブにしてその内容をライブへ復元。非アクティブタブは削除のみ。
   */
  closeTab: (id: string) => void
  /** ライブUIに触れず、アクティブタブのスナップショットをライブ状態で上書きする */
  saveActiveSnapshot: () => void
}

/** 指定のライブポケモンストアに束ねたタブストアを生成する */
export function createPokemonTabsStore(pokemonStore: PokemonStoreHook) {
  const liveSnapshot = (): PokemonSnapshot =>
    clonePokemonSnapshot(pokemonStore.getState())

  return create<PokemonTabsStore>((set, get) => ({
    tabs: [],
    activeTabId: null,

    initIfEmpty: () => {
      if (get().tabs.length > 0) return
      const id = genId()
      set({ tabs: [{ id, snapshot: liveSnapshot() }], activeTabId: id })
    },

    addTab: () => {
      const { tabs, activeTabId } = get()
      if (tabs.length >= POKEMON_TABS_MAX) return
      const live = liveSnapshot()
      const saved = tabs.map(t => t.id === activeTabId ? { ...t, snapshot: live } : t)
      const id = genId()
      const newTab: PokemonTab = { id, snapshot: clonePokemonSnapshot(live) }
      set({ tabs: [...saved, newTab], activeTabId: id })
      // ライブストアはそのまま（新タブ内容と一致）
    },

    switchTab: (id) => {
      const { tabs, activeTabId } = get()
      if (id === activeTabId) return
      const target = tabs.find(t => t.id === id)
      if (!target) return
      const saved = tabs.map(t =>
        t.id === activeTabId ? { ...t, snapshot: liveSnapshot() } : t
      )
      set({ tabs: saved, activeTabId: id })
      pokemonStore.setState(clonePokemonSnapshot(target.snapshot))
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
            t.id === activeTabId ? { ...t, snapshot: liveSnapshot() } : t
          ),
        })
        return
      }

      // アクティブタブ: ライブ状態を破棄し、左隣（無ければ先頭）へ切替・復元
      const neighbor = remaining[idx - 1] ?? remaining[0]
      set({ tabs: remaining, activeTabId: neighbor.id })
      pokemonStore.setState(clonePokemonSnapshot(neighbor.snapshot))
    },

    saveActiveSnapshot: () => {
      const { tabs, activeTabId } = get()
      if (tabs.length === 0 || !activeTabId) return
      const live = liveSnapshot()
      set({ tabs: tabs.map(t => t.id === activeTabId ? { ...t, snapshot: live } : t) })
    },
  }))
}

export const useAttackerTabsStore = createPokemonTabsStore(useAttackerStore)
export const useDefenderTabsStore = createPokemonTabsStore(useDefenderStore)
