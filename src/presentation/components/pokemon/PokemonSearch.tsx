import { useState, useRef, useEffect } from 'react'
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
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const activeItemRef = useRef<HTMLButtonElement>(null)

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

  // 結果変化時にアクティブ選択リセット
  useEffect(() => { setActiveIndex(-1) }, [results])

  // アクティブ項目を自動スクロール
  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function handleSelect(pokemon: PokemonRecord) {
    onSelect(pokemon)
    setQuery('')
    setIsOpen(false)
    setActiveIndex(-1)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || results.length === 0) {
      if (e.key === 'Enter' && results.length > 0) {
        handleSelect(results[0])
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex(i => Math.min(i + 1, results.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex(i => Math.max(i - 1, 0))
        break
      case 'Enter': {
        e.preventDefault()
        const idx = activeIndex >= 0 ? activeIndex : 0
        if (results[idx]) handleSelect(results[idx])
        break
      }
      case 'Escape':
        setIsOpen(false)
        setActiveIndex(-1)
        break
    }
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
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {value && !query && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none truncate max-w-[60%]">
          {value}
        </span>
      )}

      {isOpen && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-64 overflow-y-auto"
        >
          {results.map((p, i) => (
            <button
              key={p.id}
              ref={i === activeIndex ? activeItemRef : undefined}
              type="button"
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors ${
                i === activeIndex ? 'bg-slate-600' : 'hover:bg-slate-700'
              }`}
              onClick={() => handleSelect(p)}
            >
              <span className="text-sm font-medium text-slate-100 min-w-0 flex-1">{p.name}</span>
              <span className="text-xs text-slate-500 font-mono hidden sm:inline">{p.nameEn}</span>
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
