import { useEffect, useId, useRef, useState } from 'react'
import { ItemRepository } from '@/data/repositories/ItemRepository'
import type { ItemRecord } from '@/data/schemas/types'

interface ItemSelectProps {
  value: string | null
  onChange: (name: string | null) => void
}

export function ItemSelect({ value, onChange }: ItemSelectProps) {
  const id = useId()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ItemRecord[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const activeItemRef = useRef<HTMLButtonElement>(null)
  const listboxId = `${id}-item-listbox`
  const activeOptionId = activeIndex >= 0 ? `${id}-item-${activeIndex}` : undefined

  useEffect(() => {
    const timer = setTimeout(() => {
      setResults(ItemRepository.search(query, 20))
    }, 80)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => { setActiveIndex(-1) }, [results])

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

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
  }, [])

  function handleSelect(itemName: string) {
    onChange(itemName)
    setQuery('')
    setIsOpen(false)
    setActiveIndex(-1)
  }

  function handleClear() {
    onChange(null)
    setQuery('')
    setIsOpen(false)
    setActiveIndex(-1)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || results.length === 0) {
      if (e.key === 'Enter' && results.length > 0) {
        handleSelect(results[0].name)
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
        if (results[idx]) handleSelect(results[idx].name)
        break
      }
      case 'Escape':
        setIsOpen(false)
        setActiveIndex(-1)
        break
    }
  }

  return (
    <div>
      <label className="label block mb-1">持ち物</label>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          className="input-base w-full text-sm pr-7"
          placeholder={value ? '' : '入力して持ち物検索...'}
          value={query}
          onChange={e => { setQuery(e.target.value); setIsOpen(true) }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          aria-label="持ち物を検索"
        />
        {value && !query && (
          <div className="absolute inset-0 flex items-center px-2 pointer-events-none pr-7">
            <span className="text-sm text-fg truncate">{value}</span>
          </div>
        )}
        {value && (
          <button
            type="button"
            className="absolute right-1 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg-muted text-xs px-1.5 py-1"
            onClick={handleClear}
            aria-label="持ち物を解除"
          >
            ✕
          </button>
        )}

        {isOpen && (
          <div
            id={listboxId}
            ref={dropdownRef}
            role="listbox"
            className="absolute z-50 w-full mt-1 bg-surface-1 border border-edge-strong rounded max-h-60 overflow-hidden flex flex-col"
          >
            <div className="overflow-y-auto">
              {results.length === 0 ? (
                <div className="px-3 py-2 text-xs text-fg-subtle">
                  該当する持ち物がありません
                </div>
              ) : (
                results.map((item, i) => (
                  <button
                    key={item.name}
                    id={`${id}-item-${i}`}
                    ref={i === activeIndex ? activeItemRef : undefined}
                    type="button"
                    role="option"
                    aria-selected={i === activeIndex}
                    className={`w-full flex flex-col px-3 py-1.5 text-left transition-colors ${
                      i === activeIndex
                        ? 'bg-surface-3'
                        : 'hover:bg-surface-2'
                    }`}
                    onClick={() => handleSelect(item.name)}
                  >
                    <span className="text-sm text-fg">{item.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
