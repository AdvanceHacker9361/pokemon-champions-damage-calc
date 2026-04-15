import { create } from 'zustand'

export interface AccumEntry {
  id: string
  label: string      // 例: "ガブリアス のじしん"
  rolls: number[]    // 16段階ロール（1回分）
  /** 何回使用するか（1〜5）。累積ダメージ計算に使用 */
  usages: number
  minDmg: number     // 1回分の最小ダメージ
  maxDmg: number     // 1回分の最大ダメージ
  defenderMaxHp: number
}

interface AccumStore {
  entries: AccumEntry[]
  addEntry: (entry: Omit<AccumEntry, 'id'>) => void
  removeEntry: (id: string) => void
  clearEntries: () => void
}

export const useAccumStore = create<AccumStore>(set => ({
  entries: [],
  addEntry: (entry) => set(s => ({
    entries: [...s.entries, {
      ...entry,
      usages: entry.usages ?? 1,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }],
  })),
  removeEntry: (id) => set(s => ({ entries: s.entries.filter(e => e.id !== id) })),
  clearEntries: () => set({ entries: [] }),
}))
