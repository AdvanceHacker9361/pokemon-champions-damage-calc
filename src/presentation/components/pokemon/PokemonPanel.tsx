import type { PokemonStore } from '@/presentation/store/pokemonStore'
import { useStatCalc } from '@/presentation/hooks/useStatCalc'
import { PokemonSearch } from './PokemonSearch'
import { AbilitySelect } from './AbilitySelect'
import { ItemSelect } from './ItemSelect'
import { MegaToggle } from './MegaToggle'
import { SpDistributionPanel } from './SpDistribution'
import { StatusToggle } from './StatusToggle'
import { ProteanTypePicker } from './ProteanTypePicker'
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

/** 手動トグルが必要な条件付き特性。key=特性名、value=表示する条件ラベル */
const ACTIVATABLE_ABILITIES: Record<string, string> = {
  'げきりゅう':   'HP1/3以下',
  'もうか':       'HP1/3以下',
  'しんりょく':   'HP1/3以下',
  'むしのしらせ': 'HP1/3以下',
  'マルチスケイル':   'HP満タン',
  'ファントムガード':  'HP満タン',
  'へんげんじざい':   'タイプ変換',
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

  const abilityConditionLabel = ACTIVATABLE_ABILITIES[store.effectiveAbility]

  return (
    <div className="panel space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{label}</h2>
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

          {/* バトルスイッチ: シールド/ブレードフォルム切り替え */}
          {store.effectiveAbility === 'バトルスイッチ' && (
            <div>
              <label className="label block mb-1">フォルム</label>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => store.setBlade(false)}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                    !store.isBlade
                      ? 'bg-slate-600 dark:bg-slate-500 border-slate-500 dark:border-slate-400 text-white'
                      : 'text-slate-500 border-slate-300 dark:border-slate-600 hover:border-slate-500 dark:hover:border-slate-500'
                  }`}
                >
                  🛡 シールドフォルム
                </button>
                <button
                  type="button"
                  onClick={() => store.setBlade(true)}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                    store.isBlade
                      ? 'bg-indigo-600 dark:bg-indigo-700 border-indigo-500 dark:border-indigo-600 text-white'
                      : 'text-slate-500 border-slate-300 dark:border-slate-600 hover:border-slate-500 dark:hover:border-slate-500'
                  }`}
                >
                  ⚔ ブレードフォルム
                </button>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-500 mt-0.5">
                {store.isBlade ? '攻撃時（A・C↑ / B・D↓）' : '防御時（B・D↑ / A・C↓）'}
              </p>
            </div>
          )}

          {/* 特性発動トグル（条件付き特性のみ表示） */}
          {abilityConditionLabel && (
            <div className="space-y-2">
              <div>
                <label className="label block mb-1">特性条件</label>
                <button
                  type="button"
                  onClick={() => store.setAbilityActivated(!store.abilityActivated)}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                    store.abilityActivated
                      ? 'text-indigo-600 border-indigo-500 bg-indigo-50 dark:text-indigo-400 dark:border-indigo-600 dark:bg-indigo-950'
                      : 'text-slate-500 border-slate-300 dark:border-slate-600 hover:border-slate-500 dark:hover:border-slate-500'
                  }`}
                >
                  {store.abilityActivated
                    ? `✓ ${abilityConditionLabel}`
                    : abilityConditionLabel}
                </button>
              </div>
              {/* へんげんじざい: 発動中かつ防御側（または攻撃側でタイプ選択を指定する場合）にタイプピッカーを表示 */}
              {store.effectiveAbility === 'へんげんじざい' && store.abilityActivated && label === '防御側' && (
                <ProteanTypePicker
                  value={store.proteanType}
                  onChange={store.setProteanType}
                />
              )}
            </div>
          )}

          {/* 技（攻撃側のみ） */}
          {showMoves && (
            <MoveSlots moves={store.moves} setMove={store.setMove} />
          )}
        </>
      )}
    </div>
  )
}
