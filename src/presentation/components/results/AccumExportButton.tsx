import { useState } from 'react'
import { useProgressionStore } from '@/presentation/store/progressionStore'
import { useResultStore } from '@/presentation/store/resultStore'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { calculateHP } from '@/domain/calculators/StatCalculator'
import type { TypeName } from '@/domain/models/Pokemon'
import { useAccumulatedDamage } from '@/presentation/hooks/useAccumulatedDamage'
import { resolvePassiveAmount, type PassiveEffect } from '@/domain/models/PassiveEffect'

function formatProb(prob: number): string {
  if (prob >= 1.0) return '確定KO'
  if (prob <= 0) return '倒せない'
  return `${(prob * 100).toFixed(1)}%`
}

const TIMING_LABEL = { start: '開始時', turnEnd: 'ターン末', perAttack: '攻撃ごと' } as const

/** 常時効果 1 行分のテキスト（1 適用あたりの実量つき） */
function passiveLine(eff: PassiveEffect, attackerMaxHp: number, defenderMaxHp: number,
                     attackerTypes: TypeName[], defenderTypes: TypeName[]): string {
  const side = eff.side === 'attacker' ? '攻撃側' : '防御側'
  const amount = resolvePassiveAmount(eff.amount, {
    targetMaxHp: eff.side === 'attacker' ? attackerMaxHp : defenderMaxHp,
    targetTypes: eff.side === 'attacker' ? attackerTypes : defenderTypes,
    toxicCounter: 1,
  })
  const sign = eff.kind === 'recover' ? '+' : '-'
  const kindLabel = eff.kind === 'leechSeed' ? '（やどりぎ: 反対側が同量回復）' : ''
  const count = eff.count === 'all' ? '全ターン' : `${eff.count}回`
  const from = eff.startTurn > 1 ? ` T${eff.startTurn}〜` : ''
  const progressive = eff.amount.type === 'toxic' ? '（累進）' : ''
  return `${side} ${eff.label}: ${sign}${amount}${progressive} / ${TIMING_LABEL[eff.timing]} ${count}${from}${kindLabel}`
}

export function AccumExportButton() {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const events = useProgressionStore(s => s.events)
  const constRecBerry = useProgressionStore(s => s.constRecBerry)
  const passiveEffects = useProgressionStore(s => s.passiveEffects)
  const attackerBaseHp = useAttackerStore(s => s.baseStats.hp)
  const attackerSpHp = useAttackerStore(s => s.sp.hp)
  const attackerTypes = useAttackerStore(s => s.types)
  const defenderTypes = useDefenderStore(s => s.types)
  const berryThresholdPct = useProgressionStore(s => s.constRecBerryThresholdPct)
  const results = useResultStore(s => s.results)
  const defenderBaseHp = useDefenderStore(s => s.baseStats.hp)
  const defenderSpHp = useDefenderStore(s => s.sp.hp)

  const firstAttack = events.find(e => e.kind === 'attack')
  const storeDefHp = defenderBaseHp > 0 ? calculateHP(defenderBaseHp, defenderSpHp) : 0
  const defenderMaxHp =
    results[0]?.result.defenderMaxHp
    ?? (firstAttack && firstAttack.kind === 'attack' ? firstAttack.defenderMaxHp : storeDefHp)
  const attackerMaxHp = attackerBaseHp > 0 ? calculateHP(attackerBaseHp, attackerSpHp) : 0
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
        case 'painSplit': lines.push('痛み分け（両者HP平均化）'); break
        case 'incoming': lines.push(`攻撃側被ダメ ${ev.moveName ?? '(未選択)'}${ev.crit ? '（急所）' : ''}`); break
        case 'setupTurn': lines.push(ev.label?.trim() || `${ev.side === 'attacker' ? '攻撃側' : '防御側'}補助技使用`); break
        case 'megaEvolve': lines.push(`${ev.side === 'attacker' ? '攻撃側' : '防御側'}メガシンカ`); break
        case 'defenderConst': lines.push(`${ev.label ?? '防御側ダメ'}: ${ev.amount}`); break
        case 'attackerConst': lines.push(`${ev.label ?? '攻撃側ダメ'}: ${ev.amount}`); break
        case 'defenderRecover': lines.push(`${ev.label ?? '防御側回復'}: -${ev.amount}`); break
        case 'attackerRecover': lines.push(`${ev.label ?? '攻撃側回復'}: -${ev.amount}`); break
        case 'rearmBerry': lines.push('リサイクル（きのみ再装填）'); break
        case 'leechSeed': lines.push(`宿り木（${ev.direction === 'fromAttacker' ? '攻→防' : '防→攻'}）`); break
      }
    }

    if (constRecBerry > 0) lines.push(`オボン/混乱実(HP≤${berryThresholdPct}%で1回): -${constRecBerry}`)

    if (passiveEffects.length > 0) {
      lines.push('常時効果:')
      for (const eff of passiveEffects) {
        lines.push(`  ${passiveLine(eff, attackerMaxHp, defenderMaxHp, attackerTypes, defenderTypes)}`)
      }
    }

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
      setCopyStatus('copied')
      setTimeout(() => setCopyStatus('idle'), 2000)
    } catch {
      setCopyStatus('error')
      setTimeout(() => setCopyStatus('idle'), 2000)
    }
  }

  const isError = copyStatus === 'error'

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-live="polite"
      className={`text-xs transition-colors px-1.5 py-0.5 rounded hover:bg-surface-3 ${
        isError ? 'text-danger-2 hover:text-danger-2' : 'text-fg-subtle hover:text-fg'
      }`}
      title={isError ? 'クリップボードへコピーできませんでした' : '総合累積の内訳をテキストでコピー'}
    >
      {copyStatus === 'copied' ? '✓ コピー済み' : isError ? 'コピー失敗' : '累積コピー'}
    </button>
  )
}
