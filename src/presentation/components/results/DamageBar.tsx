import type { KoResult } from '@/domain/models/DamageResult'

interface DamageBarProps {
  percentMin: number
  percentMax: number
  koResult: KoResult
}

function getSolidColor(koResult: KoResult): string {
  if (koResult.type === 'guaranteed') {
    if (koResult.hits === 1) return 'bg-red-500'
    if (koResult.hits === 2) return 'bg-orange-500'
    if (koResult.hits === 3) return 'bg-yellow-500'
    return 'bg-green-500'
  }
  if (koResult.type === 'chance') {
    if (koResult.hits === 1) return 'bg-red-400'
    if (koResult.hits === 2) return 'bg-orange-400'
    return 'bg-yellow-400'
  }
  return 'bg-slate-400 dark:bg-slate-500'
}

function getLightColor(koResult: KoResult): string {
  if (koResult.type === 'guaranteed') {
    if (koResult.hits === 1) return 'bg-red-200 dark:bg-red-900'
    if (koResult.hits === 2) return 'bg-orange-200 dark:bg-orange-900'
    if (koResult.hits === 3) return 'bg-yellow-200 dark:bg-yellow-900'
    return 'bg-green-200 dark:bg-green-900'
  }
  if (koResult.type === 'chance') {
    if (koResult.hits === 1) return 'bg-red-200 dark:bg-red-900'
    if (koResult.hits === 2) return 'bg-orange-200 dark:bg-orange-900'
    return 'bg-yellow-200 dark:bg-yellow-900'
  }
  return 'bg-slate-300 dark:bg-slate-600'
}

export function DamageBar({ percentMin, percentMax, koResult }: DamageBarProps) {
  const clampedMax = Math.min(100, Math.max(0, percentMax))
  const clampedMin = Math.min(clampedMax, Math.max(0, percentMin))

  return (
    <div className="relative h-3 bg-slate-200 dark:bg-slate-700 rounded overflow-hidden">
      {/* 乱数ゾーン (0〜percentMax): 淡色 */}
      <div
        className={`absolute inset-y-0 left-0 ${getLightColor(koResult)}`}
        style={{ width: `${clampedMax}%` }}
      />
      {/* 確定ダメージ帯 (0〜percentMin): 濃色 */}
      <div
        className={`absolute inset-y-0 left-0 ${getSolidColor(koResult)}`}
        style={{ width: `${clampedMin}%` }}
      />
      {/* 100% マーク */}
      <div className="absolute inset-y-0 left-[100%] w-px bg-slate-500 dark:bg-slate-400 opacity-50" />
    </div>
  )
}
