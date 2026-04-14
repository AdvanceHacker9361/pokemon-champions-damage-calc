import { useState, useEffect, useCallback } from 'react'
import { searchPokemon } from '@/application/usecases/SearchPokemonUseCase'
import type { PokemonRecord } from '@/data/schemas/types'

export function usePokemonSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PokemonRecord[]>([])
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.length === 0) {
        setResults([])
        return
      }
      setResults(searchPokemon(query, 15))
    }, 150)
    return () => clearTimeout(timer)
  }, [query])

  const clear = useCallback(() => {
    setQuery('')
    setResults([])
    setIsOpen(false)
  }, [])

  return { query, setQuery, results, isOpen, setIsOpen, clear }
}
