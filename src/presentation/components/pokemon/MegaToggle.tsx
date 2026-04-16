import type { MegaPokemonRecord } from '@/data/schemas/types'

interface MegaToggleProps {
  isMega: boolean
  canMega: boolean
  availableMegas: MegaPokemonRecord[]
  megaKey: string | null
  onChange: (v: boolean) => void
  onFormChange: (key: string) => void
}

/**
 * メガシンカトグル
 * - 1形態: シンプルなON/OFFボタン
 * - 複数形態（リザードンX/Y・ミュウツーX/Y等）: OFF | X | Y の3択ボタン
 */
export function MegaToggle({ isMega, canMega, availableMegas, megaKey, onChange, onFormChange }: MegaToggleProps) {
  if (!canMega) return null

  const hasMultipleForms = availableMegas.length > 1

  if (!hasMultipleForms) {
    // 1形態: 既存のシンプルトグル
    return (
      <button
        type="button"
        onClick={() => onChange(!isMega)}
        className={`text-xs px-3 py-1 rounded border font-medium transition-colors ${
          isMega
            ? 'bg-violet-700 border-violet-500 text-white'
            : 'bg-transparent border-violet-400 dark:border-violet-700 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900'
        }`}
      >
        {isMega ? '▼ メガシンカ中' : 'メガシンカ'}
      </button>
    )
  }

  // 複数形態: [通常] [メガX] [メガY] ボタン群
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`text-xs px-2 py-1 rounded border font-medium transition-colors ${
          !isMega
            ? 'bg-slate-600 dark:bg-slate-500 border-slate-500 dark:border-slate-400 text-white'
            : 'text-slate-500 border-slate-300 dark:border-slate-600 hover:border-slate-500 dark:hover:border-slate-400'
        }`}
      >
        通常
      </button>
      {availableMegas.map(mega => {
        // "mega-charizard-x" → "X", "mega-mewtwo-y" → "Y" のように末尾の -x/-y を取得
        const suffix = mega.key.split('-').pop()?.toUpperCase() ?? mega.name
        const isActive = isMega && megaKey === mega.key
        return (
          <button
            key={mega.key}
            type="button"
            onClick={() => {
              if (!isMega) onChange(true)
              onFormChange(mega.key)
            }}
            className={`text-xs px-2 py-1 rounded border font-medium transition-colors ${
              isActive
                ? 'bg-violet-700 border-violet-500 text-white'
                : 'text-violet-600 dark:text-violet-400 border-violet-400 dark:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-900'
            }`}
            title={mega.name}
          >
            メガ{suffix}
          </button>
        )
      })}
    </div>
  )
}
