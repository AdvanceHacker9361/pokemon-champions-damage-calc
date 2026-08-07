import { afterEach, describe, expect, it } from 'vitest'
import { useAttackerTabsStore, useDefenderTabsStore } from '@/presentation/store/pokemonTabsStore'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { useSessionStore } from '@/presentation/store/sessionStore'
import { snapshotLiveState, restoreState } from '@/presentation/store/sessionSnapshot'

const GARCHOMP = 445
const CHARIZARD = 6
const KANGASKHAN = 115
const BLASTOISE = 9

describe('pokemonTabsStore（攻撃側）', () => {
  afterEach(() => {
    useAttackerTabsStore.setState({ tabs: [], activeTabId: null })
    useDefenderTabsStore.setState({ tabs: [], activeTabId: null })
    useAttackerStore.getState().reset()
    useDefenderStore.getState().reset()
    useSessionStore.setState({ tabs: [], activeTabId: null })
    window.localStorage.clear()
  })

  it('initIfEmpty はライブ攻撃側から1タブを生成し、冪等である', () => {
    useAttackerStore.getState().setPokemon(GARCHOMP)
    useAttackerTabsStore.getState().initIfEmpty()

    let state = useAttackerTabsStore.getState()
    expect(state.tabs.length).toBe(1)
    expect(state.tabs[0].snapshot.pokemonId).toBe(GARCHOMP)
    const firstId = state.activeTabId

    // 2回目は何もしない（冪等）
    useAttackerTabsStore.getState().initIfEmpty()
    state = useAttackerTabsStore.getState()
    expect(state.tabs.length).toBe(1)
    expect(state.activeTabId).toBe(firstId)
  })

  it('addTab は現ライブを保存して複製し、新タブをアクティブにする（ライブは不変）', () => {
    useAttackerStore.getState().setPokemon(GARCHOMP)
    useAttackerTabsStore.getState().initIfEmpty()
    const tab1 = useAttackerTabsStore.getState().activeTabId

    useAttackerTabsStore.getState().addTab()
    const state = useAttackerTabsStore.getState()
    expect(state.tabs.length).toBe(2)
    expect(state.activeTabId).not.toBe(tab1)
    // ライブ攻撃側は変わらない
    expect(useAttackerStore.getState().pokemonId).toBe(GARCHOMP)
    // 旧タブ・新タブとも複製内容（ガブリアス）
    expect(state.tabs[0].snapshot.pokemonId).toBe(GARCHOMP)
    expect(state.tabs[1].snapshot.pokemonId).toBe(GARCHOMP)
  })

  it('switchTab は対象タブをライブへ復元し、離脱タブのライブ編集を保存する', () => {
    useAttackerStore.getState().setPokemon(GARCHOMP)
    useAttackerStore.getState().setSp('atk', 32)
    useAttackerTabsStore.getState().initIfEmpty()
    const tab1 = useAttackerTabsStore.getState().activeTabId!

    useAttackerTabsStore.getState().addTab()
    const tab2 = useAttackerTabsStore.getState().activeTabId!
    // tab2 のライブ編集
    useAttackerStore.getState().setPokemon(CHARIZARD)
    useAttackerStore.getState().setRank('spa', 2)

    // tab1 に戻す
    useAttackerTabsStore.getState().switchTab(tab1)
    expect(useAttackerStore.getState().pokemonId).toBe(GARCHOMP)
    expect(useAttackerStore.getState().sp.atk).toBe(32)

    // tab2 に切替 → 離脱時に保存された編集内容が復元される
    useAttackerTabsStore.getState().switchTab(tab2)
    expect(useAttackerStore.getState().pokemonId).toBe(CHARIZARD)
    expect(useAttackerStore.getState().ranks.spa).toBe(2)
  })

  it('切替後のライブ編集は保存済みスナップショットを汚染しない（深いコピー）', () => {
    useAttackerStore.getState().setPokemon(GARCHOMP)
    useAttackerTabsStore.getState().initIfEmpty()
    const tab1 = useAttackerTabsStore.getState().activeTabId!
    useAttackerTabsStore.getState().addTab()
    const tab2 = useAttackerTabsStore.getState().activeTabId!

    // tab1 に切替（このとき tab2 の snapshot が保存される）
    useAttackerTabsStore.getState().switchTab(tab1)

    // ライブを大きく変更
    useAttackerStore.getState().setSp('atk', 20)
    useAttackerStore.getState().setRank('atk', 3)
    useAttackerStore.getState().setMove(0, 'じしん')

    // tab2 の保存済みスナップショットは影響を受けない
    const stored = useAttackerTabsStore.getState().tabs.find(t => t.id === tab2)!.snapshot
    expect(stored.sp.atk).toBe(0)
    expect(stored.ranks.atk).toBe(0)
    expect(stored.moves[0]).not.toBe('じしん')
  })

  it('closeTab: 残1件は閉じない / アクティブを閉じると隣を復元 / 非アクティブは閉じてもライブ不変', () => {
    // 残1件ガード
    useAttackerStore.getState().setPokemon(GARCHOMP)
    useAttackerTabsStore.getState().initIfEmpty()
    const only = useAttackerTabsStore.getState().activeTabId!
    useAttackerTabsStore.getState().closeTab(only)
    expect(useAttackerTabsStore.getState().tabs.length).toBe(1)

    // アクティブを閉じると左隣を復元
    const tab1 = useAttackerTabsStore.getState().activeTabId!
    useAttackerTabsStore.getState().addTab()
    const tab2 = useAttackerTabsStore.getState().activeTabId!
    useAttackerStore.getState().setPokemon(CHARIZARD) // tab2 ライブ
    useAttackerTabsStore.getState().closeTab(tab2)
    expect(useAttackerTabsStore.getState().tabs.length).toBe(1)
    expect(useAttackerTabsStore.getState().activeTabId).toBe(tab1)
    expect(useAttackerStore.getState().pokemonId).toBe(GARCHOMP)

    // 非アクティブを閉じてもライブは変わらない
    useAttackerTabsStore.getState().addTab()
    const tab3 = useAttackerTabsStore.getState().activeTabId!
    useAttackerStore.getState().setPokemon(CHARIZARD) // tab3 ライブ
    useAttackerTabsStore.getState().closeTab(tab1) // 非アクティブ
    expect(useAttackerTabsStore.getState().tabs.length).toBe(1)
    expect(useAttackerTabsStore.getState().activeTabId).toBe(tab3)
    expect(useAttackerStore.getState().pokemonId).toBe(CHARIZARD)
  })

  it('addTab は8タブで打ち止め', () => {
    useAttackerStore.getState().setPokemon(GARCHOMP)
    useAttackerTabsStore.getState().initIfEmpty()
    for (let i = 0; i < 12; i++) useAttackerTabsStore.getState().addTab()
    expect(useAttackerTabsStore.getState().tabs.length).toBe(8)
  })

  it('攻撃側タブ操作は防御側ストアに一切触れない', () => {
    useDefenderStore.getState().setPokemon(KANGASKHAN)
    useAttackerStore.getState().setPokemon(GARCHOMP)
    useAttackerTabsStore.getState().initIfEmpty()
    const tab1 = useAttackerTabsStore.getState().activeTabId!

    useAttackerTabsStore.getState().addTab()
    const tab2 = useAttackerTabsStore.getState().activeTabId!
    useAttackerTabsStore.getState().switchTab(tab1)
    useAttackerTabsStore.getState().closeTab(tab2)

    expect(useDefenderStore.getState().pokemonId).toBe(KANGASKHAN)
  })

  it('セッション往復: snapshotLiveState → restoreState でライブ攻撃側と全タブが戻る', () => {
    useAttackerStore.getState().setPokemon(GARCHOMP)
    useAttackerTabsStore.getState().initIfEmpty()
    useAttackerTabsStore.getState().addTab()
    // tab2 のライブ編集
    useAttackerStore.getState().setPokemon(CHARIZARD)

    useDefenderStore.getState().setPokemon(KANGASKHAN)
    useDefenderTabsStore.getState().initIfEmpty()

    const snap = snapshotLiveState()
    expect(snap.attackerTabs).toBeDefined()
    expect(snap.attackerTabs!.tabs.length).toBe(2)
    // 防御側タブも同時にキャプチャされる
    expect(snap.defenderTabs).toBeDefined()
    expect(snap.defenderTabs!.tabs.length).toBe(1)
    expect(snap.defenderTabs!.tabs[0].snapshot.pokemonId).toBe(KANGASKHAN)

    // すべて破壊
    useAttackerStore.getState().setPokemon(KANGASKHAN)
    useAttackerTabsStore.setState({ tabs: [], activeTabId: null })

    restoreState(snap)
    // ライブ攻撃側はスナップショット時のアクティブ内容（リザードン）
    expect(useAttackerStore.getState().pokemonId).toBe(CHARIZARD)
    // タブ集合も復元
    expect(useAttackerTabsStore.getState().tabs.length).toBe(2)
  })

  it('attackerTabs 無しのレガシースナップショット復元は単一タブを snap.attacker から生成する', () => {
    useAttackerStore.getState().setPokemon(GARCHOMP)
    useAttackerTabsStore.getState().initIfEmpty()
    const snap = snapshotLiveState()
    const legacy = { ...snap, attackerTabs: undefined }

    useAttackerTabsStore.setState({ tabs: [], activeTabId: null })
    restoreState(legacy)

    const state = useAttackerTabsStore.getState()
    expect(state.tabs.length).toBe(1)
    expect(state.tabs[0].snapshot.pokemonId).toBe(legacy.attacker.pokemonId)
    expect(state.activeTabId).toBe(state.tabs[0].id)
  })

  it('defenderTabs のみ欠けたスナップショット（V3.16.0 世代）は防御側を snap.defender から単一タブ生成する', () => {
    useAttackerStore.getState().setPokemon(GARCHOMP)
    useDefenderStore.getState().setPokemon(KANGASKHAN)
    useAttackerTabsStore.getState().initIfEmpty()
    useAttackerTabsStore.getState().addTab()
    useDefenderTabsStore.getState().initIfEmpty()

    const snap = snapshotLiveState()
    const legacy = { ...snap, defenderTabs: undefined }

    useAttackerTabsStore.setState({ tabs: [], activeTabId: null })
    useDefenderTabsStore.setState({ tabs: [], activeTabId: null })
    restoreState(legacy)

    // 攻撃側タブは保存済みのものがそのまま戻る
    expect(useAttackerTabsStore.getState().tabs.length).toBe(2)
    // 防御側は snap.defender から1タブだけ生成される
    const dState = useDefenderTabsStore.getState()
    expect(dState.tabs.length).toBe(1)
    expect(dState.tabs[0].snapshot.pokemonId).toBe(legacy.defender.pokemonId)
    expect(dState.activeTabId).toBe(dState.tabs[0].id)
  })
})

