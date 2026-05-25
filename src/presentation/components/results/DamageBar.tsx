import type { KoResult } from '@/domain/models/DamageResult'

interface DamageBarProps {
  percentMin: number
  percentMax: number
  koResult: KoResult
}

function getBarColor(koResult: KoResult): string {
  if (koResult.type === 'guaranteed') {
    if (koResult.hits === 1) return 'var(--danger-1)'
    if (koResult.hits === 2) return 'var(--danger-2)'
    if (koResult.hits === 3) return 'var(--danger-3)'
    return 'var(--danger-4)'
  }
  if (koResult.type === 'chance') {
    if (koResult.hits === 1) return 'var(--danger-2)'
    if (koResult.hits === 2) return 'var(--danger-3)'
    return 'var(--danger-4)'
  }
  return 'var(--neutral)'
}

export function DamageBar({ percentMin, percentMax, koResult }: DamageBarProps) {
  const clampedMax = Math.min(100, Math.max(0, percentMax))
  const clampedMin = Math.min(clampedMax, Math.max(0, percentMin))
  const color = getBarColor(koResult)

  return (
    <div className="relative h-2 bg-surface-3 rounded-sm overflow-hidden">
      {/* 乱数ゾーン (percentMin〜percentMax): 50%透明度 */}
      <div
        className="absolute inset-y-0 left-0"
        style={{ width: `${clampedMax}%`, backgroundColor: color, opacity: 0.5 }}
      />
      {/* 確定ダメージ帯 (0〜percentMin): 100%透明度 */}
      <div
        className="absolute inset-y-0 left-0"
        style={{ width: `${clampedMin}%`, backgroundColor: color }}
      />
    </div>
  )
}
