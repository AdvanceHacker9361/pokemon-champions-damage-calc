import type { AutoEventItem } from '@/domain/calculators/PassiveEffectExpansion'

/** 適用タイミングの見出し（開始時 / T2末 / T2攻撃後） */
function whenLabel(item: AutoEventItem): string {
  if (item.turn === 0) return '開始時'
  return item.timing === 'perAttack' ? `T${item.turn}攻撃後` : `T${item.turn}末`
}

/** 1項目分の表示（例: `すなあらし 防−11`） */
function itemText(item: AutoEventItem): string {
  if (item.kind === 'leechSeed') {
    return item.side === 'defender'
      ? `${item.label} 防−${item.amount} → 攻+${item.amount}`
      : `${item.label} 攻−${item.amount} → 防+${item.amount}`
  }
  const who = item.side === 'attacker' ? '攻' : '防'
  const sign = item.kind === 'recover' ? '+' : '−'
  return `${item.label} ${who}${sign}${item.amount}`
}

/**
 * 常時効果の自動展開を示す読み取り専用のゴースト行（V3.18.0 フェーズC）。
 * 同じタイミング（ターン）の項目を1行にまとめ、`・` 区切りで並べる。
 */
export function PassiveGhostRow({ items }: { items: AutoEventItem[] }) {
  if (items.length === 0) return null

  const groups: { key: string; when: string; items: AutoEventItem[] }[] = []
  for (const item of items) {
    const when = whenLabel(item)
    const last = groups[groups.length - 1]
    if (last && last.when === when) last.items.push(item)
    else groups.push({ key: `${when}-${groups.length}`, when, items: [item] })
  }

  return (
    <div
      aria-label="自動適用"
      className="ml-7 space-y-0.5 border-l-2 border-dashed border-edge py-0.5 pl-2"
    >
      {groups.map(group => (
        <div key={group.key} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-fg-faint">
          <span className="rounded border border-edge px-1 text-[10px] text-fg-faint" title="常時効果から自動で適用される項目（並べ替え・削除は各タブから）">
            自動
          </span>
          <span className="font-mono whitespace-nowrap">{group.when}:</span>
          <span className="min-w-0 break-words">
            {group.items.map(itemText).join(' · ')}
          </span>
        </div>
      ))}
    </div>
  )
}
