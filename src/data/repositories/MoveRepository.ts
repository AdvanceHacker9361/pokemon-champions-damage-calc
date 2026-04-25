import movesData from '@/data/json/moves.json'
import type { MoveRecord } from '@/data/schemas/types'
import { toKatakana } from '../../utils/japanese'

const moves = movesData as MoveRecord[]
// nameKata: ひらがな名・カタカナ名どちらで入力してもマッチするよう正規化
const searchIndex = moves.map(m => ({
  name: m.name,
  nameKata: toKatakana(m.name),
  en: m.nameEn.toLowerCase(),
}))

export const MoveRepository = {
  getAll(): MoveRecord[] {
    return moves
  },

  findByName(name: string): MoveRecord | undefined {
    return moves.find(m => m.name === name)
  },

  /** JP/EN 両対応サーチ（ひらがな↔カタカナ変換対応） */
  search(query: string, limit = 20): MoveRecord[] {
    const q = query.trim()
    if (!q) {
      return searchIndex.slice(0, limit).map(r => moves.find(m => m.name === r.name)!)
    }
    const qKata = toKatakana(q)
    const ql = q.toLowerCase()
    const results = searchIndex
      .filter(m => m.name.includes(q) || m.nameKata.includes(qKata) || m.en.includes(ql))
      .slice(0, limit)
    return results.map(r => moves.find(m => m.name === r.name)!)
  },
}
