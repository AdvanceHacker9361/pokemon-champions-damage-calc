import { useRef, useEffect } from 'react'
import { usePokemonSearch } from '@/presentation/hooks/usePokemonSearch'
import { TypeBadge } from '@/presentation/components/shared/Badge'
import type { PokemonRecord } from '@/data/schemas/types'
import type { TypeName } from '@/domain/models/Pokemon'

interface PokemonSearchProps {
  value: string
  onSelect: (pokemon: PokemonRecord) => void
  placeholder?: string
}

export function PokemonSearch({ value, onSelect, placeholder = 'ポケモン検索...' }: PokemonSearchProps) {
  const { query, setQuery, results, isOpen, setIsOpen } = usePokemonSearch()
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 外側クリックで閉じる
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [setIsOpen])

  function handleSelect(pokemon: PokemonRecord) {
    onSelect(pokemon)
    setQuery('')
    setIsOpen(false)
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        className="input-base w-full"
        placeholder={value || placeholder}
        value={query}
        onChange={e => { setQuery(e.target.value); setIsOpen(true) }}
        onFocus={() => setIsOpen(true)}
      />
      {value && !query && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">
          {value}
        </span>
      )}

      {isOpen && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-64 overflow-y-auto"
        >
          {results.map(p => (
            <button
              key={p.id}
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-700 text-left transition-colors"
              onClick={() => handleSelect(p)}
            >
              <span className="text-sm font-medium text-slate-100 min-w-0 flex-1">{p.name}</span>
              <span className="text-xs text-slate-500 font-mono">{p.nameEn}</span>
              <div className="flex gap-1 flex-shrink-0">
                {p.types.map(t => <TypeBadge key={t} type={t as TypeName} />)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
