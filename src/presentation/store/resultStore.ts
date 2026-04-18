import { create } from 'zustand'
import type { DamageResult } from '@/domain/models/DamageResult'

export interface MoveResult {
  moveName: string
  result: DamageResult
  critResult: DamageResult
  /** 段階威力型（escalating）の各発個別結果（ばけのかわ等で使用） */
  perHitResults?: DamageResult[]
  critPerHitResults?: DamageResult[]
}

interface ResultStore {
  results: MoveResult[]
  setResults: (results: MoveResult[]) => void
}

export const useResultStore = create<ResultStore>(set => ({
  results: [],
  setResults: (results) => set({ results }),
}))
