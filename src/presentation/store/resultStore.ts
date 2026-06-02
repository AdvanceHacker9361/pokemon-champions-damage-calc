import { create } from 'zustand'
import type { CalculatedMoveResult } from '@/application/usecases/CalculateMoveResultsUseCase'

export type MoveResult = CalculatedMoveResult

interface ResultStore {
  results: MoveResult[]
  setResults: (results: MoveResult[]) => void
}

export const useResultStore = create<ResultStore>(set => ({
  results: [],
  setResults: (results) => set({ results }),
}))
