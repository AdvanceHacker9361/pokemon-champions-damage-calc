import { useState, useEffect } from 'react'
import { MoveRepository } from '@/data/repositories/MoveRepository'
import type { MoveRecord } from '@/data/schemas/types'

export function useMoveSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MoveRecord[]>([])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.length === 0) {
        setResults(MoveRepository.getAll().slice(0, 15))
        return
      }
      setResults(MoveRepository.search(query, 15))
    }, 100)
    return () => clearTimeout(timer)
  }, [query])

  return { query, setQuery, results }
}
