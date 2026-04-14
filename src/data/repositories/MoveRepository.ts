import movesData from '@/data/json/moves.json'
import type { MoveRecord } from '@/data/schemas/types'

const moves = movesData as MoveRecord[]
const searchIndex = moves.map(m => ({
  name: m.name,
  en: m.nameEn.toLowerCase(),
}))

export const MoveRepository = {
  getAll(): MoveRecord[] {
    return moves
  },

  findByName(name: string): MoveRecord | undefined {
    return moves.find(m => m.name === name)
  },

  search(query: string, limit = 20): MoveRecord[] {
    if (!query.trim()) return moves.slice(0, limit)
    const q = query.trim()
    const ql = q.toLowerCase()
    const results = searchIndex
      .filter(m => m.name.includes(q) || m.en.includes(ql))
      .slice(0, limit)
    return results.map(r => moves.find(m => m.name === r.name)!)
  },
}
