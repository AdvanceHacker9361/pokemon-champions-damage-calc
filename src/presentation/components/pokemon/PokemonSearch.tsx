import { useState, useRef, useEffect, useId } from 'react'
import { usePokemonSearch } from '@/presentation/hooks/usePokemonSearch'
import { TypeBadge } from '@/presentation/components/shared/Badge'
import type { PokemonRecord } from '@/data/schemas/types'
import type { TypeName } from '@/domain/models/Pokemon'

interface PokemonSearchProps {
  value: string
  onSelect: (pokemon: PokemonRecord) => void
  onClear?: () => void
  placeholder?: string
  /** true のとき Cmd+K グローバルショートカットでフォーカスされる */
  listenFocusShortcut?: boolean
}

export function PokemonSearch({ value, onSelect, onClear, placeholder = 'ポケモン検索...', listenFocusShortcut }: PokemonSearchProps) {
  const id = useId()
  const { query, setQuery, results, isOpen, setIsOpen, isSearching, searchedQuery, clear } = usePokemonSearch()
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const activeItemRef = useRef<HTMLButtonElement>(null)
  const listboxId = `${id}-pokemon-listbox`
  const activeOptionId = activeIndex >= 0 ? `${id}-pokemon-${activeIndex}` : undefined
  const trimmedQuery = query.trim()
  const hasQuery = trimmedQuery.length > 0
  const showDropdown = isOpen && (results.length > 0 || hasQuery || isSearching)
  const showNoResults = hasQuery && !isSearching && searchedQuery === trimmedQuery && results.length === 0

  // Cmd+K ショートカットでフォーカス
  useEffect(() => {
    if (!listenFocusShortcut) return
    function handler() {
      inputRef.current?.focus()
      inputRef.current?.select()
      setIsOpen(true)
    }
    document.addEventListener('kb:focus-pokemon-search', handler)
    return () => document.removeEventListener('kb:focus-pokemon-search', handler)
  }, [listenFocusShortcut, setIsOpen])

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
  useEffect(() => { setActiveIndex(-1) }, [results, query, isOpen])

  // アクティブ項目を自動スクロール
  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function handleSelect(pokemon: PokemonRecord) {
    onSelect(pokemon)
    clear()
    setActiveIndex(-1)
  }

  function handleClear() {
    if (query) {
      clear()
      setActiveIndex(-1)
      inputRef.current?.focus()
      return
    }
    if (!onClear) return
    onClear()
    clear()
    setActiveIndex(-1)
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setIsOpen(false)
      setActiveIndex(-1)
      return
    }
    if (e.nativeEvent.isComposing) return
    if (!isOpen || results.length === 0) {
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
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        className="input-base w-full pr-8"
        placeholder={value || placeholder}
        value={query}
        onChange={e => { setQuery(e.target.value); setIsOpen(true) }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        aria-label="ポケモンを検索"
      />
      {value && !query && (
        <span className="absolute right-8 top-1/2 max-w-[58%] -translate-y-1/2 truncate text-xs text-fg-muted pointer-events-none">
          {value}
        </span>
      )}
      {(query || (value && onClear)) && (
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={handleClear}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded px-1.5 py-1 text-xs text-fg-subtle hover:bg-surface-3 hover:text-fg-muted"
          aria-label={query ? '検索文字を消去' : `${value}を解除`}
          title={query ? '検索文字を消去' : '選択中のポケモンを解除'}
        >
          ×
        </button>
      )}

      {showDropdown && (
        <div
          id={listboxId}
          ref={dropdownRef}
          role="listbox"
          className="absolute z-50 w-full mt-1 bg-surface-1 border border-edge-strong rounded-lg max-h-64 overflow-y-auto"
        >
          {results.length === 0 ? (
            <div
              role="option"
              aria-disabled="true"
              aria-live="polite"
              className="px-3 py-2 text-xs text-fg-subtle"
            >
              {isSearching
                ? '検索中...'
                : showNoResults
                  ? `「${trimmedQuery}」に一致するポケモンがいません`
                  : '検索語を入力してください'}
            </div>
          ) : (
            results.map((p, i) => (
              <button
                key={p.id}
                id={`${id}-pokemon-${i}`}
                ref={i === activeIndex ? activeItemRef : undefined}
                type="button"
                role="option"
                aria-selected={i === activeIndex}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors ${
                  i === activeIndex
                    ? 'bg-surface-3'
                    : 'hover:bg-surface-2'
                }`}
                onClick={() => handleSelect(p)}
              >
                <span className="text-sm font-medium text-fg min-w-0 flex-1">{p.name}</span>
                <span className="text-xs text-fg-subtle hidden sm:inline">{p.nameEn}</span>
                <div className="flex gap-1 flex-shrink-0">
                  {p.types.map(t => <TypeBadge key={t} type={t as TypeName} />)}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
