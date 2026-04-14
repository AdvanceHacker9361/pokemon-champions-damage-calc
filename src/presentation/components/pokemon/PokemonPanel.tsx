import type { PokemonStore } from '@/presentation/store/pokemonStore'
import { useStatCalc } from '@/presentation/hooks/useStatCalc'
import { PokemonSearch } from './PokemonSearch'
import { AbilitySelect } from './AbilitySelect'
import { ItemSelect } from './ItemSelect'
import { MegaToggle } from './MegaToggle'
import { SpDistributionPanel } from './SpDistribution'
import { StatusToggle } from './StatusToggle'
import { MoveSlots } from '@/presentation/components/moves/MoveSlots'
import { TypeBadge } from '@/presentation/components/shared/Badge'
import { PokemonRepository } from '@/data/repositories/PokemonRepository'
import type { PokemonRecord } from '@/data/schemas/types'
import type { TypeName, StatKey } from '@/domain/models/Pokemon'

interface PokemonPanelProps {
  store: PokemonStore
  label: '攻撃側' | '防御側'
  showMoves?: boolean
}

export function PokemonPanel({ store, label, showMoves = false }: PokemonPanelProps) {
  const computedStats = useStatCalc(store.baseStats, store.sp, store.statNatures, store.ranks)

  function handleSelectPokemon(pokemon: PokemonRecord) {
    store.setPokemon(pokemon.id)
  }

  const abilities = store.pokemonId
    ? (PokemonRepository.findById(store.pokemonId)?.abilities ?? [])
    : []

  const megaAbility = store.pokemonId
    ? PokemonRepository.getMegaByBaseId(store.pokemonId)?.ability
    : undefined

  return (
    <div className="panel space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300">{label}</h2>
        {store.pokemonId && (
          <div className="flex items-center gap-1.5">
            {store.types.map(t => <TypeBadge key={t} type={t as TypeName} />)}
            <MegaToggle
              isMega={store.isMega}
              canMega={store.canMega}
              onChange={store.setMega}
            />
          </div>
        )}
      </div>

      {/* ポケモン選択 */}
      <div>
        <label className="label block mb-1">ポケモン</label>
        <PokemonSearch
          value={store.pokemonName}
          onSelect={handleSelectPokemon}
        />
      </div>

      {store.pokemonId && (
        <>
          {/* SP配分 + ランク補正 + 性格（統合） */}
          <SpDistributionPanel
            sp={store.sp}
            stats={computedStats}
            onChangeSp={store.setSp}
            onSetPreset={store.setSpFull}
            ranks={store.ranks}
            onChangeRank={(stat: StatKey, rank: number) => store.setRank(stat, rank)}
            statNatures={store.statNatures}
            onChangeNature={(stat: StatKey, val: number) => store.setStatNature(stat, val)}
          />

          {/* 特性 */}
          <AbilitySelect
            value={store.abilityName}
            options={abilities}
            isMega={store.isMega}
            megaAbility={megaAbility}
            onChange={store.setAbility}
          />

          {/* 持ち物 */}
          <ItemSelect value={store.itemName} onChange={store.setItem} />

          {/* 状態異常 */}
          <StatusToggle value={store.status} onChange={store.setStatus} />

          {/* 技（攻撃側のみ） */}
          {showMoves && (
            <MoveSlots moves={store.moves} setMove={store.setMove} />
          )}
        </>
      )}
    </div>
  )
}
