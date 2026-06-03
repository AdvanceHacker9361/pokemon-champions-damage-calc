import { useState } from 'react'
import { useProgressionStore } from '@/presentation/store/progressionStore'
import { useResultStore } from '@/presentation/store/resultStore'
import { useDefenderStore } from '@/presentation/store/pokemonStore'
import { calculateHP } from '@/domain/calculators/StatCalculator'
import { useAccumulatedDamage } from '@/presentation/hooks/useAccumulatedDamage'

function formatProb(prob: number): string {
  if (prob >= 1.0) return '確定KO'
  if (prob <= 0) return '倒せない'
  return `${(prob * 100).toFixed(1)}%`
}

export function AccumExportButton() {
  const [copied, setCopied] = useState(false)
  const events = useProgressionStore(s => s.events)
  const constDmg = useProgressionStore(s => s.constDmg)
  const constRec = useProgressionStore(s => s.constRec)
  const constRecBerry = useProgressionStore(s => s.constRecBerry)
  const berryThresholdPct = useProgressionStore(s => s.constRecBerryThresholdPct)
  const poisonTurns = useProgressionStore(s => s.poisonTurns)
  const results = useResultStore(s => s.results)
  const defenderBaseHp = useDefenderStore(s => s.baseStats.hp)
  const defenderSpHp = useDefenderStore(s => s.sp.hp)

  const firstAttack = events.find(e => e.kind === 'attack')
  const storeDefHp = defenderBaseHp > 0 ? calculateHP(defenderBaseHp, defenderSpHp) : 0
  const defenderMaxHp =
    results[0]?.result.defenderMaxHp
    ?? (firstAttack && firstAttack.kind === 'attack' ? firstAttack.defenderMaxHp : storeDefHp)
  const accum = useAccumulatedDamage(defenderMaxHp)

  if (!accum.hasAnything) return null

  function buildText(): string {
    const lines: string[] = []
    lines.push(`総合累積  (HP ${defenderMaxHp})`)
    lines.push('─'.repeat(30))

    for (const ev of events) {
      switch (ev.kind) {
        case 'attack': {
          const subMin = ev.minDmg * ev.usages
          const subMax = ev.maxDmg * ev.usages
          const usageStr = ev.usages > 1 ? ` ×${ev.usages}` : ''
          const range = subMin === subMax ? `${subMin}` : `${subMin}〜${subMax}`
          lines.push(`${ev.label}${usageStr}: ${range}`)
          break
        }
        case 'painSplit': lines.push(`痛み分け（攻撃側HP=${ev.attackerHp}）`); break
        case 'incoming': lines.push(`被ダメ ${ev.moveName ?? '(未選択)'}${ev.crit ? '（急所）' : ''}`); break
        case 'defenderConst': lines.push(`防御側ダメ ${ev.amount}`); break
        case 'attackerConst': lines.push(`攻撃側ダメ ${ev.amount}`); break
        case 'defenderRecover': lines.push(`防御側回復 ${ev.amount}`); break
        case 'attackerRecover': lines.push(`攻撃側回復 ${ev.amount}`); break
      }
    }

    if (constDmg > 0) lines.push(`定数ダメ: ${constDmg}`)
    if (constRec > 0) lines.push(`定数回復(per-turn): -${constRec}`)
    if (constRecBerry > 0) lines.push(`オボン/混乱実(HP≤${berryThresholdPct}%で1回): -${constRecBerry}`)
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
