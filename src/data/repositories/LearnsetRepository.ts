import learnableMovesData from '@/data/json/learnableMoves.json'

const map = learnableMovesData as Record<string, string[]>

export const LearnsetRepository = {
  /**
   * 指定ポケモンの習得可能技を返す。
   * 返り値 null: このポケモンの learnset データが存在しない（フィルタ無効のフォールバック）。
   */
  getMoves(pokemonId: number | null): Set<string> | null {
    if (!pokemonId) return null
    const arr = map[String(pokemonId)]
    if (!arr || arr.length === 0) return null
    return new Set(arr)
  },
}
