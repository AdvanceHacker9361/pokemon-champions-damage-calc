import { create } from 'zustand'

export interface AccumEntry {
  id: string
  label: string      // 例: "ガブリアス のじしん"
  rolls: number[]    // 15段階ロール（Champions仕様、1回分）
  /** 何回使用するか（1〜5）。累積ダメージ計算に使用 */
  usages: number
  minDmg: number     // 1回分の最小ダメージ
  maxDmg: number     // 1回分の最大ダメージ
  defenderMaxHp: number
}

interface AccumStore {
  entries: AccumEntry[]
  /** 定数ダメージ（砂/毒/やけど等） */
  constDmg: number
  /** 定数回復（残飯/黒ヘド等） */
  constRec: number
  /** もうどく累積ターン数（0〜10） */
  poisonTurns: number

  addEntry: (entry: Omit<AccumEntry, 'id'>) => void
  removeEntry: (id: string) => void
  setEntryUsages: (id: string, usages: number) => void
  clearEntries: () => void
  setConstDmg: (v: number) => void
  setConstRec: (v: number) => void
  setPoisonTurns: (n: number) => void
}

export const useAccumStore = create<AccumStore>(set => ({
  entries: [],
  constDmg: 0,
  constRec: 0,
  poisonTurns: 0,

  addEntry: (entry) => set(s => ({
    entries: [...s.entries, {
      ...entry,
      usages: entry.usages ?? 1,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }],
  })),
  removeEntry: (id) => set(s => ({ entries: s.entries.filter(e => e.id !== id) })),
  setEntryUsages: (id, usages) => set(s => ({
    entries: s.entries.map(e =>
      e.id === id ? { ...e, usages: Math.max(1, Math.min(9, Math.floor(usages))) } : e
    ),
  })),
  clearEntries: () => set({ entries: [], constDmg: 0, constRec: 0, poisonTurns: 0 }),
  setConstDmg: (v) => set({ constDmg: Math.max(0, Math.floor(v)) }),
  setConstRec: (v) => set({ constRec: Math.max(0, Math.floor(v)) }),
  setPoisonTurns: (n) => set({ poisonTurns: Math.max(0, Math.min(10, Math.floor(n))) }),
}))
