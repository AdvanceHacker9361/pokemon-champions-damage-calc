import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { FieldStateBar } from '@/presentation/components/field/FieldStateBar'
import { PokemonPanel } from '@/presentation/components/pokemon/PokemonPanel'
import { DamageResultArea } from '@/presentation/components/results/DamageResultArea'
import { useDamageCalc } from '@/presentation/hooks/useDamageCalc'

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
            <DamageResultArea />
          </div>

          {/* 防御側 */}
          <PokemonPanel store={defenderStore} label="防御側" />
        </div>
      </div>
    </>
  )
}
