import abilitiesData from '@/data/json/abilities.json'
import type { AbilityRecord } from '@/data/schemas/types'

const abilities = abilitiesData as AbilityRecord[]

export const AbilityRepository = {
  getAll(): AbilityRecord[] {
    return abilities
  },

  findByName(name: string): AbilityRecord | undefined {
    return abilities.find(a => a.name === name)
  },

  search(query: string, limit = 20): AbilityRecord[] {
    if (!query.trim()) return abilities.slice(0, limit)
    const q = query.trim()
    const ql = q.toLowerCase()
    return abilities
      .filter(a => a.name.includes(q) || a.nameEn.toLowerCase().includes(ql))
      .slice(0, limit)
  },
}
