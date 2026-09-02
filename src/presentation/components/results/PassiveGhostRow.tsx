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

export interface PassiveGhostRowProps {
  items: AutoEventItem[]
  /**
   * 「固定化」ボタンのハンドラ。この行に現れる常時効果を全ターン分の手動イベントへ
   * 展開する。未指定ならボタンを描画しない。
   */
  onPin?: () => void
}

/**
 * 常時効果の自動展開を示す読み取り専用のゴースト行（V3.18.0 フェーズC）。
 * 同じタイミング（ターン）の項目を1行にまとめ、`・` 区切りで並べる。
 * 右端の「固定化」で編集可能な手動イベントへ変換できる（V3.18.2）。
 */
export function PassiveGhostRow({ items, onPin }: PassiveGhostRowProps) {
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
      className="ml-7 flex items-start gap-2 border-l-2 border-dashed border-edge py-0.5 pl-2"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
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
      {onPin && (
        <button
          type="button"
          onClick={onPin}
          title="この行に現れる常時効果を、全ターン分の手動イベントへ展開して編集可能にする"
          className="flex-shrink-0 rounded border border-edge px-1.5 py-0.5 text-[10px] text-fg-faint transition-colors hover:border-accent-border hover:text-accent focus-visible:ring-1 focus-visible:ring-accent-border"
        >
          固定化
        </button>
      )}
    </div>
  )
}
