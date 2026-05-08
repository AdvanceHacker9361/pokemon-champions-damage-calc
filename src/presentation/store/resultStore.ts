import { create } from 'zustand'
import type { DamageResult } from '@/domain/models/DamageResult'

export interface MoveResult {
  moveName: string
  result: DamageResult
  critResult: DamageResult
  /** 段階威力型（escalating）の各発個別結果（ばけのかわ等で使用） */
  perHitResults?: DamageResult[]
  critPerHitResults?: DamageResult[]
  /** マルチスケイル無効化後の素ダメ結果（fixed/variable多段の2発目以降用） */
  rawResult?: DamageResult
  rawCritResult?: DamageResult
  /** くだけるよろい発動時の固定多段技の各発個別結果（ヒットごとにBランク-1） */
  weakArmorPerHitResults?: DamageResult[]
  weakArmorCritPerHitResults?: DamageResult[]
  /**
   * くだけるよろい + 変動連続技用の追加素ダメ結果。
   * [0] = Bランク-2（3発目用）, [1] = -3（4発目用）, [2] = -4（5発目用）。
   * Bランク-1（2発目用）は rawResult を使用。
   */
  weakArmorVariableRawResults?: DamageResult[]
  weakArmorVariableRawCritResults?: DamageResult[]
}

interface ResultStore {
  results: MoveResult[]
  setResults: (results: MoveResult[]) => void
}

export const useResultStore = create<ResultStore>(set => ({
  results: [],
  setResults: (results) => set({ results }),
}))
