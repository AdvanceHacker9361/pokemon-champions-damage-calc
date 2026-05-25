import { useState } from 'react'
import type { MoveResult } from '@/presentation/store/resultStore'
import type { KoResult } from '@/domain/models/DamageResult'

function formatKo(ko: KoResult): string {
  if (ko.type === 'guaranteed') return `確定${ko.hits}発`
  if (ko.type === 'chance') return `乱数${ko.hits}発 (${(ko.probability * 100).toFixed(1)}%)`
  return '耐え'
}

interface ExportButtonProps {
  results: MoveResult[]
  attackerName: string
  defenderName: string
}

export function ExportButton({ results, attackerName, defenderName }: ExportButtonProps) {
  const [copied, setCopied] = useState(false)

  function buildText(): string {
    const header = `${attackerName} → ${defenderName}`
    const divider = '─'.repeat(Math.max(header.length * 2, 30))
    const lines = results.map(({ moveName, result }) => {
      const range = `${result.min}〜${result.max}`
      const pct = `(${result.percentMin.toFixed(1)}〜${result.percentMax.toFixed(1)}%)`
      const ko = formatKo(result.koResult)
      return `${moveName}: ${range} ${pct}  ${ko}`
    })
    return [header, divider, ...lines].join('\n')
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
      title="計算結果をテキストでコピー"
    >
      {copied ? '✓ コピー済み' : 'コピー'}
    </button>
  )
}
