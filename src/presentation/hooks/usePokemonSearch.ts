import { useState, useEffect, useCallback } from 'react'
import { searchPokemon } from '@/application/usecases/SearchPokemonUseCase'
import type { PokemonRecord } from '@/data/schemas/types'

export function usePokemonSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PokemonRecord[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [searchedQuery, setSearchedQuery] = useState('')

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length === 0) {
      setResults([])
      setIsSearching(false)
      setSearchedQuery('')
      return
    }

    setIsSearching(true)
    const timer = setTimeout(() => {
      setResults(searchPokemon(trimmed, 15))
      setSearchedQuery(trimmed)
      setIsSearching(false)
    }, 150)
    return () => clearTimeout(timer)
  }, [query])

  const clear = useCallback(() => {
    setQuery('')
    setResults([])
    setIsOpen(false)
    setIsSearching(false)
    setSearchedQuery('')
  }, [])

  return { query, setQuery, results, isOpen, setIsOpen, isSearching, searchedQuery, clear }
}
