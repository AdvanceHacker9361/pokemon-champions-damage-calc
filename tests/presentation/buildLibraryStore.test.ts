import { afterEach, describe, expect, it } from 'vitest'
import {
  BUILD_LIBRARY_MAX, loadRegisteredBuild, normalizeBuildSnapshot,
  useBuildLibraryStore, type RegisteredBuild,
} from '@/presentation/store/buildLibraryStore'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { useAttackerTabsStore } from '@/presentation/store/attackerTabsStore'
import { clonePokemonSnapshot, type PokemonSnapshot } from '@/presentation/store/sessionSnapshot'
import { PokemonRepository } from '@/data/repositories/PokemonRepository'

const GARCHOMP = 445
const CHARIZARD = 6
const KANGASKHAN = 115
const AEGISLASH = 681

function lib() {
  return useBuildLibraryStore.getState()
}

function attackerSnapshot(): PokemonSnapshot {
  return clonePokemonSnapshot(useAttackerStore.getState())
}

function stubBuild(i: number): RegisteredBuild {
  return {
    id: `stub-${i}`,
    nickname: `stub-${i}`,
    snapshot: clonePokemonSnapshot(useAttackerStore.getState()),
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('buildLibraryStore', () => {
  afterEach(() => {
    useBuildLibraryStore.setState({ builds: [] })
    useAttackerTabsStore.setState({ tabs: [], activeTabId: null })
    useAttackerStore.getState().reset()
    useDefenderStore.getState().reset()
    window.localStorage.clear()
  })

  it('registerBuild は一時的な戦闘状態を初期化し、構成は保持する', () => {
    const a = useAttackerStore.getState()
    a.setPokemon(GARCHOMP)
    a.setSp('atk', 32)
    a.setStatNature('atk', 1.1)
    a.setItem('いのちのたま')
    a.setMove(0, 'じしん')
    a.setMovePower(0, 120)
    // 一時状態
    a.setRank('atk', 3)
    a.setStatus('やけど')
    a.setFocusEnergyActive(true)
    a.setChargeActive(true)
    a.setGrounded(true)
    a.setSupremeOverlordBoost(2)
    a.setProteanType('みず')
    a.setProteanStab(false)
    a.setMetronomeMultiplier(2)

    const build = lib().registerBuild('がぶ', attackerSnapshot())
    expect(build).not.toBeNull()
    const s = build!.snapshot

    // リセットされる
    expect(s.ranks).toEqual({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 })
    expect(s.status).toBeNull()
    expect(s.focusEnergyActive).toBe(false)
    expect(s.chargeActive).toBe(false)
    expect(s.grounded).toBe(false)
    expect(s.supremeOverlordBoost).toBe(0)
    expect(s.proteanType).toBeNull()
    expect(s.proteanStab).toBe(true)
    expect(s.metronomeMultiplier).toBe(1)
    expect(s.isBlade).toBe(false)
    expect(s.isMighty).toBe(false)

    // 保持される
    expect(s.pokemonId).toBe(GARCHOMP)
    expect(s.sp.atk).toBe(32)
    expect(s.statNatures.atk).toBe(1.1)
    expect(s.itemName).toBe('いのちのたま')
    expect(s.moves[0]).toBe('じしん')
    expect(s.movePowers[0]).toBe(120)
    expect(lib().builds.length).toBe(1)
  })

  it('registerBuild はブレードフォルムの種族値上書きを打ち消す', () => {
    useAttackerStore.getState().setPokemon(AEGISLASH)
    useAttackerStore.getState().setBlade(true)
    const bladeStats = { ...useAttackerStore.getState().baseStats }

    const build = lib().registerBuild('ギルガルド', attackerSnapshot())!
    const shield = PokemonRepository.findById(AEGISLASH)!.baseStats
    expect(bladeStats.atk).not.toBe(shield.atk)
    expect(build.snapshot.baseStats).toEqual(shield)
    expect(build.snapshot.isBlade).toBe(false)
  })

  it('registerBuild は baseStats/types/weight をリポジトリから引き直す（通常・メガ）', () => {
    useAttackerStore.getState().setPokemon(GARCHOMP)
    // ライブの派生値を破壊
    useAttackerStore.setState({
      baseStats: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
      types: [],
      weight: -1,
    })

    const build = lib().registerBuild('がぶ', attackerSnapshot())!
    const record = PokemonRepository.findById(GARCHOMP)!
    expect(build.snapshot.baseStats).toEqual(record.baseStats)
    expect(build.snapshot.types).toEqual(record.types)
    expect(build.snapshot.weight).toBe(record.weight)

    // メガ形態
    useAttackerStore.getState().setPokemon(CHARIZARD)
    useAttackerStore.getState().setMega(true)
    const megaKey = useAttackerStore.getState().megaKey!
    useAttackerStore.setState({ baseStats: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 } })

    const megaBuild = lib().registerBuild('メガリザ', attackerSnapshot())!
    const mega = PokemonRepository.getMegaByKey(megaKey)!
    expect(megaBuild.snapshot.isMega).toBe(true)
    expect(megaBuild.snapshot.megaKey).toBe(megaKey)
    expect(megaBuild.snapshot.baseStats).toEqual(mega.baseStats)
    expect(megaBuild.snapshot.effectiveAbility).toBe(mega.ability)
  })

  it('registerBuild はポケモン未選択と上限到達で null を返す', () => {
    expect(lib().registerBuild('空', attackerSnapshot())).toBeNull()

    useAttackerStore.getState().setPokemon(GARCHOMP)
    const stubs = Array.from({ length: BUILD_LIBRARY_MAX }, (_, i) => stubBuild(i))
    useBuildLibraryStore.setState({ builds: stubs })
    expect(lib().registerBuild('溢れ', attackerSnapshot())).toBeNull()
    expect(lib().builds.length).toBe(BUILD_LIBRARY_MAX)
  })

  it('rename / remove / overwrite が期待通り動く', () => {
    useAttackerStore.getState().setPokemon(GARCHOMP)
    const build = lib().registerBuild('がぶ', attackerSnapshot())!
    const created = build.createdAt

    lib().renameBuild(build.id, '  改名  ')
    expect(lib().builds[0].nickname).toBe('改名')
    // 空文字は無視
    lib().renameBuild(build.id, '   ')
    expect(lib().builds[0].nickname).toBe('改名')

    // overwrite: nickname / createdAt は維持し updatedAt を進める
    useBuildLibraryStore.setState({
      builds: lib().builds.map(b => ({ ...b, updatedAt: 0 })),
    })
    useAttackerStore.getState().setPokemon(KANGASKHAN)
    expect(lib().overwriteBuild(build.id, attackerSnapshot())).toBe(true)
    const after = lib().builds[0]
    expect(after.snapshot.pokemonId).toBe(KANGASKHAN)
    expect(after.nickname).toBe('改名')
    expect(after.createdAt).toBe(created)
    expect(after.updatedAt).toBeGreaterThan(0)
    expect(lib().overwriteBuild('missing', attackerSnapshot())).toBe(false)

    lib().removeBuild(build.id)
    expect(lib().builds.length).toBe(0)
  })

  it("loadRegisteredBuild('defender') は防御側だけを上書きする", () => {
    useAttackerStore.getState().setPokemon(GARCHOMP)
    const build = lib().registerBuild('がぶ', attackerSnapshot())!

    useDefenderStore.getState().setPokemon(CHARIZARD)
    useDefenderStore.getState().setRank('def', 2)
    useAttackerStore.getState().setPokemon(KANGASKHAN)
    useAttackerTabsStore.getState().initIfEmpty()
    const tabsBefore = useAttackerTabsStore.getState().tabs.length

    loadRegisteredBuild('defender', build)
    expect(useDefenderStore.getState().pokemonId).toBe(GARCHOMP)
    expect(useDefenderStore.getState().ranks.def).toBe(0)
    // 攻撃側は無傷
    expect(useAttackerStore.getState().pokemonId).toBe(KANGASKHAN)
    expect(useAttackerTabsStore.getState().tabs.length).toBe(tabsBefore)
  })

  it("loadRegisteredBuild('attacker') は現在のパネルを上書きし、タブ数を変えない", () => {
    useAttackerStore.getState().setPokemon(GARCHOMP)
    const build = lib().registerBuild('がぶ', attackerSnapshot())!

    useAttackerStore.getState().setPokemon(KANGASKHAN)
    useAttackerStore.getState().setRank('atk', 2)
    useAttackerTabsStore.getState().initIfEmpty()
    const tabsBefore = useAttackerTabsStore.getState().tabs.length
    const activeBefore = useAttackerTabsStore.getState().activeTabId
    useDefenderStore.getState().setPokemon(CHARIZARD)

    loadRegisteredBuild('attacker', build)

    // ライブ攻撃側＝登録個体（正規化済み）へ差し替わる。タブは増えない
    expect(useAttackerStore.getState().pokemonId).toBe(GARCHOMP)
    expect(useAttackerStore.getState().ranks.atk).toBe(0)
    expect(useAttackerTabsStore.getState().tabs.length).toBe(tabsBefore)
    expect(useAttackerTabsStore.getState().activeTabId).toBe(activeBefore)
    // 防御側は無傷
    expect(useDefenderStore.getState().pokemonId).toBe(CHARIZARD)
  })

  it('エクスポート→インポートで往復できる（id は再採番）', () => {
    useAttackerStore.getState().setPokemon(GARCHOMP)
    useAttackerStore.getState().setSp('spe', 32)
    const b1 = lib().registerBuild('がぶ', attackerSnapshot())!
    useAttackerStore.getState().setPokemon(CHARIZARD)
    useAttackerStore.getState().setMega(true)
    const b2 = lib().registerBuild('メガリザ', attackerSnapshot())!

    const text = lib().exportAllText()
    useBuildLibraryStore.setState({ builds: [] })

    const result = lib().importBuilds(text)
    expect(result).toEqual({ ok: true, added: 2 })
    const imported = lib().builds
    expect(imported.map(b => b.nickname)).toEqual([b2.nickname, b1.nickname])
    expect(imported[0].snapshot).toEqual(b2.snapshot)
    expect(imported[1].snapshot).toEqual(b1.snapshot)
    expect(imported.map(b => b.id)).not.toContain(b1.id)
    expect(imported.map(b => b.id)).not.toContain(b2.id)

    // 単体エクスポート
    const one = lib().exportOneText(imported[0].id)!
    expect(JSON.parse(one).builds.length).toBe(1)
    expect(lib().exportOneText('missing')).toBeNull()
  })

  it('importBuilds は不正入力を拒否し、壊れたエントリだけを飛ばす', () => {
    expect(lib().importBuilds('これはJSONではない').ok).toBe(false)
    expect(lib().importBuilds('{"app":"other","version":1,"builds":[]}').ok).toBe(false)
    expect(lib().importBuilds('{"app":"pcma-builds","version":9,"builds":[]}').ok).toBe(false)
    expect(lib().importBuilds('{"app":"pcma-builds","version":1,"builds":{}}').ok).toBe(false)
    expect(lib().importBuilds('{"app":"pcma-builds","version":1,"builds":[]}').ok).toBe(false)
    expect(lib().builds.length).toBe(0)

    const text = JSON.stringify({
      app: 'pcma-builds',
      version: 1,
      builds: [
        { nickname: '', snapshot: { pokemonId: GARCHOMP } },          // nickname 欠落
        { nickname: 'ダメ', snapshot: null },                          // snapshot 欠落
        { nickname: 'ダメ2', snapshot: { pokemonName: 'x' } },         // pokemonId 欠落
        { nickname: 'OK', snapshot: { pokemonId: GARCHOMP, evil: 1, hacked: true } },
      ],
    })
    const result = lib().importBuilds(text)
    expect(result).toEqual({ ok: true, added: 1 })
    const s = lib().builds[0].snapshot as PokemonSnapshot & Record<string, unknown>
    expect(lib().builds[0].nickname).toBe('OK')
    expect(s.pokemonId).toBe(GARCHOMP)
    // 未知キーは落ちる
    expect(s.evil).toBeUndefined()
    expect(s.hacked).toBeUndefined()
    // 派生値はリポジトリから再解決される
    expect(s.baseStats).toEqual(PokemonRepository.findById(GARCHOMP)!.baseStats)
  })

  it('登録内容が localStorage に永続化される', () => {
    useAttackerStore.getState().setPokemon(GARCHOMP)
    lib().registerBuild('がぶ', attackerSnapshot())

    const raw = window.localStorage.getItem('pcma-builds-v1')
    expect(raw).not.toBeNull()
    const persisted = JSON.parse(raw!)
    expect(persisted.state.builds.length).toBe(1)
    expect(persisted.state.builds[0].nickname).toBe('がぶ')
    expect(persisted.state.builds[0].snapshot.pokemonId).toBe(GARCHOMP)

    // リロード相当: メモリを空にしてから永続データを流し込む
    useBuildLibraryStore.setState({ builds: [] })
    useBuildLibraryStore.setState({ builds: persisted.state.builds })
    expect(lib().builds[0].snapshot.pokemonId).toBe(GARCHOMP)
  })

  it('normalizeBuildSnapshot は満タン条件特性の abilityActivated を復元する', () => {
    useAttackerStore.getState().setPokemon(GARCHOMP)
    useAttackerStore.getState().setAbility('マルチスケイル')
    const off = { ...attackerSnapshot(), abilityActivated: false }
    expect(normalizeBuildSnapshot(off).abilityActivated).toBe(true)

    useAttackerStore.getState().setAbility('すながくれ')
    const on = { ...attackerSnapshot(), abilityActivated: true }
    expect(normalizeBuildSnapshot(on).abilityActivated).toBe(false)
  })
})
