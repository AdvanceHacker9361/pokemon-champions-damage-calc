interface MegaToggleProps {
  isMega: boolean
  canMega: boolean
  onChange: (v: boolean) => void
}

export function MegaToggle({ isMega, canMega, onChange }: MegaToggleProps) {
  if (!canMega) return null

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
