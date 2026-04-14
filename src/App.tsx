import { useEffect } from 'react'
import { Calculator } from '@/presentation/pages/Calculator'
import { APP_VERSION } from '@/infrastructure/version'

export default function App() {
  // Apply dark mode class on mount
  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900 px-3 sm:px-4 py-2.5 sm:py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          <h1 className="text-sm sm:text-lg font-bold text-slate-100 leading-tight">
            <span className="hidden sm:inline">ポケモンチャンピオンズ</span>
            <span className="sm:hidden">PKチャンピオンズ</span>
            <span className="ml-1.5 text-xs sm:text-sm font-normal text-slate-400">ダメージ計算</span>
          </h1>
          <span className="text-xs text-slate-600 font-mono flex-shrink-0">v{APP_VERSION}</span>
        </div>
      </header>
      <main>
        <Calculator />
      </main>
      <footer className="border-t border-slate-800 mt-8 py-4 text-center text-xs text-slate-600">
        Pokemon Champions シングルバトル専用 | v{APP_VERSION}
      </footer>
    </div>
  )
}
