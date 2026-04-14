import { useState, useRef, useEffect } from 'react'
import { MoveRepository } from '@/data/repositories/MoveRepository'
import type { MoveRecord } from '@/data/schemas/types'

interface MoveSelectProps {
  value: string | null
  onChange: (moveName: string | null) => void
  placeholder?: string
}

export function MoveSelect({ value, onChange, placeholder = '技を選択...' }: MoveSelectProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MoveRecord[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const activeItemRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!query) { setResults([]); return }
      setResults(MoveRepository.search(query, 12))
    }, 80)
    return () => clearTimeout(timer)
  }, [query])

  // 結果変化時にアクティブ選択リセット
  useEffect(() => { setActiveIndex(-1) }, [results])

  // アクティブ項目を自動スクロール
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

  function handleSelect(moveName: string) {
    onChange(moveName)
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

  const categoryColors: Record<string, string> = {
    '物理': 'text-orange-500 dark:text-orange-400',
    '特殊': 'text-blue-500 dark:text-blue-400',
    '変化': 'text-slate-600 dark:text-slate-400',
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        className="input-base w-full text-sm"
        placeholder={value || placeholder}
        value={query}
        onChange={e => { setQuery(e.target.value); setIsOpen(true) }}
        onFocus={() => { setIsOpen(true); if (!query) setResults(MoveRepository.getAll().slice(0, 12)) }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {value && !query && (
        <div className="absolute inset-0 flex items-center px-2 pointer-events-none pr-6">
          <span className="text-sm text-slate-800 dark:text-slate-200 truncate">{value}</span>
        </div>
      )}
      {value && (
        <button
          type="button"
          className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-xs px-1.5 py-1"
          onClick={() => { onChange(null); setQuery(''); setIsOpen(false) }}
        >
          ✕
        </button>
      )}

      {isOpen && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded shadow-xl max-h-52 overflow-y-auto"
        >
          {results.map((m, i) => (
            <button
              key={m.name}
              ref={i === activeIndex ? activeItemRef : undefined}
              type="button"
              className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                i === activeIndex
                  ? 'bg-slate-100 dark:bg-slate-600'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
              onClick={() => handleSelect(m.name)}
            >
              <span className="text-sm text-slate-900 dark:text-slate-100 flex-1">{m.name}</span>
              <span className={`text-xs ${categoryColors[m.category] ?? ''}`}>{m.category}</span>
              {m.power && <span className="text-xs text-slate-600 dark:text-slate-400 font-mono w-8 text-right">{m.power}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
