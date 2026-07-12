import { useEffect, useCallback } from 'react'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { useSessionStore, registerSessionUnloadListener } from '@/presentation/store/sessionStore'
import { PokemonPanel } from '@/presentation/components/pokemon/PokemonPanel'
import { SessionTabsBar } from '@/presentation/components/session/SessionTabsBar'
import { TabMemo } from '@/presentation/components/session/TabMemo'
import { DamageResultArea } from '@/presentation/components/results/DamageResultArea'
import { DamageSummaryHeader } from '@/presentation/components/results/DamageSummaryHeader'
import { DamageSequenceSummary } from '@/presentation/components/results/DamageSequenceSummary'
import { DamageProgressionSection } from '@/presentation/components/results/DamageProgressionSection'
import { FieldStateBar } from '@/presentation/components/field/FieldStateBar'
import { useDamageCalc } from '@/presentation/hooks/useDamageCalc'
import { useDefenderMaxHp } from '@/presentation/hooks/useDefenderMaxHp'
import { useKeyboardShortcuts } from '@/presentation/hooks/useKeyboardShortcuts'

/** 攻守交代 */
function swapStores() {
  const a = useAttackerStore.getState()
  const d = useDefenderStore.getState()

  const pick = (s: typeof a) => ({
    pokemonId: s.pokemonId,
    pokemonName: s.pokemonName,
    statNatures: s.statNatures,
    sp: s.sp,
    abilityName: s.abilityName,
    itemName: s.itemName,
    isMega: s.isMega,
    canMega: s.canMega,
    availableMegas: s.availableMegas,
    megaKey: s.megaKey,
    isBlade: s.isBlade,
    isMighty: s.isMighty,
    ranks: s.ranks,
    status: s.status,
    abilityActivated: s.abilityActivated,
    proteanType: s.proteanType,
    proteanStab: s.proteanStab,
    moves: s.moves,
    movePowers: s.movePowers,
    supremeOverlordBoost: s.supremeOverlordBoost,
    focusEnergyActive: s.focusEnergyActive,
    chargeActive: s.chargeActive,
    metronomeMultiplier: s.metronomeMultiplier,
    grounded: s.grounded,
    baseStats: s.baseStats,
    types: s.types,
    weight: s.weight,
    effectiveAbility: s.effectiveAbility,
  })

  useAttackerStore.setState(pick(d))
  useDefenderStore.setState(pick(a))
}

/** 初期ポケモン設定 */
function initDefaults() {
  // 攻撃側: ガブリアス A182 (atk SP=32) げきりん/じしん/いわなだれ/どくづき
  const atk = useAttackerStore.getState()
  atk.setPokemon(445)                  // ガブリアス
  useAttackerStore.getState().setSp('atk', 32)
  useAttackerStore.getState().setMove(0, 'げきりん')
  useAttackerStore.getState().setMove(1, 'じしん')
  useAttackerStore.getState().setMove(2, 'いわなだれ')
  useAttackerStore.getState().setMove(3, 'どくづき')

  // 防御側: メガガルーラ H207(hp SP=27) B120/D120(無振り)
  // すてみタックル/ねこだまし/じしん/ふいうち
  const def = useDefenderStore.getState()
  def.setPokemon(115)                  // ガルーラ
  useDefenderStore.getState().setMega(true)
  useDefenderStore.getState().setSp('hp',  27)
  useDefenderStore.getState().setMove(0, 'すてみタックル')
  useDefenderStore.getState().setMove(1, 'ねこだまし')
  useDefenderStore.getState().setMove(2, 'じしん')
  useDefenderStore.getState().setMove(3, 'ふいうち')
}

export function Calculator() {
  const attackerStore = useAttackerStore()
  const defenderStore = useDefenderStore()
  const defenderMaxHp = useDefenderMaxHp()

  useDamageCalc()

  const handleSwap = useCallback(() => swapStores(), [])
  useKeyboardShortcuts(handleSwap)

  // 初回マウント時にデフォルトポケモンを設定し、1つ目のタブを生成
  useEffect(() => {
    if (useSessionStore.getState().tabs.length > 0) {
      registerSessionUnloadListener()
      return
    }
    initDefaults()
    useSessionStore.getState().initFirstTab('タブ 1')
    registerSessionUnloadListener()
  }, [])

  return (
    <>
      <div className="max-w-7xl mx-auto px-2 sm:px-4 py-3 sm:py-4">
        {/* タブバー: 複数の計算状態を保持・切替 */}
        <SessionTabsBar />

        {/* 構築メモ: タブごとの自由記述メモ */}
        <TabMemo />

        <div className="calculator-flow mt-3 sm:mt-4">
          {/* モバイルの開始操作 */}
          <div className="flow-swap-mobile flex justify-center lg:hidden">
            <button
              type="button"
              onClick={swapStores}
              className="flex items-center gap-1.5 h-7 px-3 text-xs bg-surface-3 hover:bg-surface-2 text-fg-muted rounded-md transition-colors"
              title="攻撃側と防御側を入れ替え"
            >
              ⇆ 攻守交代
            </button>
          </div>

          <div className="flow-attacker min-w-0">
            <PokemonPanel store={attackerStore} label="攻撃側" showMoves />
          </div>

          <div className="flow-defender min-w-0">
            <PokemonPanel store={defenderStore} label="防御側" />
          </div>

          <div className="flow-field min-w-0">
            <FieldStateBar />
          </div>

          <div className="calculator-center-flow">
            <div className="hidden lg:flex justify-center">
              <button
                type="button"
                onClick={swapStores}
                className="flex items-center gap-1.5 h-7 px-3 text-xs bg-surface-3 hover:bg-surface-2 text-fg-muted rounded-md transition-colors"
                title="攻撃側と防御側を入れ替え"
              >
                ⇆ 攻守交代
              </button>
            </div>

            <div className="flow-progression min-w-0">
              <DamageProgressionSection defenderMaxHp={defenderMaxHp} />
            </div>

            <div className="flow-results min-w-0">
              <DamageResultArea />
            </div>
          </div>

          <div className="flow-summary min-w-0">
            <DamageSummaryHeader />
          </div>

          <div className="flow-sequence min-w-0">
            <DamageSequenceSummary />
          </div>
        </div>
      </div>
    </>
  )
}
