import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import {
  useAttackerTabsStore, useDefenderTabsStore, POKEMON_TABS_MAX,
} from '@/presentation/store/pokemonTabsStore'

interface PokemonTabsBarProps {
  side: 'attacker' | 'defender'
}

/**
 * ポケモンタブバー。
 * 片側の複数構成をタブとして保持し、他方・フィールド・累積はそのままに
 * その側だけ切り替える。番号チップ（1..N）＋ ＋ 追加ボタン。
 */
export function PokemonTabsBar({ side }: PokemonTabsBarProps) {
  const isAttacker = side === 'attacker'
  const tabsStore = isAttacker ? useAttackerTabsStore : useDefenderTabsStore
  const liveStore = isAttacker ? useAttackerStore : useDefenderStore
  const sideLabel = isAttacker ? '攻撃側' : '防御側'

  const tabs = tabsStore(s => s.tabs)
  const activeTabId = tabsStore(s => s.activeTabId)
  const switchTab = tabsStore(s => s.switchTab)
  const addTab = tabsStore(s => s.addTab)
  const closeTab = tabsStore(s => s.closeTab)
  // アクティブタブのツールチップはライブ側の名前を使う
  const liveName = liveStore(s => s.pokemonName)

  if (tabs.length === 0) return null
  const atMax = tabs.length >= POKEMON_TABS_MAX
  const canClose = tabs.length > 1

  return (
    <div
      role="tablist"
      aria-label={`${sideLabel}ポケモンタブ`}
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
              className={`text-xs px-2.5 py-0.5 rounded border transition-colors ${
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
                aria-label={`${sideLabel}タブ${i + 1}を閉じる`}
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
        title={atMax ? '最大8個まで' : `${sideLabel}タブを追加`}
        aria-label={`${sideLabel}タブを追加`}
        className={`text-xs px-2 py-0.5 rounded border border-edge text-fg-muted transition-colors flex-shrink-0 ${
          atMax ? 'opacity-40 cursor-not-allowed' : 'hover:bg-surface-3'
        }`}
      >
        ＋
      </button>
    </div>
  )
}
