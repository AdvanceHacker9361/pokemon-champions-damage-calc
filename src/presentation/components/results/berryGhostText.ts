import type { BerryGhostItem } from '@/presentation/hooks/useBattleSequence'

const EPS = 0.0005

/** 確率の表示（100% は小数なし） */
export function formatBerryProb(p: number): string {
  if (p >= 1 - EPS) return '100%'
  return `${(p * 100).toFixed(1)}%`
}

/**
 * きのみ発動行 1 項目分のテキスト（例: `🍒 オボン/混乱実（防御側）+45 ─ 発動 73.2%`）。
 * はんすうのターン末再回復・しゅうかく/リサイクルの再装填は別表記で併記する。
 */
export function berryItemText(item: BerryGhostItem): string {
  const side = item.side === 'attacker' ? '攻撃側' : '防御側'
  const parts: string[] = []
  const direct = item.triggerProb - item.cudProb
  if (direct > EPS) parts.push(`発動 ${formatBerryProb(direct)}`)
  if (item.cudProb > EPS) parts.push(`はんすう再回復 ${formatBerryProb(item.cudProb)}`)
  if (item.rearmProb > EPS) {
    const what = item.stepKind === 'rearmBerry' ? 'リサイクル再装填' : 'しゅうかく再装填'
    parts.push(`${what} ${formatBerryProb(item.rearmProb)}`)
  }
  return `🍒 オボン/混乱実（${side}）+${item.amount} ─ ${parts.join(' · ')}`
}
