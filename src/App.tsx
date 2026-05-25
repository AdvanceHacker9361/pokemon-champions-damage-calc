import { useDarkMode } from '@/presentation/hooks/useDarkMode'
import { Calculator } from '@/presentation/pages/Calculator'
import { APP_VERSION } from '@/infrastructure/version'

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  )
}

export default function App() {
  const { isDark, toggle } = useDarkMode()

  return (
    <div className="min-h-screen bg-app text-fg">
      <header className="border-b border-edge bg-surface-1 px-3 sm:px-4 py-2.5 sm:py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          <h1 className="leading-tight">
            <span className="text-[18px] font-medium text-fg">Pokemon Champions</span>
            <span className="ml-2 text-xs font-normal text-fg-muted">加算ダメージ計算ツール</span>
          </h1>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggle}
              className="flex items-center justify-center w-8 h-8 rounded border border-edge text-fg-muted hover:bg-surface-3 transition-colors"
              title={isDark ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
              aria-label={isDark ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
            <span className="text-[11px] text-fg-subtle flex-shrink-0">v{APP_VERSION}</span>
          </div>
        </div>
      </header>
      <main>
        <Calculator />
      </main>
      <footer className="border-t border-edge mt-8 py-4 text-center text-[11px] text-fg-subtle">
        Pokemon Champions シングルバトル専用 | v{APP_VERSION}
      </footer>
    </div>
  )
}
