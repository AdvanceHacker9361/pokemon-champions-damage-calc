import { useEffect, useRef, useState } from 'react'
import { useProgressionStore, hasSequenceImpact } from '@/presentation/store/progressionStore'
import type { EventKind, ProgressionEventInput } from '@/presentation/store/progressionStore'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { useBattleSequence } from '@/presentation/hooks/useBattleSequence'
import { calculateHP } from '@/domain/calculators/StatCalculator'
import { EventRow } from './EventRow'
import { BackgroundEffectsSection } from './BackgroundEffectsSection'
import { SequenceResultPanel } from './SequenceResultPanel'
import { AddEventToolbar, type AddEventAction } from './AddEventToolbar'

interface DamageProgressionPanelProps {
  defenderMaxHp: number
}

export function DamageProgressionPanel({ defenderMaxHp }: DamageProgressionPanelProps) {
  const events           = useProgressionStore(s => s.events)
  const constDmg         = useProgressionStore(s => s.constDmg)
  const constRec         = useProgressionStore(s => s.constRec)
  const constRecBerry    = useProgressionStore(s => s.constRecBerry)
  const berryThresholdPct = useProgressionStore(s => s.constRecBerryThresholdPct)
  const berryCudChew     = useProgressionStore(s => s.berryCudChew)
  const berryHarvestChance = useProgressionStore(s => s.berryHarvestChance)
  const poisonTurns      = useProgressionStore(s => s.poisonTurns)
  const attackerStartHp  = useProgressionStore(s => s.attackerStartHp)
  const defenderStartHp  = useProgressionStore(s => s.defenderStartHp)

  const setAttackUsages       = useProgressionStore(s => s.setAttackUsages)
  const removeEvent           = useProgressionStore(s => s.removeEvent)
  const moveEvent             = useProgressionStore(s => s.moveEvent)
  const addEventAfter         = useProgressionStore(s => s.addEventAfter)
  const updateEvent           = useProgressionStore(s => s.updateEvent)
  const setConstDmg           = useProgressionStore(s => s.setConstDmg)
  const setConstRec           = useProgressionStore(s => s.setConstRec)
  const setConstRecBerry      = useProgressionStore(s => s.setConstRecBerry)
  const setConstRecBerryThresholdPct = useProgressionStore(s => s.setConstRecBerryThresholdPct)
  const setBerryCudChew       = useProgressionStore(s => s.setBerryCudChew)
  const setBerryHarvestChance = useProgressionStore(s => s.setBerryHarvestChance)
  const setPoisonTurns        = useProgressionStore(s => s.setPoisonTurns)
  const setAttackerStartHp    = useProgressionStore(s => s.setAttackerStartHp)
  const setDefenderStartHp    = useProgressionStore(s => s.setDefenderStartHp)
  const clear                 = useProgressionStore(s => s.clear)

  // 攻撃側最大HP（痛み分け挿入の初期値・参考表示）
  const attackerBaseHp = useAttackerStore(s => s.baseStats.hp)
  const attackerSpHp   = useAttackerStore(s => s.sp.hp)
  const attackerMaxHp  = attackerBaseHp > 0 ? calculateHP(attackerBaseHp, attackerSpHp) : 0
  const attackerName   = useAttackerStore(s => s.pokemonName)
  const attackerCanMega = useAttackerStore(s => s.canMega)
  const attackerAvailableMegas = useAttackerStore(s => s.availableMegas)
  const attackerMegaKey = useAttackerStore(s => s.megaKey)
  const defenderName   = useDefenderStore(s => s.pokemonName)
  const defenderCanMega = useDefenderStore(s => s.canMega)
  const defenderAvailableMegas = useDefenderStore(s => s.availableMegas)
  const defenderMegaKey = useDefenderStore(s => s.megaKey)
  const defenderMoves  = useDefenderStore(s => s.moves)
  const defenderMoveOptions = defenderMoves.filter((m): m is string => !!m)

  const poisonPerTurn = Array.from({ length: poisonTurns }, (_, i) =>
    Math.max(1, Math.floor(defenderMaxHp * (i + 1) / 16))
  )
  const poisonTotal = poisonPerTurn.reduce((s, v) => s + v, 0)

  const hasEvents = events.length > 0
  const hasAnything =
    hasEvents ||
    constDmg > 0 || constRec > 0 || constRecBerry > 0 || poisonTurns > 0
  const showSequenceOutputs = hasSequenceImpact({ events, attackerStartHp })
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null)
  const previousEventIdsRef = useRef(events.map(ev => ev.id))

  const { result: seqResult } = useBattleSequence()

  useEffect(() => {
    const previousIds = previousEventIdsRef.current
    if (events.length > previousIds.length) {
      const previousSet = new Set(previousIds)
      const inserted = events.find(ev => !previousSet.has(ev.id))
      if (!inserted) {
        previousEventIdsRef.current = events.map(ev => ev.id)
        return
      }
      setHighlightedEventId(inserted.id)
      const timer = window.setTimeout(() => {
        setHighlightedEventId(id => id === inserted.id ? null : id)
      }, 1200)
      previousEventIdsRef.current = events.map(ev => ev.id)
      return () => window.clearTimeout(timer)
    }
    previousEventIdsRef.current = events.map(ev => ev.id)
  }, [events])

  function addAfter(kind: EventKind, targetId: string | null) {
    if (kind === 'painSplit') {
      addEventAfter(targetId, { kind: 'painSplit', attackerHp: attackerMaxHp })
    } else if (kind === 'incoming') {
      addEventAfter(targetId, { kind: 'incoming', moveName: null, crit: false })
    } else if (kind === 'rearmBerry') {
      addEventAfter(targetId, { kind: 'rearmBerry' })
    } else if (kind === 'defenderConst' || kind === 'attackerConst' || kind === 'defenderRecover' || kind === 'attackerRecover') {
      addEventAfter(targetId, { kind, amount: 0, source: 'manual' })
    }
  }

  function addSetupTurn(side: 'attacker' | 'defender', targetId: string | null) {
    addEventAfter(targetId, { kind: 'setupTurn', side })
  }

  function addMegaEvolve(side: 'attacker' | 'defender', targetId: string | null) {
    const options = side === 'attacker' ? attackerAvailableMegas : defenderAvailableMegas
    const selected = side === 'attacker' ? attackerMegaKey : defenderMegaKey
    const megaKey = selected ?? options[0]?.key
    if (!megaKey) return
    addEventAfter(targetId, { kind: 'megaEvolve', side, megaKey })
  }

  function moveBackgroundEventToTimeline(ev: ProgressionEventInput) {
    addEventAfter(null, ev)
  }

  function moveConstDmgToTimeline() {
    if (constDmg <= 0) return
    moveBackgroundEventToTimeline({
      kind: 'defenderConst',
      amount: constDmg,
      label: `背景 定数ダメ ${constDmg}`,
      source: 'background',
    })
    setConstDmg(0)
  }

  function moveConstRecToTimeline() {
    if (constRec <= 0) return
    moveBackgroundEventToTimeline({
      kind: 'defenderRecover',
      amount: constRec,
      label: `背景 毎ターン回復 ${constRec}`,
      source: 'background',
    })
    setConstRec(0)
  }

  function movePoisonToTimeline() {
    if (poisonPerTurn.length === 0) return
    for (const [i, amount] of poisonPerTurn.entries()) {
      moveBackgroundEventToTimeline({
        kind: 'defenderConst',
        amount,
        label: `背景 もうどく ${i + 1}T ${amount}`,
        source: 'background',
      })
    }
    setPoisonTurns(0)
  }

  function addLeechSeed(direction: 'fromAttacker' | 'fromDefender') {
    addEventAfter(null, { kind: 'leechSeed', direction })
  }

  function addAction(action: AddEventAction) {
    if (action.type === 'event') {
      addAfter(action.kind, null)
    } else if (action.type === 'setupTurn') {
      addSetupTurn(action.side, null)
    } else if (action.type === 'megaEvolve') {
      addMegaEvolve(action.side, null)
    } else {
      addLeechSeed(action.direction)
    }
  }

  return (
    <div className="panel space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <h3 className="text-xs font-semibold text-fg-muted">イベント時系列</h3>
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
        {hasAnything && (
          <button
            type="button"
            onClick={clear}
            className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border border-danger-2 text-danger-2 hover:bg-surface-3 transition-colors"
            title="イベント・背景効果・開始HPをすべてクリア"
          >
            <span>✕</span>
            <span>全クリア</span>
          </button>
        )}
      </div>

      <div className="text-[10px] text-fg-faint">
        与ダメは各技の「+ 加算」から追加。その他のイベントは用途別に末尾へ追加できます。
      </div>

      {/* イベント一覧 */}
      {hasEvents ? (
        <div className="space-y-1">
          {events.map((ev, idx) => (
            <EventRow
              key={ev.id}
              ev={ev}
              idx={idx}
              total={events.length}
              isHighlighted={ev.id === highlightedEventId}
              attackerMaxHp={attackerMaxHp}
              defenderMaxHp={defenderMaxHp}
              defenderMoveOptions={defenderMoveOptions}
              attackerMegaOptions={attackerAvailableMegas}
              defenderMegaOptions={defenderAvailableMegas}
              onSetAttackUsages={setAttackUsages}
              onRemove={() => removeEvent(ev.id)}
              onMoveUp={() => moveEvent(ev.id, -1)}
              onMoveDown={() => moveEvent(ev.id, 1)}
              onAddPainSplit={() => addAfter('painSplit', ev.id)}
              onAddAfter={kind => addAfter(kind, ev.id)}
              onAddSetupTurn={side => addSetupTurn(side, ev.id)}
              onAddMegaEvolve={side => addMegaEvolve(side, ev.id)}
              onUpdate={patch => updateEvent(ev.id, patch)}
            />
          ))}
        </div>
      ) : (
        <div className="text-xs text-fg-faint text-center py-1">
          各技の「+ 加算」ボタンで与ダメを追加してください
        </div>
      )}

      {/* イベント追加ボタン群（末尾追加） */}
      <AddEventToolbar
        attackerCanMega={attackerCanMega}
        defenderCanMega={defenderCanMega}
        onAddAction={addAction}
      />

      <div className="border-t border-edge" />

      {/* 背景効果セクション（旧 DamageAccumPanel と同じ UI） */}
      <BackgroundEffectsSection
        constDmg={constDmg}
        constRec={constRec}
        constRecBerry={constRecBerry}
        berryThresholdPct={berryThresholdPct}
        berryCudChew={berryCudChew}
        berryHarvestChance={berryHarvestChance}
        poisonTurns={poisonTurns}
        poisonPerTurn={poisonPerTurn}
        poisonTotal={poisonTotal}
        defenderMaxHp={defenderMaxHp}
        setConstDmg={setConstDmg}
        setConstRec={setConstRec}
        setConstRecBerry={setConstRecBerry}
        setConstRecBerryThresholdPct={setConstRecBerryThresholdPct}
        setBerryCudChew={setBerryCudChew}
        setBerryHarvestChance={setBerryHarvestChance}
        setPoisonTurns={setPoisonTurns}
        moveConstDmgToTimeline={moveConstDmgToTimeline}
        moveConstRecToTimeline={moveConstRecToTimeline}
        movePoisonToTimeline={movePoisonToTimeline}
      />

      {/* シーケンス出力（被ダメ・痛み分け・開始HP指定がある場合のみ） */}
      {showSequenceOutputs && (
        <>
          <div className="border-t border-edge" />
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold text-fg-muted">攻守シミュレーション</h3>
            <span className="text-[10px] text-fg-faint">攻撃側HPの変動も追跡</span>
          </div>

          {/* 開始HP */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-fg-muted">攻撃側開始HP</span>
              <input
                type="number"
                min={0}
                max={attackerMaxHp || undefined}
                placeholder={`${attackerMaxHp}`}
                value={attackerStartHp ?? ''}
                onChange={e => setAttackerStartHp(e.target.value === '' ? null : Number(e.target.value))}
                className="input-base w-16 text-center text-xs px-1"
              />
              <span className="text-[10px] text-fg-faint">/ {attackerMaxHp}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-fg-muted">防御側開始HP</span>
              <input
                type="number"
                min={0}
                max={defenderMaxHp || undefined}
                placeholder={`${defenderMaxHp}`}
                value={defenderStartHp ?? ''}
                onChange={e => setDefenderStartHp(e.target.value === '' ? null : Number(e.target.value))}
                className="input-base w-16 text-center text-xs px-1"
              />
              <span className="text-[10px] text-fg-faint">/ {defenderMaxHp}</span>
            </div>
          </div>

          <SequenceResultPanel
            seqResult={seqResult}
            attackerName={attackerName}
            defenderName={defenderName}
          />
        </>
      )}
    </div>
  )
}
