import { create } from 'zustand'
import type { DamageResult } from '@/domain/models/DamageResult'

export interface MoveResult {
  moveName: string
  result: DamageResult
  critResult: DamageResult
}

interface ResultStore {
  results: MoveResult[]
  setResults: (results: MoveResult[]) => void
}

export const useResultStore = create<ResultStore>(set => ({
  results: [],
  setResults: (results) => set({ results }),
}))
