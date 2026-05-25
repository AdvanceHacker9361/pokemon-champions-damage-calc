import { useState } from 'react'
import { useAccumStore } from '@/presentation/store/accumStore'
import { useResultStore } from '@/presentation/store/resultStore'
import { useAccumulatedDamage } from '@/presentation/hooks/useAccumulatedDamage'

function formatProb(prob: number): string {
  if (prob >= 1.0) return '確定KO'
  if (prob <= 0) return '倒せない'
  return `${(prob * 100).toFixed(1)}%`
}

export function AccumExportButton() {
  const [copied, setCopied] = useState(false)
  const entries = useAccumStore(s => s.entries)
  const constDmg = useAccumStore(s => s.constDmg)
  const constRec = useAccumStore(s => s.constRec)
  const poisonTurns = useAccumStore(s => s.poisonTurns)
  const results = useResultStore(s => s.results)

  const defenderMaxHp = results[0]?.result.defenderMaxHp ?? entries[0]?.defenderMaxHp ?? 0
  const accum = useAccumulatedDamage(defenderMaxHp)

  if (!accum.hasAnything) return null

  function buildText(): string {
    const lines: string[] = []
    lines.push(`総合累積  (HP ${defenderMaxHp})`)
    lines.push('─'.repeat(30))

    for (const e of entries) {
      const subMin = e.minDmg * e.usages
      const subMax = e.maxDmg * e.usages
      const usageStr = e.usages > 1 ? ` ×${e.usages}` : ''
      const range = subMin === subMax ? `${subMin}` : `${subMin}〜${subMax}`
      lines.push(`${e.label}${usageStr}: ${range}`)
    }

    if (constDmg > 0) lines.push(`定数ダメ: ${constDmg}`)
    if (constRec > 0) lines.push(`定数回復: -${constRec}`)
    if (poisonTurns > 0) lines.push(`もうどく(${poisonTurns}T): 累計 ${accum.poisonTotal}`)

    lines.push('─'.repeat(30))
    lines.push(`合計: ${accum.totalMin}〜${accum.totalMax} (${accum.totalMinPct.toFixed(1)}〜${accum.totalMaxPct.toFixed(1)}%)`)
    lines.push(`撃破率: ${formatProb(accum.combinedProb)}`)

    const critAffects = Math.abs(accum.combinedProbWithCrit - accum.combinedProb) > 1e-6
    if (critAffects) {
      lines.push(`急所込み: ${formatProb(accum.combinedProbWithCrit)}`)
    }

    return lines.join('\n')
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildText())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard API unavailable (e.g. non-HTTPS dev env)
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-xs text-fg-subtle hover:text-fg transition-colors px-1.5 py-0.5 rounded hover:bg-surface-3"
      title="総合累積の内訳をテキストでコピー"
    >
      {copied ? '✓ コピー済み' : '累積コピー'}
    </button>
  )
}
