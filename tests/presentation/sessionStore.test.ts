import { afterEach, describe, expect, it } from 'vitest'
import { useSessionStore } from '@/presentation/store/sessionStore'
import { useAttackerStore } from '@/presentation/store/pokemonStore'

describe('sessionStore', () => {
  afterEach(() => {
    // タブ状態と localStorage をテスト間でリセット
    useSessionStore.setState({ tabs: [], activeTabId: null })
    window.localStorage.clear()
  })

  it('アクティブタブを複製すると、直近のライブ編集内容が複製先とライブUIの両方に反映される（ロールバックしない）', () => {
    // ガブリアス(445)で1つ目のタブを作成
    useAttackerStore.getState().setPokemon(445)
    useSessionStore.getState().initFirstTab('タブ 1')
    const originalTabId = useSessionStore.getState().activeTabId!

    // タブ切替を挟まずにライブストアを編集（= tabs 配列にはまだ反映されていない）
    useAttackerStore.getState().setPokemon(6) // リザードン
    expect(useAttackerStore.getState().pokemonId).toBe(6)

    // アクティブタブ自身を複製
    useSessionStore.getState().duplicateTab(originalTabId)

    // 複製先が新たなアクティブタブになっている
    const state = useSessionStore.getState()
    expect(state.tabs.length).toBe(2)
    expect(state.activeTabId).not.toBe(originalTabId)

    // 複製先タブのスナップショットは複製直前のライブ編集（リザードン）を反映している
    const newTab = state.tabs.find(t => t.id === state.activeTabId)!
    expect(newTab.snapshot.attacker.pokemonId).toBe(6)

    // ライブUI（攻撃側ストア）はロールバックせず、複製直前の編集内容を維持する
    expect(useAttackerStore.getState().pokemonId).toBe(6)

    // 複製元タブの保存内容も最新のライブ編集で更新されている（何も失われない）
    const originalTab = state.tabs.find(t => t.id === originalTabId)!
    expect(originalTab.snapshot.attacker.pokemonId).toBe(6)
  })

  it('非アクティブタブの複製は、そのタブの保存済みスナップショットをそのまま複製する', () => {
    useAttackerStore.getState().setPokemon(445) // ガブリアス
    useSessionStore.getState().initFirstTab('タブ 1')
    const tab1Id = useSessionStore.getState().activeTabId!

    // 2つ目のタブを作成（ここで tab1 に「ガブリアス」が保存される）
    useSessionStore.getState().createTab()
    const tab2Id = useSessionStore.getState().activeTabId!
    expect(tab2Id).not.toBe(tab1Id)

    // tab2 のライブ編集（tab1 には影響しない）
    useAttackerStore.getState().setPokemon(6) // リザードン

    // 非アクティブな tab1（ガブリアス保存済み）を複製
    useSessionStore.getState().duplicateTab(tab1Id)

    const state = useSessionStore.getState()
    const newTab = state.tabs.find(t => t.id === state.activeTabId)!
    // 複製先は tab1 の保存済み内容（ガブリアス）を引き継ぐ
    expect(newTab.snapshot.attacker.pokemonId).toBe(445)
    // 複製後はライブUIも複製先の内容に切り替わる
    expect(useAttackerStore.getState().pokemonId).toBe(445)

    // 複製直前にアクティブだった tab2 の編集（リザードン）も保存されている
    const tab2 = state.tabs.find(t => t.id === tab2Id)!
    expect(tab2.snapshot.attacker.pokemonId).toBe(6)
  })

  it('saveActiveTabSnapshot はライブUIを変更せず、アクティブタブの保存内容だけを更新する', () => {
    useAttackerStore.getState().setPokemon(445)
    useSessionStore.getState().initFirstTab('タブ 1')
    const tabId = useSessionStore.getState().activeTabId!

    useAttackerStore.getState().setPokemon(6)
    useSessionStore.getState().saveActiveTabSnapshot()

    const tab = useSessionStore.getState().tabs.find(t => t.id === tabId)!
    expect(tab.snapshot.attacker.pokemonId).toBe(6)
    // ライブUIはそのまま（restoreState は呼ばれない）
    expect(useAttackerStore.getState().pokemonId).toBe(6)
  })

  it('saveActiveTabSnapshot はタブが存在しない場合は何もしない', () => {
    expect(() => useSessionStore.getState().saveActiveTabSnapshot()).not.toThrow()
    expect(useSessionStore.getState().tabs).toEqual([])
  })
})
