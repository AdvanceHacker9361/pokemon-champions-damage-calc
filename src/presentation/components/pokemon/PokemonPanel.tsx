import { useState } from 'react'
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
  'ばけのかわ':   'ばけのかわ有効',
}

export function PokemonPanel({ store, label, showMoves = false }: PokemonPanelProps) {
  const [showDefenderMoves, setShowDefenderMoves] = useState(false)
  const computedStats = useStatCalc(store.baseStats, store.sp, store.statNatures, store.ranks)
  const defenderMoveNames = store.moves.filter((move): move is string => move !== null)
  const defenderMoveSummary =
    defenderMoveNames.length > 0
      ? `${defenderMoveNames.length}件: ${defenderMoveNames.slice(0, 2).join(' / ')}${defenderMoveNames.length > 2 ? ' ほか' : ''}`
      : '未設定'

  function handleSelectPokemon(pokemon: PokemonRecord) {
    store.setPokemon(pokemon.id)
  }

  const abilities = store.pokemonId
    ? (PokemonRepository.findById(store.pokemonId)?.abilities ?? [])
    : []

  // store.effectiveAbility はメガX/Y切り替え済みの正しい特性を保持している
  const megaAbility = store.isMega ? store.effectiveAbility : undefined

  const abilityConditionLabel = ACTIVATABLE_ABILITIES[store.effectiveAbility]

  return (
    <div className="panel space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium text-fg-muted">{label}</h2>
        {store.pokemonId && (
          <div className="flex items-center gap-1.5">
            {store.types.map(t => <TypeBadge key={t} type={t as TypeName} />)}
            <MegaToggle
              isMega={store.isMega}
              canMega={store.canMega}
              availableMegas={store.availableMegas}
              megaKey={store.megaKey}
              onChange={store.setMega}
              onFormChange={store.setMegaForm}
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
          listenFocusShortcut={label === '攻撃側'}
        />
        {store.pokemonId && (
          <div className="flex gap-3 mt-1 text-xs text-fg-muted">
            {([['H', store.baseStats.hp], ['A', store.baseStats.atk], ['B', store.baseStats.def], ['C', store.baseStats.spa], ['D', store.baseStats.spd], ['S', store.baseStats.spe]] as [string, number][]).map(([label, val]) => (
              <span key={label}><span className="text-fg-subtle mr-0.5">{label}</span>{val}</span>
            ))}
          </div>
        )}
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

          {/* うちおとす（接地）: 防御側がひこうタイプ or ふゆう特性のときのみ表示 */}
          {label === '防御側' &&
            (store.types.includes('ひこう') || store.effectiveAbility === 'ふゆう') && (
            <div>
              <label className="label block mb-1">接地状態</label>
              <button
                type="button"
                onClick={() => store.setGrounded(!store.grounded)}
                className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                  store.grounded
                    ? 'bg-accent-bg text-accent border-accent-border'
                    : 'text-fg-muted border-edge hover:bg-surface-3'
                }`}
              >
                {store.grounded ? '✓ うちおとす（接地）' : 'うちおとす（接地）'}
              </button>
              <p className="text-[11px] text-fg-subtle mt-0.5">じめん技が当たるようになる</p>
            </div>
          )}

          {/* きあいだめ + じゅうでん（攻撃側のみ） */}
          {label === '攻撃側' && (
            <div className="flex gap-3">
              <div>
                <label className="label block mb-1">急所ランク</label>
                <button
                  type="button"
                  onClick={() => store.setFocusEnergyActive(!store.focusEnergyActive)}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                    store.focusEnergyActive
                      ? 'bg-accent-bg text-accent border-accent-border'
                      : 'text-fg-muted border-edge hover:bg-surface-3'
                  }`}
                >
                  {store.focusEnergyActive ? '✓ きあいだめ (+2)' : 'きあいだめ (+2)'}
                </button>
                <p className="text-[11px] text-fg-subtle mt-0.5">急所ランク+2</p>
              </div>
              <div>
                <label className="label block mb-1">じゅうでん</label>
                <button
                  type="button"
                  onClick={() => store.setChargeActive(!store.chargeActive)}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                    store.chargeActive
                      ? 'bg-accent-bg text-accent border-accent-border'
                      : 'text-fg-muted border-edge hover:bg-surface-3'
                  }`}
                >
                  {store.chargeActive ? '✓ じゅうでん (×2)' : 'じゅうでん (×2)'}
                </button>
                <p className="text-[11px] text-fg-subtle mt-0.5">電気技の威力×2</p>
              </div>
            </div>
          )}

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
                      ? 'bg-accent-bg text-accent border-accent-border'
                      : 'text-fg-muted border-edge hover:bg-surface-3'
                  }`}
                >
                  シールドフォルム
                </button>
                <button
                  type="button"
                  onClick={() => store.setBlade(true)}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                    store.isBlade
                      ? 'bg-accent-bg text-accent border-accent-border'
                      : 'text-fg-muted border-edge hover:bg-surface-3'
                  }`}
                >
                  ブレードフォルム
                </button>
              </div>
              <p className="text-[11px] text-fg-subtle mt-0.5">
                {store.isBlade ? '攻撃時（A・C↑ / B・D↓）' : '防御時（B・D↑ / A・C↓）'}
              </p>
            </div>
          )}

          {/* マイティチェンジ: ナイーブ/マイティフォルム切り替え */}
          {store.effectiveAbility === 'マイティチェンジ' && (
            <div>
              <label className="label block mb-1">フォルム</label>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => store.setMighty(false)}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                    !store.isMighty
                      ? 'bg-accent-bg text-accent border-accent-border'
                      : 'text-fg-muted border-edge hover:bg-surface-3'
                  }`}
                >
                  ナイーブフォルム
                </button>
                <button
                  type="button"
                  onClick={() => store.setMighty(true)}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                    store.isMighty
                      ? 'bg-accent-bg text-accent border-accent-border'
                      : 'text-fg-muted border-edge hover:bg-surface-3'
                  }`}
                >
                  マイティフォルム
                </button>
              </div>
              <p className="text-[11px] text-fg-subtle mt-0.5">
                {store.isMighty ? '交代後（A160/B97/C106/D87）' : '交代前（A70/B72/C53/D62）'}
              </p>
            </div>
          )}

          {/* そうだいしょう: 倒れた味方の数 */}
          {store.effectiveAbility === 'そうだいしょう' && (
            <div>
              <label className="label block mb-1">倒れた味方</label>
              <div className="flex gap-1.5">
                {([0, 1, 2] as const).map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => store.setSupremeOverlordBoost(v)}
                    className={`flex-1 text-xs px-2 py-0.5 rounded border transition-colors ${
                      store.supremeOverlordBoost === v
                        ? 'bg-accent-bg text-accent border-accent-border font-medium'
                        : 'text-fg-muted border-edge hover:bg-surface-3'
                    }`}
                  >
                    {v === 0 ? 'なし' : `×${(1 + v * 0.1).toFixed(1)}`}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-fg-subtle mt-0.5">
                {store.supremeOverlordBoost === 0
                  ? '補正なし'
                  : `A・C が ×${(1 + store.supremeOverlordBoost * 0.1).toFixed(1)} になります`}
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
                      ? 'bg-accent-bg text-accent border-accent-border'
                      : 'text-fg-muted border-edge hover:bg-surface-3'
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
              {/* へんげんじざい: 攻撃側はSTAB可変トグル（なし / 1.5倍） */}
              {store.effectiveAbility === 'へんげんじざい' && store.abilityActivated && label === '攻撃側' && (
                <div>
                  <label className="label block mb-1">タイプ一致補正</label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => store.setProteanStab(false)}
                      className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                        !store.proteanStab
                          ? 'bg-accent-bg text-accent border-accent-border'
                          : 'text-fg-muted border-edge hover:bg-surface-3'
                      }`}
                    >
                      なし
                    </button>
                    <button
                      type="button"
                      onClick={() => store.setProteanStab(true)}
                      className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                        store.proteanStab
                          ? 'bg-accent-bg text-accent border-accent-border'
                          : 'text-fg-muted border-edge hover:bg-surface-3'
                      }`}
                    >
                      ×1.5
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 技（攻撃側のみ） */}
          {showMoves && label === '攻撃側' && (
            <MoveSlots
              moves={store.moves}
              setMove={store.setMove}
              movePowers={store.movePowers}
              setMovePower={store.setMovePower}
              maxHP={computedStats.hp}
            />
          )}

          {/* 攻撃側被ダメ用の技（防御側のみ） */}
          {label === '防御側' && (
            <div className="rounded border border-edge bg-surface-2">
              <button
                type="button"
                onClick={() => setShowDefenderMoves(!showDefenderMoves)}
                aria-expanded={showDefenderMoves}
                className="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-left transition-colors hover:bg-surface-3"
              >
                <span>
                  <span className="label block">攻撃側被ダメ用の技</span>
                  <span className="text-[11px] text-fg-subtle">{defenderMoveSummary}</span>
                </span>
                <span className="text-xs text-fg-muted whitespace-nowrap">
                  {showDefenderMoves ? '閉じる' : '設定'}
                </span>
              </button>
              {showDefenderMoves && (
                <div className="border-t border-edge px-2 py-2">
                  <MoveSlots
                    moves={store.moves}
                    setMove={store.setMove}
                    movePowers={store.movePowers}
                    setMovePower={store.setMovePower}
                    maxHP={computedStats.hp}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
