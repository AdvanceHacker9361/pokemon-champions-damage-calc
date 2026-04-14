import { create } from 'zustand'
import type { MoveResult } from '@/presentation/store/resultStore'

export interface LogEntry {
  id: string
  timestamp: number
  label: string
  attackerName: string
  defenderName: string
  results: MoveResult[]
}

interface LogStore {
  entries: LogEntry[]
  addEntry: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void
  removeEntry: (id: string) => void
  clear: () => void
}

export const useLogStore = create<LogStore>(set => ({
  entries: [],
  addEntry: (entry) => set(s => ({
    entries: [
      {
        ...entry,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
      },
      ...s.entries,
    ].slice(0, 20),  // 最大20件
  })),
  removeEntry: (id) => set(s => ({ entries: s.entries.filter(e => e.id !== id) })),
  clear: () => set({ entries: [] }),
}))
