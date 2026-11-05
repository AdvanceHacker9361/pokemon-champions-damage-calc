import type { BerryGhostItem } from '@/presentation/hooks/useBattleSequence'
import { berryItemText } from './berryGhostText'

const EPS = 0.0005

/** ツールチップ（期待回復・発動ステップ・連続技途中の注記） */
function berryItemTitle(item: BerryGhostItem): string {
  const lines = [`ステップ: ${item.stepLabel}`]
  if (item.triggerProb > EPS) lines.push(`期待回復 ${item.healExpected.toFixed(1)}`)
  if (item.stepKind === 'multiHit') lines.push('（連続技の途中を含む）')
  return lines.join('\n')
}

export interface BerryGhostRowProps {
  items: BerryGhostItem[]
}

/**
 * きのみ（オボン/混乱実）の発動を示す読み取り専用のゴースト行。
 * きのみはエンジンの状態機械内で乱数に応じて発動するため、直前のイベント（ステップ）で
 * 発動した確率を表示する。常時効果のゴースト行（`PassiveGhostRow`）と同じ見た目。
 */
export function BerryGhostRow({ items }: BerryGhostRowProps) {
  if (items.length === 0) return null
  // 同じイベントの複数ステップ（usages 展開・自動行）にまたがるときはステップ名を併記
  const showStep = new Set(items.map(item => item.stepLabel)).size > 1
  return (
    <div
      aria-label="きのみ発動"
      className="ml-7 flex items-start gap-2 border-l-2 border-dashed border-edge py-0.5 pl-2"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        {items.map((item, i) => (
          <div
            key={`${item.side}-${i}`}
            className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-fg-faint"
            title={berryItemTitle(item)}
          >
            <span className="rounded border border-edge px-1 text-[10px] text-fg-faint" title="きのみの設定（回復タブ）から自動で発動する項目。確率はこのステップ中に発動した割合">
              自動
            </span>
            <span className="min-w-0 break-words">{berryItemText(item)}</span>
            {showStep && (
              <span className="min-w-0 truncate text-[10px]">@ {item.stepLabel}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
