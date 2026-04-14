import itemsData from '@/data/json/items.json'
import type { ItemRecord } from '@/data/schemas/types'

const items = itemsData as ItemRecord[]

export const ItemRepository = {
  getAll(): ItemRecord[] {
    return items
  },

  findByName(name: string): ItemRecord | undefined {
    return items.find(i => i.name === name)
  },

  search(query: string, limit = 20): ItemRecord[] {
    if (!query.trim()) return items.slice(0, limit)
    const q = query.trim()
    const ql = q.toLowerCase()
    return items
      .filter(i => i.name.includes(q) || i.nameEn.toLowerCase().includes(ql))
      .slice(0, limit)
  },
}
