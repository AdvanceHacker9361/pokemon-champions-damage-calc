import { useState } from 'react'
import {
  PASSIVE_PRESETS,
  TURN_END_ORDER,
  countTurns,
  type PassiveAmount,
  type PassiveEffect,
  type PassiveKind,
  type PassivePreset,
  type PassiveSide,
  type PassiveTab,
  type PassiveTiming,
  type Rounding,
} from '@/domain/models/PassiveEffect'
import { useProgressionStore } from '@/presentation/store/progressionStore'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { PassiveEffectRow } from './PassiveEffectRow'
import {
  amountPreviewText,
  resolveForSide,
  type PassiveTargetContext,
} from './passiveCatalogUtils'
import { BerrySection } from './BerrySection'

/** UI 上のサブタブ（'berry' は常時効果ではなくきのみ設定パネル） */
type CatalogSubTab = 'ratio' | 'toxic' | 'fixed' | 'oneShot' | 'berry'

const SUB_TABS: Record<PassiveTab, { key: CatalogSubTab; label: string }[]> = {
  damage: [
    { key: 'ratio', label: '割合' },
    { key: 'toxic', label: 'もうどく' },
    { key: 'fixed', label: '固定' },
  ],
  recover: [
    { key: 'ratio', label: '割合' },
    { key: 'berry', label: 'きのみ' },
    { key: 'fixed', label: '固定' },
    { key: 'oneShot', label: '単発' },
  ],
}

const ROUNDING_OPTIONS: { value: Rounding; label: string }[] = [
  { value: 'floor', label: '切り捨て' },
  { value: 'round', label: '四捨五入' },
  { value: 'roundHalfDown', label: '五捨五超入' },
  { value: 'ceil', label: '切り上げ' },
]

const TIMING_OPTIONS: { value: PassiveTiming; label: string }[] = [
  { value: 'start', label: '開始時' },
  { value: 'turnEnd', label: '毎ターン末' },
  { value: 'perAttack', label: '攻撃毎' },
]

/** カスタム効果がどのサブタブに属するか（プリセット由来でない効果の振り分け） */
function subTabOfAmount(amount: PassiveAmount): CatalogSubTab {
  if (amount.type === 'fixed') return 'fixed'
  if (amount.type === 'toxic') return 'toxic'
  return 'ratio'
}

export interface PassiveCatalogProps {
  tab: PassiveTab
  defenderMaxHp: number
  attackerMaxHp: number
}

/**
 * 常時効果カタログ（V3.18.0 フェーズC）。
 * 「定数ダメ」「回復」タブの共通実体で、`tab` で対象のプリセット・種別を切り替える。
 */
