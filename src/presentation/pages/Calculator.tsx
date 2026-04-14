import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { FieldStateBar } from '@/presentation/components/field/FieldStateBar'
import { PokemonPanel } from '@/presentation/components/pokemon/PokemonPanel'
import { DamageResultArea } from '@/presentation/components/results/DamageResultArea'
import { useDamageCalc } from '@/presentation/hooks/useDamageCalc'

function swapStores(
  attackerStore: ReturnType<typeof useAttackerStore.getState>,
  defenderStore: ReturnType<typeof useDefenderStore.getState>,
) {
  const a = { ...useAttackerStore.getState() }
  const d = { ...useDefenderStore.getState() }

  const pick = (s: typeof a) => ({
    pokemonId: s.pokemonId,
    pokemonName: s.pokemonName,
    natureName: s.natureName,
    sp: s.sp,
    abilityName: s.abilityName,
    itemName: s.itemName,
    isMega: s.isMega,
    canMega: s.canMega,
    ranks: s.ranks,
    status: s.status,
    moves: s.moves,
    baseStats: s.baseStats,
    types: s.types,
    weight: s.weight,
    effectiveAbility: s.effectiveAbility,
  })

  useAttackerStore.setState(pick(d))
  useDefenderStore.setState(pick(a))
  void attackerStore
  void defenderStore
}

export function Calculator() {
  const attackerStore = useAttackerStore()
  const defenderStore = useDefenderStore()

  useDamageCalc()

  return (
    <>
      <FieldStateBar />

      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* 攻撃側 */}
          <PokemonPanel store={attackerStore} label="攻撃側" showMoves />

          {/* ダメージ計算結果 */}
          <div className="flex flex-col gap-4">
            {/* 攻守交代ボタン */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => swapStores(attackerStore, defenderStore)}
                className="flex items-center gap-2 px-4 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-full border border-slate-600 transition-colors"
                title="攻撃側と防御側を入れ替え"
              >
                ⇄ 攻守交代
              </button>
            </div>
            <DamageResultArea />
          </div>

          {/* 防御側 */}
          <PokemonPanel store={defenderStore} label="防御側" />
        </div>
      </div>
    </>
  )
}
