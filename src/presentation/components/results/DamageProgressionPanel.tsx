import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useProgressionStore } from '@/presentation/store/progressionStore'
import type { EventKind } from '@/presentation/store/progressionStore'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { calculateHP } from '@/domain/calculators/StatCalculator'
import { computeTurnRanges } from '@/domain/models/PassiveEffect'
import { buildPassiveSchedule, type AutoEventItem } from '@/domain/calculators/PassiveEffectExpansion'
import { collectEffectIds } from '@/domain/calculators/PassiveEffectPinning'
import { EventRow } from './EventRow'
import { PassiveGhostRow } from './PassiveGhostRow'
import { ProgressionTabs } from './ProgressionTabs'
import { findInsertEventAction, type InsertEventCtx } from './eventInsertActions'

const EMPTY_IDS: ReadonlySet<string> = new Set<string>()

interface DamageProgressionPanelProps {
  defenderMaxHp: number
}

export function DamageProgressionPanel({ defenderMaxHp }: DamageProgressionPanelProps) {
  const events           = useProgressionStore(s => s.events)
  const passiveEffects   = useProgressionStore(s => s.passiveEffects)
  const defenderBerry    = useProgressionStore(s => s.defenderBerry)
  const attackerBerry    = useProgressionStore(s => s.attackerBerry)
  const attackerStartHp  = useProgressionStore(s => s.attackerStartHp)
  const defenderStartHp  = useProgressionStore(s => s.defenderStartHp)

  const setAttackUsages       = useProgressionStore(s => s.setAttackUsages)
  const removeEvent           = useProgressionStore(s => s.removeEvent)
  const moveEvent             = useProgressionStore(s => s.moveEvent)
  const addEventAfter         = useProgressionStore(s => s.addEventAfter)
  const updateEvent           = useProgressionStore(s => s.updateEvent)
  const setAttackerStartHp    = useProgressionStore(s => s.setAttackerStartHp)
  const setDefenderStartHp    = useProgressionStore(s => s.setDefenderStartHp)
  const pinPassive            = useProgressionStore(s => s.pinPassiveEffects)
  const pinAllPassive         = useProgressionStore(s => s.pinAllPassiveEffects)
  const clear                 = useProgressionStore(s => s.clear)

  // 攻撃側最大HP（痛み分け挿入の初期値・参考表示）
  const attackerBaseHp = useAttackerStore(s => s.baseStats.hp)
  const attackerSpHp   = useAttackerStore(s => s.sp.hp)
  const attackerMaxHp  = attackerBaseHp > 0 ? calculateHP(attackerBaseHp, attackerSpHp) : 0
  const attackerTypes  = useAttackerStore(s => s.types)
  const defenderTypes  = useDefenderStore(s => s.types)
  const attackerCanMega = useAttackerStore(s => s.canMega)
  const attackerAvailableMegas = useAttackerStore(s => s.availableMegas)
  const attackerMegaKey = useAttackerStore(s => s.megaKey)
  const defenderCanMega = useDefenderStore(s => s.canMega)
  const defenderAvailableMegas = useDefenderStore(s => s.availableMegas)
  const defenderMegaKey = useDefenderStore(s => s.megaKey)
  const defenderMoves  = useDefenderStore(s => s.moves)
  const defenderMoveOptions = defenderMoves.filter((m): m is string => !!m)

  const insertCtx: InsertEventCtx = { attackerCanMega, defenderCanMega }

  const hasEvents = events.length > 0
  const hasAnything = hasEvents || passiveEffects.length > 0
    || defenderBerry.amount > 0 || attackerBerry.amount > 0
  const turnRanges = useMemo(() => computeTurnRanges(events), [events])
  const turnRangeById = useMemo(() => {
    const map = new Map(turnRanges.map(r => [r.eventId, r] as const))
    return map
  }, [turnRanges])

  // 常時効果のゴースト行用スケジュール（純粋計算・シミュレーションは実行しない）
  const expansionCtx = useMemo(
    () => ({ attackerMaxHp, defenderMaxHp, attackerTypes, defenderTypes }),
    [attackerMaxHp, defenderMaxHp, attackerTypes, defenderTypes],
  )
  const passiveSchedule = useMemo(
    () => buildPassiveSchedule(events, passiveEffects, expansionCtx),
    [events, passiveEffects, expansionCtx],
  )
  const hasGhostRows =
    passiveSchedule.start.length > 0 ||
    passiveSchedule.trailing.length > 0 ||
    Object.keys(passiveSchedule.afterEvent).length > 0

  // 挿入直後のハイライト。固定化は複数イベントを一度に挿入するため集合で持つ
  const [highlightedEventIds, setHighlightedEventIds] = useState<ReadonlySet<string>>(EMPTY_IDS)
  const previousEventIdsRef = useRef(events.map(ev => ev.id))

  useEffect(() => {
    const previousIds = previousEventIdsRef.current
    if (events.length > previousIds.length) {
      const previousSet = new Set(previousIds)
      const inserted = events.filter(ev => !previousSet.has(ev.id)).map(ev => ev.id)
      previousEventIdsRef.current = events.map(ev => ev.id)
      if (inserted.length === 0) return
      const insertedSet = new Set(inserted)
      setHighlightedEventIds(insertedSet)
      const timer = window.setTimeout(() => {
        setHighlightedEventIds(current => current === insertedSet ? EMPTY_IDS : current)
      }, 1200)
      return () => window.clearTimeout(timer)
    }
    previousEventIdsRef.current = events.map(ev => ev.id)
  }, [events])

  /** ゴースト行の「固定化」: その行に現れる常時効果を全ターン分イベント化する */
  function pinRow(items: AutoEventItem[]) {
    pinPassive(collectEffectIds(items), expansionCtx)
  }

  function addAfter(kind: EventKind, targetId: string | null) {
    if (kind === 'painSplit') {
      addEventAfter(targetId, { kind: 'painSplit', attackerHp: attackerMaxHp })
    } else if (kind === 'incoming') {
      addEventAfter(targetId, { kind: 'incoming', moveName: null, crit: false })
    } else if (kind === 'defenderConst' || kind === 'attackerConst' || kind === 'defenderRecover' || kind === 'attackerRecover') {
      addEventAfter(targetId, { kind, amount: 0, source: 'manual' })
    }
  }

  function addSetupTurn(side: 'attacker' | 'defender', targetId: string | null) {
    addEventAfter(targetId, { kind: 'setupTurn', side })
  }

  function addRearmBerry(side: 'attacker' | 'defender', targetId: string | null) {
    addEventAfter(targetId, { kind: 'rearmBerry', side })
  }

  function addMegaEvolve(side: 'attacker' | 'defender', targetId: string | null) {
    const options = side === 'attacker' ? attackerAvailableMegas : defenderAvailableMegas
    const selected = side === 'attacker' ? attackerMegaKey : defenderMegaKey
    const megaKey = selected ?? options[0]?.key
    if (!megaKey) return
    addEventAfter(targetId, { kind: 'megaEvolve', side, megaKey })
  }

  /**
   * イベント挿入の単一情報源（INSERT_EVENT_ACTIONS）をディスパッチする。
   * タブ（末尾追加 = targetId null）と行内ポップオーバー（直後挿入 = targetId = 行の id）の
   * どちらもこの1関数を通す。
   */
  function handleInsertByKey(key: string, targetId: string | null) {
    const action = findInsertEventAction(key)
    if (!action) return
    const { dispatch } = action
    if (dispatch.type === 'event') {
      addAfter(dispatch.kind, targetId)
    } else if (dispatch.type === 'setupTurn') {
      addSetupTurn(dispatch.side, targetId)
    } else if (dispatch.type === 'megaEvolve') {
      addMegaEvolve(dispatch.side, targetId)
    } else if (dispatch.type === 'rearmBerry') {
      addRearmBerry(dispatch.side, targetId)
    }
  }

  return (
    <div className="panel space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <h3 className="text-xs font-semibold text-fg-muted whitespace-nowrap">イベント時系列</h3>
          <span
            aria-live="polite"
            className={`rounded border px-1.5 py-0.5 text-[10px] font-mono ${
              hasEvents
                ? 'border-accent-border bg-accent-bg text-accent'
                : 'border-edge bg-surface-2 text-fg-faint'
            }`}
          >
            {events.length}件
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* 開始HP（常時表示・コンパクト） */}
          <div className="flex items-center gap-1 text-[11px]">
            <span className="text-fg-muted">攻</span>
            <input
              type="number"
              min={0}
              max={attackerMaxHp || undefined}
              placeholder={`${attackerMaxHp}`}
              value={attackerStartHp ?? ''}
              onChange={e => setAttackerStartHp(e.target.value === '' ? null : Number(e.target.value))}
              aria-label="攻撃側開始HP"
              className="input-base w-12 text-center text-[11px] px-1 py-0.5"
            />
            <span className="text-fg-muted">防</span>
            <input
              type="number"
              min={0}
              max={defenderMaxHp || undefined}
              placeholder={`${defenderMaxHp}`}
              value={defenderStartHp ?? ''}
              onChange={e => setDefenderStartHp(e.target.value === '' ? null : Number(e.target.value))}
              aria-label="防御側開始HP"
              className="input-base w-12 text-center text-[11px] px-1 py-0.5"
            />
          </div>

          {passiveEffects.length > 0 && (
            <button
              type="button"
              onClick={() => pinAllPassive(expansionCtx)}
              className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border border-edge text-fg-muted hover:border-accent-border hover:text-accent transition-colors"
              title="すべての常時効果を、自動適用されている位置そのままの手動イベントへ展開する（数値は変わりません）"
            >
              <span>📌</span>
              <span>すべて固定化</span>
            </button>
          )}

          {hasAnything && (
            <button
              type="button"
              onClick={clear}
              className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border border-danger-2 text-danger-2 hover:bg-surface-3 transition-colors"
              title="イベント・常時効果・開始HPをすべてクリア"
            >
              <span>✕</span>
              <span>全クリア</span>
            </button>
          )}
        </div>
      </div>

      <div className="text-[10px] text-fg-faint">
        与ダメは各技の「+ 加算」から追加。その他のイベントは行の「＋」またはタブから挿入できます。
      </div>

      {/* イベント一覧（常時効果は淡色のゴースト行として自動表示） */}
      {hasEvents || hasGhostRows ? (
        <div className="space-y-1">
          <PassiveGhostRow items={passiveSchedule.start} onPin={() => pinRow(passiveSchedule.start)} />
          {events.map((ev, idx) => (
            <Fragment key={ev.id}>
              <EventRow
                ev={ev}
                idx={idx}
                total={events.length}
                isHighlighted={highlightedEventIds.has(ev.id)}
                turnRange={turnRangeById.get(ev.id)}
                insertCtx={insertCtx}
                attackerMaxHp={attackerMaxHp}
                defenderMaxHp={defenderMaxHp}
                defenderMoveOptions={defenderMoveOptions}
                attackerMegaOptions={attackerAvailableMegas}
                defenderMegaOptions={defenderAvailableMegas}
                onSetAttackUsages={setAttackUsages}
                onRemove={() => removeEvent(ev.id)}
                onMoveUp={() => moveEvent(ev.id, -1)}
                onMoveDown={() => moveEvent(ev.id, 1)}
                onInsertAfter={key => handleInsertByKey(key, ev.id)}
                onUpdate={patch => updateEvent(ev.id, patch)}
              />
              <PassiveGhostRow
                items={passiveSchedule.afterEvent[ev.id] ?? []}
                onPin={() => pinRow(passiveSchedule.afterEvent[ev.id] ?? [])}
              />
            </Fragment>
          ))}
          <PassiveGhostRow items={passiveSchedule.trailing} onPin={() => pinRow(passiveSchedule.trailing)} />
        </div>
      ) : (
        <div className="text-xs text-fg-faint text-center py-1">
          各技の「+ 加算」ボタンで与ダメを追加してください
        </div>
      )}

      {/* イベント / 定数ダメ / 回復 タブ */}
      <ProgressionTabs
        ctx={insertCtx}
        onSelectEvent={key => handleInsertByKey(key, null)}
        defenderMaxHp={defenderMaxHp}
        attackerMaxHp={attackerMaxHp}
      />
    </div>
  )
}