describe('pokemonTabsStore（防御側）', () => {
  afterEach(() => {
    useAttackerTabsStore.setState({ tabs: [], activeTabId: null })
    useDefenderTabsStore.setState({ tabs: [], activeTabId: null })
    useAttackerStore.getState().reset()
    useDefenderStore.getState().reset()
    useSessionStore.setState({ tabs: [], activeTabId: null })
    window.localStorage.clear()
  })

  it('initIfEmpty はライブ防御側から1タブを生成し、冪等である', () => {
    useDefenderStore.getState().setPokemon(KANGASKHAN)
    useDefenderTabsStore.getState().initIfEmpty()

    let state = useDefenderTabsStore.getState()
    expect(state.tabs.length).toBe(1)
    expect(state.tabs[0].snapshot.pokemonId).toBe(KANGASKHAN)
    const firstId = state.activeTabId

    useDefenderTabsStore.getState().initIfEmpty()
    state = useDefenderTabsStore.getState()
    expect(state.tabs.length).toBe(1)
    expect(state.activeTabId).toBe(firstId)
  })

  it('switchTab は防御側ライブを往復復元し、攻撃側ストア・攻撃側タブに触れない', () => {
    useAttackerStore.getState().setPokemon(GARCHOMP)
    useAttackerTabsStore.getState().initIfEmpty()
    const attackerTabId = useAttackerTabsStore.getState().activeTabId

    useDefenderStore.getState().setPokemon(KANGASKHAN)
    useDefenderStore.getState().setSp('def', 32)
    useDefenderTabsStore.getState().initIfEmpty()
    const tab1 = useDefenderTabsStore.getState().activeTabId!

    useDefenderTabsStore.getState().addTab()
    const tab2 = useDefenderTabsStore.getState().activeTabId!
    useDefenderStore.getState().setPokemon(BLASTOISE)
    useDefenderStore.getState().setRank('spd', 2)

    useDefenderTabsStore.getState().switchTab(tab1)
    expect(useDefenderStore.getState().pokemonId).toBe(KANGASKHAN)
    expect(useDefenderStore.getState().sp.def).toBe(32)

    useDefenderTabsStore.getState().switchTab(tab2)
    expect(useDefenderStore.getState().pokemonId).toBe(BLASTOISE)
    expect(useDefenderStore.getState().ranks.spd).toBe(2)

    // 攻撃側は無傷（2つのタブストアは独立）
    expect(useAttackerStore.getState().pokemonId).toBe(GARCHOMP)
    expect(useAttackerTabsStore.getState().tabs.length).toBe(1)
    expect(useAttackerTabsStore.getState().activeTabId).toBe(attackerTabId)
  })

  it('攻撃側タブ操作は防御側タブストアに触れない', () => {
    useDefenderStore.getState().setPokemon(KANGASKHAN)
    useDefenderTabsStore.getState().initIfEmpty()
    const defenderTabId = useDefenderTabsStore.getState().activeTabId

    useAttackerStore.getState().setPokemon(GARCHOMP)
    useAttackerTabsStore.getState().initIfEmpty()
    useAttackerTabsStore.getState().addTab()
    useAttackerStore.getState().setPokemon(CHARIZARD)

    expect(useDefenderTabsStore.getState().tabs.length).toBe(1)
    expect(useDefenderTabsStore.getState().activeTabId).toBe(defenderTabId)
    expect(useDefenderStore.getState().pokemonId).toBe(KANGASKHAN)
  })

  it('closeTab: 残1件は閉じない / アクティブを閉じると左隣を防御側ライブへ復元', () => {
    useDefenderStore.getState().setPokemon(KANGASKHAN)
    useDefenderTabsStore.getState().initIfEmpty()
    const only = useDefenderTabsStore.getState().activeTabId!
    useDefenderTabsStore.getState().closeTab(only)
    expect(useDefenderTabsStore.getState().tabs.length).toBe(1)

    const tab1 = useDefenderTabsStore.getState().activeTabId!
    useDefenderTabsStore.getState().addTab()
    const tab2 = useDefenderTabsStore.getState().activeTabId!
    useDefenderStore.getState().setPokemon(BLASTOISE)
    useDefenderTabsStore.getState().closeTab(tab2)

    expect(useDefenderTabsStore.getState().tabs.length).toBe(1)
    expect(useDefenderTabsStore.getState().activeTabId).toBe(tab1)
    expect(useDefenderStore.getState().pokemonId).toBe(KANGASKHAN)
  })

  it('addTab は8タブで打ち止め', () => {
    useDefenderStore.getState().setPokemon(KANGASKHAN)
    useDefenderTabsStore.getState().initIfEmpty()
    for (let i = 0; i < 12; i++) useDefenderTabsStore.getState().addTab()
    expect(useDefenderTabsStore.getState().tabs.length).toBe(8)
  })

  it('セッション往復: 防御側タブ集合とライブ防御側が戻る', () => {
    useDefenderStore.getState().setPokemon(KANGASKHAN)
    useDefenderTabsStore.getState().initIfEmpty()
    useDefenderTabsStore.getState().addTab()
    useDefenderStore.getState().setPokemon(BLASTOISE)

    const snap = snapshotLiveState()
    expect(snap.defenderTabs!.tabs.length).toBe(2)

    useDefenderStore.getState().setPokemon(GARCHOMP)
    useDefenderTabsStore.setState({ tabs: [], activeTabId: null })

    restoreState(snap)
    expect(useDefenderStore.getState().pokemonId).toBe(BLASTOISE)
    expect(useDefenderTabsStore.getState().tabs.length).toBe(2)
  })
})
