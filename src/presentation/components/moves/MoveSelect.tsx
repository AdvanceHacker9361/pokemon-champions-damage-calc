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
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!query) { setResults([]); return }
      setResults(MoveRepository.search(query, 12))
    }, 100)
    return () => clearTimeout(timer)
  }, [query])

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

  const categoryColors: Record<string, string> = {
    '物理': 'text-orange-400',
    '特殊': 'text-blue-400',
    '変化': 'text-slate-400',
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
      />
      {value && !query && (
        <div className="absolute inset-0 flex items-center px-2 pointer-events-none">
          <span className="text-sm text-slate-200 truncate">{value}</span>
        </div>
      )}
      {value && (
        <button
          type="button"
          className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs px-1"
          onClick={() => { onChange(null); setQuery(''); setIsOpen(false) }}
        >
          ✕
        </button>
      )}

      {isOpen && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-600 rounded shadow-xl max-h-48 overflow-y-auto"
        >
          {results.map(m => (
            <button
              key={m.name}
              type="button"
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700 text-left"
              onClick={() => { onChange(m.name); setQuery(''); setIsOpen(false) }}
            >
              <span className="text-sm text-slate-100 flex-1">{m.name}</span>
              <span className={`text-xs ${categoryColors[m.category] ?? ''}`}>{m.category}</span>
              {m.power && <span className="text-xs text-slate-400 font-mono w-8 text-right">{m.power}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
