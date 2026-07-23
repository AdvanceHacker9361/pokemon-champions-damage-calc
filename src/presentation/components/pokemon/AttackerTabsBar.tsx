import { useAttackerStore } from '@/presentation/store/pokemonStore'
import { useAttackerTabsStore, ATTACKER_TABS_MAX } from '@/presentation/store/attackerTabsStore'

/**
 * 攻撃側ポケモンタブバー。
 * 攻撃側の複数構成をタブとして保持し、防御側・フィールド・累積はそのままに
 * 攻撃側だけ切り替える。番号チップ（1..N）＋ ＋ 追加ボタン。
 */
export function AttackerTabsBar() {
  const tabs = useAttackerTabsStore(s => s.tabs)
  const activeTabId = useAttackerTabsStore(s => s.activeTabId)
  const switchTab = useAttackerTabsStore(s => s.switchTab)
  const addTab = useAttackerTabsStore(s => s.addTab)
  const closeTab = useAttackerTabsStore(s => s.closeTab)
  // アクティブタブのツールチップはライブ攻撃側名を使う
  const liveName = useAttackerStore(s => s.pokemonName)

  if (tabs.length === 0) return null
  const atMax = tabs.length >= ATTACKER_TABS_MAX
  const canClose = tabs.length > 1

  return (
    <div
      role="tablist"
      aria-label="攻撃側ポケモンタブ"
      className="flex items-center gap-1 overflow-x-auto min-w-0"
    >
      {tabs.map((tab, i) => {
        const isActive = tab.id === activeTabId
        const name =
          (isActive ? liveName : tab.snapshot.pokemonName) || 'ポケモン未選択'
        return (
          <div key={tab.id} className="flex items-center flex-shrink-0">
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => switchTab(tab.id)}
              title={name}
              className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                isActive
                  ? 'bg-accent-bg text-accent border-accent-border font-medium'
                  : 'text-fg-muted border-edge hover:bg-surface-3'
              }`}
            >
              {i + 1}
            </button>
            {isActive && canClose && (
              <button
                type="button"
                onClick={() => closeTab(tab.id)}
                className="leading-none rounded px-1 text-fg-subtle hover:text-fg-muted hover:bg-surface-2"
                title="このタブを閉じる"
                aria-label={`攻撃側タブ${i + 1}を閉じる`}
              >
                ×
              </button>
            )}
          </div>
        )
      })}
      <button
        type="button"
        onClick={() => addTab()}
        disabled={atMax}
        title={atMax ? '最大8個まで' : '攻撃側タブを追加'}
        aria-label="攻撃側タブを追加"
        className={`text-xs px-1.5 py-0.5 rounded border border-edge text-fg-muted transition-colors flex-shrink-0 ${
          atMax ? 'opacity-40 cursor-not-allowed' : 'hover:bg-surface-3'
        }`}
      >
        ＋
      </button>
    </div>
  )
}
