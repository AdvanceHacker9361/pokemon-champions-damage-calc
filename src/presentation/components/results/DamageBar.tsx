import type { KoResult } from '@/domain/models/DamageResult'

interface DamageBarProps {
  percentMax: number
  koResult: KoResult
}

function getBarColor(koResult: KoResult): string {
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
  return 'bg-slate-500'
}

export function DamageBar({ percentMax, koResult }: DamageBarProps) {
  const width = Math.min(100, percentMax)
  const color = getBarColor(koResult)

  return (
    <div className="relative h-2 bg-slate-700 rounded overflow-hidden">
      <div
        className={`absolute inset-y-0 left-0 rounded transition-all duration-150 ${color}`}
        style={{ width: `${width}%` }}
      />
      {/* 100% マーク */}
      <div className="absolute inset-y-0 left-[100%] w-px bg-slate-400 opacity-50" />
    </div>
  )
}
