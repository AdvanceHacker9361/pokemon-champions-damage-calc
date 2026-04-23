import { create } from 'zustand'

export interface AccumEntry {
  id: string
  label: string
  /** マルチスケイル等が発動した状態のロール（1回分） */
  rolls: number[]
  /**
   * HP満タン特性（マルチスケイル/ファントムガード）なしの素ダメロール。
   * hadMultiscale=false のときは rolls と同値。
   */
  rawRolls: number[]
  usages: number
  minDmg: number
  maxDmg: number
  /** 素ダメ最小（hadMultiscale=false のときは minDmg と同値） */
  rawMin: number
  /** 素ダメ最大（hadMultiscale=false のときは maxDmg と同値） */
  rawMax: number
  defenderMaxHp: number
  /** 加算時に HP満タン特性（マルチスケイル/ファントムガード）が発動していたか */
  hadMultiscale: boolean

  /** 急所ロール（ばけのかわ・おやこあい・固定多段 等すべて反映済み）*/
  critRolls: number[]
  /** 急所ロールのマルチスケイル無効版 */
  rawCritRolls: number[]
  critMin: number
  critMax: number
  rawCritMin: number
  rawCritMax: number
  /** 急所率 (0=1/16, 1/8=高急所技, 1.0=確定急所/急所強制) */
  critChance: number
  /** このエントリは急所強制（確定急所技 or 急所モードで追加）。急所込み計算で混合せず rolls をそのまま使う */
  isForcedCrit: boolean
}

interface AccumStore {
  entries: AccumEntry[]
  constDmg: number
  constRec: number
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