export function PassiveCatalog({ tab, defenderMaxHp, attackerMaxHp }: PassiveCatalogProps) {
  const [side, setSide] = useState<PassiveSide>('defender')
  const [subTab, setSubTab] = useState<CatalogSubTab>('ratio')

  const events = useProgressionStore(s => s.events)
  const passiveEffects = useProgressionStore(s => s.passiveEffects)
  const addPassiveEffect = useProgressionStore(s => s.addPassiveEffect)
  const updatePassiveEffect = useProgressionStore(s => s.updatePassiveEffect)
  const removePassiveEffect = useProgressionStore(s => s.removePassiveEffect)
  const clearPassiveEffects = useProgressionStore(s => s.clearPassiveEffects)
  const addEventAfter = useProgressionStore(s => s.addEventAfter)

  const attackerTypes = useAttackerStore(s => s.types)
  const defenderTypes = useDefenderStore(s => s.types)
  const targetCtx: PassiveTargetContext = { attackerMaxHp, defenderMaxHp, attackerTypes, defenderTypes }

  const defaultKind: PassiveKind = tab === 'damage' ? 'damage' : 'recover'
  const kindMatches = (kind: PassiveKind) =>
    tab === 'damage' ? (kind === 'damage' || kind === 'leechSeed') : kind === 'recover'

  const subTabs = SUB_TABS[tab]
  const activeSubTab = subTabs.some(t => t.key === subTab) ? subTab : subTabs[0].key
  const tabEffects = passiveEffects.filter(p => kindMatches(p.kind))
  const activeCount = tabEffects.length

  function effectOfPreset(preset: PassivePreset): PassiveEffect | undefined {
    return passiveEffects.find(p => p.presetKey === preset.key && p.side === side)
  }

  function addFromPreset(preset: PassivePreset, count: number | 'all'): void {
    addPassiveEffect({
      side,
      kind: preset.kind,
      amount: { ...preset.amount },
      timing: preset.timing,
      count,
      startTurn: 1,
      order: preset.order,
      presetKey: preset.key,
      label: preset.short,
    })
  }

  function increment(effect: PassiveEffect | undefined, preset?: PassivePreset): void {
    if (!effect) {
      if (preset) addFromPreset(preset, 1)
      return
    }
    if (effect.count === 'all') return
    updatePassiveEffect(effect.id, { count: Math.min(99, effect.count + 1) })
  }

  function decrement(effect: PassiveEffect | undefined): void {
    if (!effect) return
    if (effect.count === 'all') {
      updatePassiveEffect(effect.id, { count: Math.max(1, countTurns(events)) })
      return
    }
    if (effect.count <= 1) removePassiveEffect(effect.id)
    else updatePassiveEffect(effect.id, { count: effect.count - 1 })
  }

  function toggleAll(effect: PassiveEffect | undefined, preset?: PassivePreset): void {
    if (!effect) {
      if (preset) addFromPreset(preset, 'all')
      return
    }
    updatePassiveEffect(effect.id, { count: effect.count === 'all' ? 1 : 'all' })
  }

  /** 単発（回復技など）: 時系列末尾へ回復イベントを追加 */
  function appendOneShot(preset: PassivePreset): void {
    const amount = resolveForSide(preset.amount, side, targetCtx)
    addEventAfter(null, {
      kind: side === 'attacker' ? 'attackerRecover' : 'defenderRecover',
      amount,
      label: preset.short,
      source: 'manual',
    })
  }

  const presets = PASSIVE_PRESETS.filter(p => p.tab === tab && p.subTab === activeSubTab)
  const customEffects = passiveEffects.filter(p =>
    !p.presetKey && p.side === side && kindMatches(p.kind) && subTabOfAmount(p.amount) === activeSubTab
  )

  return (
    <div className="space-y-2">
      {/* ヘッダー: サブタブ / 対象トグル / クリア */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="flex flex-wrap items-center gap-1">
          {subTabs.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setSubTab(t.key)}
              aria-pressed={t.key === activeSubTab}
              className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                t.key === activeSubTab
                  ? 'border-accent-border bg-accent-bg text-accent'
                  : 'border-edge bg-surface-3 text-fg-muted hover:bg-surface-2'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <div className="flex items-center overflow-hidden rounded border border-edge" role="group" aria-label="対象">
            {([['defender', '防御側'], ['attacker', '攻撃側']] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setSide(value)}
                aria-pressed={side === value}
                className={`px-2 py-0.5 text-[11px] transition-colors ${
                  side === value ? 'bg-accent-bg text-accent' : 'bg-surface-3 text-fg-muted hover:bg-surface-2'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => clearPassiveEffects(tab)}
            disabled={activeCount === 0}
            className="rounded border border-danger-2 px-1.5 py-0.5 text-[11px] text-danger-2 transition-colors hover:bg-surface-3 disabled:opacity-30"
            title={tab === 'damage' ? 'この「定数ダメ」タブの常時効果をすべて消す' : 'この「回復」タブの常時効果をすべて消す'}
          >
            クリア
          </button>
        </div>
      </div>

      {/* きのみ（回復タブのみ） */}
      {activeSubTab === 'berry' && (
        side === 'attacker' ? (
          <div className="rounded border border-edge bg-surface-2 px-2 py-2 text-[11px] text-fg-faint">
            きのみは防御側のみ対応（攻撃側は次フェーズ）
          </div>
        ) : (
          <BerrySection defenderMaxHp={defenderMaxHp} />
        )
      )}

      {/* 単発（時系列末尾へ追加） */}
      {activeSubTab === 'oneShot' && (
        <div className="space-y-1">
          {presets.map(preset => {
            const amount = resolveForSide(preset.amount, side, targetCtx)
            return (
              <div
                key={preset.key}
                data-testid={`passive-oneshot-${preset.key}`}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded border border-edge bg-surface-2 px-2 py-1.5"
              >
                <div className="min-w-0 flex-1 basis-[9rem]">
                  <div className="text-xs font-semibold text-fg">{preset.label}</div>
                  <div className="text-[10px] leading-tight text-fg-faint">{preset.sources}</div>
                </div>
                <span className="whitespace-nowrap font-mono text-[11px] text-success">
                  {side === 'attacker' ? '攻' : '防'}+{amount}
                </span>
                <button
                  type="button"
                  onClick={() => appendOneShot(preset)}
                  className="whitespace-nowrap rounded border border-edge px-1.5 py-0.5 text-[11px] text-fg-muted transition-colors hover:border-success hover:text-success"
                  title="この回復量で時系列の末尾に回復イベントを追加する"
                >
                  ＋末尾に追加
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* 割合 / もうどく / 固定 */}
      {activeSubTab !== 'berry' && activeSubTab !== 'oneShot' && (
        <div className="space-y-1">
          {presets.map(preset => {
            const effect = effectOfPreset(preset)
            return (
              <PassiveEffectRow
                key={preset.key}
                testId={`passive-row-${preset.key}`}
                mainLabel={preset.label}
                sources={preset.sources}
                timing={preset.timing}
                amountPreview={amountPreviewText(preset.amount, preset.kind, side, targetCtx)}
                count={effect ? effect.count : 0}
                canAll={preset.timing !== 'start'}
                effect={effect}
                onIncrement={() => increment(effect, preset)}
                onDecrement={() => decrement(effect)}
                onToggleAll={() => toggleAll(effect, preset)}
                onStartTurnChange={turn => effect && updatePassiveEffect(effect.id, { startTurn: turn })}
              />
            )
          })}

          {customEffects.map(effect => (
            <PassiveEffectRow
              key={effect.id}
              testId={`passive-custom-${effect.id}`}
              mainLabel={effect.label}
              sources="カスタム"
              timing={effect.timing}
              amountPreview={amountPreviewText(effect.amount, effect.kind, effect.side, targetCtx)}
              count={effect.count}
              canAll={effect.timing !== 'start'}
              effect={effect}
              onIncrement={() => increment(effect)}
              onDecrement={() => decrement(effect)}
              onToggleAll={() => toggleAll(effect)}
              onStartTurnChange={turn => updatePassiveEffect(effect.id, { startTurn: turn })}
              onDelete={() => removePassiveEffect(effect.id)}
            />
          ))}

          {activeSubTab === 'ratio' && (
            <CustomRatioForm
              onAdd={(num, den, rounding, timing) => addPassiveEffect({
                side,
                kind: defaultKind,
                amount: { type: 'ratio', num, den, rounding },
                timing,
                count: timing === 'start' ? 1 : 'all',
                startTurn: 1,
                order: TURN_END_ORDER.custom,
                label: `カスタム ${num}/${den}`,
              })}
            />
          )}

          {activeSubTab === 'fixed' && (
            <CustomFixedForm
              onAdd={(name, value, timing) => addPassiveEffect({
                side,
                kind: defaultKind,
                amount: { type: 'fixed', value },
                timing,
                count: 1,
                startTurn: 1,
                order: TURN_END_ORDER.custom,
                label: name.trim() || `${tab === 'damage' ? '固定ダメ' : '固定回復'} ${value}`,
              })}
            />
          )}
        </div>
      )}
    </div>
  )
}

function CustomRatioForm({
  onAdd,
}: {
  onAdd: (num: number, den: number, rounding: Rounding, timing: PassiveTiming) => void
}) {
  const [num, setNum] = useState(1)
  const [den, setDen] = useState(16)
  const [rounding, setRounding] = useState<Rounding>('floor')
  const [timing, setTiming] = useState<PassiveTiming>('turnEnd')

  return (
    <div className="flex flex-wrap items-center gap-1 rounded border border-dashed border-edge px-2 py-1.5">
      <span className="text-[11px] text-fg-muted">カスタム割合</span>
      <input
        type="number" min={1} value={num}
        onChange={e => setNum(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
        aria-label="カスタム割合の分子"
        className="input-base w-11 px-1 py-0.5 text-center text-[11px]"
      />
      <span className="text-[11px] text-fg-faint">/</span>
      <input
        type="number" min={1} value={den}
        onChange={e => setDen(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
        aria-label="カスタム割合の分母"
        className="input-base w-11 px-1 py-0.5 text-center text-[11px]"
      />
      <select
        value={rounding}
        onChange={e => setRounding(e.target.value as Rounding)}
        aria-label="カスタム割合の丸め"
        className="input-base px-1 py-0.5 text-[11px]"
      >
        {ROUNDING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <select
        value={timing}
        onChange={e => setTiming(e.target.value as PassiveTiming)}
        aria-label="カスタム割合のタイミング"
        className="input-base px-1 py-0.5 text-[11px]"
      >
        {TIMING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <button
        type="button"
        onClick={() => onAdd(num, den, rounding, timing)}
        className="rounded border border-edge px-1.5 py-0.5 text-[11px] text-fg-muted transition-colors hover:border-accent hover:text-accent"
      >
        ＋追加
      </button>
    </div>
  )
}

function CustomFixedForm({
  onAdd,
}: {
  onAdd: (name: string, value: number, timing: PassiveTiming) => void
}) {
  const [name, setName] = useState('')
  const [value, setValue] = useState(0)
  const [timing, setTiming] = useState<PassiveTiming>('turnEnd')

  return (
    <div className="flex flex-wrap items-center gap-1 rounded border border-dashed border-edge px-2 py-1.5">
      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="名前（任意）"
        aria-label="固定効果の名前"
        className="input-base w-24 px-1 py-0.5 text-[11px]"
      />
      <input
        type="number" min={0} value={value}
        onChange={e => setValue(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        aria-label="固定効果の量"
        className="input-base w-14 px-1 py-0.5 text-center text-[11px]"
      />
      <select
        value={timing}
        onChange={e => setTiming(e.target.value as PassiveTiming)}
        aria-label="固定効果のタイミング"
        className="input-base px-1 py-0.5 text-[11px]"
      >
        {TIMING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <button
        type="button"
        onClick={() => { if (value > 0) onAdd(name, value, timing) }}
        disabled={value <= 0}
        className="rounded border border-edge px-1.5 py-0.5 text-[11px] text-fg-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-30"
      >
        ＋追加
      </button>
    </div>
  )
}
