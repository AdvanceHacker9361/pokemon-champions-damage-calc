import { useState, useEffect } from 'react'

const STORAGE_KEY = 'pokemon-calc-theme'

/**
 * ダーク/ライトモード切り替えフック
 * localStorage に設定を保存。デフォルトはダークモード。
 */
export function useDarkMode() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored !== null) return stored === 'dark'
    return true // デフォルトはダークモード
  })

  useEffect(() => {
    const root = document.documentElement
    if (isDark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light')
  }, [isDark])

  return {
    isDark,
    toggle: () => setIsDark(v => !v),
  }
}
