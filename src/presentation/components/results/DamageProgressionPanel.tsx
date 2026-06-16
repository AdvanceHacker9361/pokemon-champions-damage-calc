import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useProgressionStore, hasSequenceImpact } from '@/presentation/store/progressionStore'
import type { ProgressionEvent, EventKind } from '@/presentation/store/progressionStore'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { useBattleSequence } from '@/presentation/hooks/useBattleSequence'
import { calculateHP } from '@/domain/calculators/StatCalculator'

interface DamageProgressionPanelProps {
  defenderMaxHp: number
}

const CONST_DMG_FRACTIONS = [
  { label: '1/32', num: 1, den: 32 },
  { label: '1/16', num: 1, den: 16 },
  { label: '1/8',  num: 1, den: 8  },
  { label: '1/6',  num: 1, den: 6  },
  { label: '1/4',  num: 1, den: 4  },
  { label: '1/2',  num: 1, den: 2  },
]

const CONST_REC_FRACTIONS = [
  { label: '1/16', num: 1, den: 16 },
  { label: '1/8',  num: 1, den: 8  },
]

type AddEventAction =
  | { type: 'event'; kind: EventKind; label: string; tone?: 'accent' | 'warning' | 'success' }
  | {
      type: 'leechSeed'
      direction: 'fromAttacker' | 'fromDefender'
      label: string
      title: string
      tone?: 'success'
    }

const ADD_EVENT_GROUPS: {
  label: string
  hint: string
  actions: AddEventAction[]
}[] = [
  {
    label: 'ターン進行',
    hint: '反撃・HP平均化・きのみ再装填',
    actions: [
      { type: 'event', kind: 'incoming', label: '＋被ダメ', tone: 'warning' },
      { type: 'event', kind: 'painSplit', label: '＋痛み分け', tone: 'accent' },
      { type: 'event', kind: 'rearmBerry', label: '＋リサイクル', tone: 'success' },
    ],
  },
  {
    label: '即時HP',
    hint: '任意のダメージ・回復を時系列に追加',
    actions: [
      { type: 'event', kind: 'defenderConst', label: '＋防御側ダメ', tone: 'warning' },
      { type: 'event', kind: 'defenderRecover', label: '＋防御側回復', tone: 'success' },
      { type: 'event', kind: 'attackerConst', label: '＋攻撃側ダメ', tone: 'warning' },
      { type: 'event', kind: 'attackerRecover', label: '＋攻撃側回復', tone: 'success' },
    ],
  },
  {
    label: '継続効果',
    hint: '時系列に1ティックずつ挿入',
    actions: [
      {
        type: 'leechSeed',
        direction: 'fromAttacker',
        label: '＋宿り木（攻→防）',
        tone: 'success',
        title: '攻撃側が宿り木のタネを植えた状態の1ティック（防御側-1/8、攻撃側+同量）',
      },
      {
        type: 'leechSeed',
        direction: 'fromDefender',
        label: '＋宿り木（防→攻）',
        tone: 'success',
        title: '防御側が宿り木のタネを植えた状態の1ティック（攻撃側-1/8、防御側+同量）',
      },
    ],
  },
]

const ADD_BUTTON_BASE_CLASS = 'text-[11px] px-1.5 py-0.5 rounded border border-edge text-fg-muted transition-colors whitespace-nowrap'

function addButtonClass(tone: AddEventAction['tone'] = 'accent') {
  switch (tone) {
    case 'warning':
      return `${ADD_BUTTON_BASE_CLASS} hover:border-warning hover:text-warning`
    case 'success':
      return `${ADD_BUTTON_BASE_CLASS} hover:border-success hover:text-success`
    case 'accent':
    default:
      return `${ADD_BUTTON_BASE_CLASS} hover:border-accent hover:text-accent`
  }
}

function hpRange(dist: Map<number, number>): { min: number; max: number } | null {
  if (dist.size === 0) return null
  let min = Infinity, max = -Infinity
  for (const hp of dist.keys()) {
    if (hp < min) min = hp
    if (hp > max) max = hp
  }
  return { min, max }
}

function ConstBar({ value, maxHp, isRecovery = false }: { value: number; maxHp: number; isRecovery?: boolean }) {
  const pct = maxHp > 0 ? Math.min(100, (value / maxHp) * 100) : 0
  return (
    <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, backgroundColor: isRecovery ? 'var(--success)' : 'var(--warning)' }}
      />
    </div>
  )
}

function hpPercentText(value: number, maxHp: number): string {
  if (maxHp <= 0) return '0.0%'
  return `${(value / maxHp * 100).toFixed(1)}%`
}

function readNonNegative(raw: string): number {
  const value = Number(raw)
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function readPercent(raw: string): number {
  const value = Number(raw)
  if (!Number.isFinite(value)) return 1
  return Math.max(1, Math.min(100, value))
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
  const defenderName   = useDefenderStore(s => s.pokemonName)
  const defenderMoves  = useDefenderStore(s => s.moves)
  const defenderMoveOptions = defenderMoves.filter((m): m is string => !!m)

  const poisonPerTurn = Array.from({ length: poisonTurns }, (_, i) =>
    Math.max(1, Math.floor(defenderMaxHp * (i + 1) / 16))
  )
  const poisonTotal = poisonPerTurn.reduce((s, v) => s + v, 0)

  const hasEvents = events.length > 0
  const hasAnything = hasEvents || constDmg > 0 || constRec > 0 || constRecBerry > 0 || poisonTurns > 0
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
      addEventAfter(targetId, { kind, amount: 0 })
    }
  }

  function addLeechSeed(direction: 'fromAttacker' | 'fromDefender') {
    addEventAfter(null, { kind: 'leechSeed', direction })
  }

  function addAction(action: AddEventAction) {
    if (action.type === 'event') {
      addAfter(action.kind, null)
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
              onSetAttackUsages={setAttackUsages}
              onRemove={() => removeEvent(ev.id)}
              onMoveUp={() => moveEvent(ev.id, -1)}
              onMoveDown={() => moveEvent(ev.id, 1)}
              onAddPainSplit={() => addAfter('painSplit', ev.id)}
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
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <span className="label">イベント追加</span>
          <span className="text-[10px] text-fg-faint">末尾に追加</span>
        </div>
        <div className="space-y-1">
          {ADD_EVENT_GROUPS.map(group => (
            <div key={group.label} className="flex items-start gap-2">
              <div className="w-16 flex-shrink-0 pt-0.5">
                <div className="text-[11px] font-medium text-fg-muted leading-tight">{group.label}</div>
                <div className="text-[10px] text-fg-faint leading-tight">{group.hint}</div>
              </div>
              <div className="flex flex-wrap gap-1 min-w-0">
                {group.actions.map(action => (
                  <button
                    key={action.type === 'event' ? action.kind : `${action.type}-${action.direction}`}
                    type="button"
                    onClick={() => addAction(action)}
                    className={addButtonClass(action.tone)}
                    title={action.type === 'leechSeed' ? action.title : undefined}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

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

          {seqResult && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span className="font-mono">
                  <span className="text-fg-muted">防御側撃破: </span>
                  <span className="font-bold text-danger-2">{(seqResult.defenderKoProb * 100).toFixed(1)}%</span>
                </span>
                <span className="font-mono">
                  <span className="text-fg-muted">攻撃側生存: </span>
                  <span className="font-bold text-success">{(seqResult.attackerSurviveProb * 100).toFixed(1)}%</span>
                </span>
                <span className="font-mono">
                  <span className="text-fg-muted">両者生存: </span>
                  <span className="text-fg">{(seqResult.bothAliveProb * 100).toFixed(1)}%</span>
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-[10px] font-mono">
                  <thead>
                    <tr className="text-fg-faint border-b border-edge">
                      <th className="text-left py-0.5 pr-2 font-normal">#</th>
                      <th className="text-left py-0.5 pr-2 font-normal">ステップ</th>
                      <th className="text-right py-0.5 pr-2 font-normal">{attackerName || '攻'}残HP</th>
                      <th className="text-right py-0.5 pr-2 font-normal">{defenderName || '防'}残HP</th>
                      <th className="text-right py-0.5 pr-2 font-normal">撃破</th>
                      <th className="text-right py-0.5 font-normal">瀕死</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seqResult.steps.map((s, i) => {
                      const aR = hpRange(s.attackerHpDist)
                      const dR = hpRange(s.defenderHpDist)
                      return (
                        <tr key={i} className="border-b border-edge/40">
                          <td className="py-0.5 pr-2 text-fg-faint">{i + 1}</td>
                          <td className="py-0.5 pr-2 text-fg-muted truncate max-w-[10rem]">{s.label}</td>
                          <td className="py-0.5 pr-2 text-right text-fg">{aR ? `${aR.min}〜${aR.max}` : '−'}</td>
                          <td className="py-0.5 pr-2 text-right text-fg">{dR ? `${dR.min}〜${dR.max}` : '−'}</td>
                          <td className="py-0.5 pr-2 text-right text-danger-2">{(s.koProb * 100).toFixed(0)}%</td>
                          <td className="py-0.5 text-right text-warning">{(s.faintProb * 100).toFixed(0)}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="text-[10px] text-fg-faint leading-relaxed">
                ※ 残HPは両者生存マスでの範囲。被ダメは攻守を入れ替えて自動計算（火傷半減・吸収も反映）。
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

interface EventRowProps {
  ev: ProgressionEvent
  idx: number
  total: number
  isHighlighted: boolean
  attackerMaxHp: number
  defenderMaxHp: number
  defenderMoveOptions: string[]
  onSetAttackUsages: (id: string, usages: number) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onAddPainSplit: () => void
  onUpdate: (patch: Partial<ProgressionEvent>) => void
}

type TimelineRowTone = 'attack' | 'accent' | 'warning' | 'success' | 'default'

function timelineRowClass(tone: TimelineRowTone) {
  const base = 'grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-start gap-2 rounded border border-l-2 px-2 py-1.5 text-xs'
  switch (tone) {
    case 'attack':
      return `${base} border-edge border-l-accent bg-surface-1`
    case 'accent':
      return `${base} border-accent-border border-l-accent bg-accent-bg/30`
    case 'warning':
      return `${base} border-edge border-l-warning bg-surface-2`
    case 'success':
      return `${base} border-edge border-l-success bg-surface-2`
    case 'default':
    default:
      return `${base} border-edge border-l-edge bg-surface-2`
  }
}

function TimelineRow({
  idx, total, tone, isHighlighted, children,
  onMoveUp, onMoveDown, onRemove,
}: {
  idx: number
  total: number
  tone: TimelineRowTone
  isHighlighted: boolean
  children: ReactNode
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}) {
  return (
    <div className={`${timelineRowClass(tone)} transition-colors ${isHighlighted ? 'ring-1 ring-accent-border bg-accent-bg/40' : ''}`}>
      <span className="text-fg-faint text-right font-mono pt-0.5">{idx + 1}</span>
      <div className="min-w-0">{children}</div>
      <RowControls idx={idx} total={total} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onRemove={onRemove} />
    </div>
  )
}

function EventRow({
  ev, idx, total,
  isHighlighted,
  attackerMaxHp, defenderMaxHp, defenderMoveOptions,
  onSetAttackUsages, onRemove, onMoveUp, onMoveDown, onAddPainSplit, onUpdate,
}: EventRowProps) {
  if (ev.kind === 'attack') {
    const subMin = ev.minDmg * ev.usages
    const subMax = ev.maxDmg * ev.usages
    return (
      <TimelineRow idx={idx} total={total} tone="attack" isHighlighted={isHighlighted} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onRemove={onRemove}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-[8rem] flex-1 truncate font-medium text-fg">{ev.label}</span>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => onSetAttackUsages(ev.id, ev.usages - 1)}
              disabled={ev.usages <= 1}
              className="w-5 h-5 text-xs bg-surface-3 hover:bg-surface-2 rounded text-fg-muted disabled:opacity-40"
              title="回数を減らす"
            >−</button>
            <span className="w-6 text-center font-mono text-accent font-medium">×{ev.usages}</span>
            <button
              type="button"
              onClick={() => onSetAttackUsages(ev.id, ev.usages + 1)}
              disabled={ev.usages >= 9}
              className="w-5 h-5 text-xs bg-surface-3 hover:bg-surface-2 rounded text-fg-muted disabled:opacity-40"
              title="回数を増やす"
            >+</button>
          </div>
          <span className="font-mono text-fg-muted">{subMin}〜{subMax}</span>
          <button
            type="button"
            onClick={onAddPainSplit}
            className="text-[10px] px-1.5 py-0.5 rounded border border-edge text-fg-faint hover:border-accent hover:text-accent transition-colors"
            title="このエントリの直後に痛み分けを挿入"
          >+痛み分け</button>
        </div>
      </TimelineRow>
    )
  }

  if (ev.kind === 'painSplit') {
    return (
      <TimelineRow idx={idx} total={total} tone="accent" isHighlighted={isHighlighted} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onRemove={onRemove}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-accent">↺ 痛み分け</span>
          <span
            className="text-fg-muted"
            title="累積モードでの攻撃側HP（被ダメ等を含むシーケンス時は追跡中のHPが使われ、この値は無視されます）"
          >
            累積時HP
          </span>
          <input
            type="number"
            min={0}
            value={ev.attackerHp}
            onChange={e => onUpdate({ attackerHp: Math.max(0, Number(e.target.value)) } as Partial<ProgressionEvent>)}
            className="input-base w-14 text-center text-xs px-1"
            title="累積（被ダメなし）モードでのみ使用。シーケンス出力は両者の追跡HPで均します。"
          />
          {attackerMaxHp > 0 && (
            <span className="text-[10px] text-fg-faint">/ 最大{attackerMaxHp}</span>
          )}
        </div>
      </TimelineRow>
    )
  }

  if (ev.kind === 'incoming') {
    const hasMoveOptions = defenderMoveOptions.length > 0
    return (
      <TimelineRow idx={idx} total={total} tone="warning" isHighlighted={isHighlighted} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onRemove={onRemove}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-warning">被ダメ</span>
          <select
            value={ev.moveName ?? ''}
            onChange={e => onUpdate({ moveName: e.target.value || null } as Partial<ProgressionEvent>)}
            className="input-base min-w-[8rem] max-w-full text-xs px-1 py-0.5"
            disabled={!hasMoveOptions}
          >
            <option value="">{hasMoveOptions ? '技を選択' : '防御側の技未設定'}</option>
            {defenderMoveOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          {!hasMoveOptions && (
            <span className="text-[10px] text-fg-faint">
              防御側の「被ダメ用の技」から追加
            </span>
          )}
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={ev.crit}
              onChange={e => onUpdate({ crit: e.target.checked } as Partial<ProgressionEvent>)}
              className="accent-accent"
            />
            <span className="text-[10px] text-fg-muted">急所</span>
          </label>
        </div>
      </TimelineRow>
    )
  }

  if (ev.kind === 'rearmBerry') {
    return (
      <TimelineRow idx={idx} total={total} tone="success" isHighlighted={isHighlighted} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onRemove={onRemove}>
        <span className="font-semibold text-success">リサイクル（きのみ再装填）</span>
      </TimelineRow>
    )
  }

  if (ev.kind === 'leechSeed') {
    const arrow = ev.direction === 'fromAttacker' ? '攻→防' : '防→攻'
    return (
      <TimelineRow idx={idx} total={total} tone="success" isHighlighted={isHighlighted} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onRemove={onRemove}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-success">宿り木 ({arrow})</span>
          <span className="text-[10px] text-fg-faint">
            {ev.direction === 'fromAttacker'
              ? '防御側 -1/8 → 攻撃側 +同量'
              : '攻撃側 -1/8 → 防御側 +同量'}
          </span>
        </div>
      </TimelineRow>
    )
  }

  // const / recover 系
  const labels: Record<string, { text: string; color: string }> = {
    defenderConst:   { text: '防御側ダメ', color: 'text-warning' },
    attackerConst:   { text: '攻撃側ダメ', color: 'text-warning' },
    defenderRecover: { text: '防御側回復', color: 'text-success' },
    attackerRecover: { text: '攻撃側回復', color: 'text-success' },
  }
  const meta = labels[ev.kind]
  // 回復イベントには再生技（つきのひかり等）用の天候プリセット（1/2・1/3・2/3）を表示
  const isRecover = ev.kind === 'defenderRecover' || ev.kind === 'attackerRecover'
  const recoverBaseHp = ev.kind === 'attackerRecover' ? attackerMaxHp : defenderMaxHp
  const RECOVER_FRACTIONS = [
    { label: '1/3', num: 1, den: 3 },
    { label: '1/2', num: 1, den: 2 },
    { label: '2/3', num: 2, den: 3 },
  ]
  return (
    <TimelineRow
      idx={idx}
      total={total}
      tone={isRecover ? 'success' : 'warning'}
      isHighlighted={isHighlighted}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      onRemove={onRemove}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`font-semibold ${meta.color}`}>{meta.text}</span>
        <input
          type="number"
          min={0}
          value={ev.amount}
          onChange={e => onUpdate({ amount: readNonNegative(e.target.value) } as Partial<ProgressionEvent>)}
          className="input-base w-16 text-center text-xs px-1 py-0.5"
        />
        {isRecover && recoverBaseHp > 0 && RECOVER_FRACTIONS.map(f => {
          const val = Math.floor(recoverBaseHp * f.num / f.den)
          return (
            <button
              key={f.label}
              type="button"
              onClick={() => onUpdate({ amount: val } as Partial<ProgressionEvent>)}
              className="text-[10px] px-1 py-0.5 rounded border border-edge text-fg-muted hover:border-success hover:text-success transition-colors"
              title={`再生技: ${f.label} 回復 (${val})${f.label === '1/2' ? ' = つきのひかり通常/じこさいせい等' : f.label === '1/3' ? ' = つきのひかり雨/砂/雪' : ' = つきのひかり晴'}`}
            >
              {f.label}<span className="ml-0.5 opacity-60">{val}</span>
            </button>
          )
        })}
      </div>
    </TimelineRow>
  )
}

function RowControls({ idx, total, onMoveUp, onMoveDown, onRemove }: {
  idx: number; total: number; onMoveUp: () => void; onMoveDown: () => void; onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-0.5 flex-shrink-0">
      <button
        type="button"
        onClick={onMoveUp}
        disabled={idx === 0}
        className="w-5 h-5 text-xs bg-surface-3 hover:bg-surface-2 rounded text-fg-muted disabled:opacity-30"
        aria-label="イベントを上へ移動"
        title="上へ"
      >↑</button>
      <button
        type="button"
        onClick={onMoveDown}
        disabled={idx === total - 1}
        className="w-5 h-5 text-xs bg-surface-3 hover:bg-surface-2 rounded text-fg-muted disabled:opacity-30"
        aria-label="イベントを下へ移動"
        title="下へ"
      >↓</button>
      <button
        type="button"
        onClick={onRemove}
        className="w-5 h-5 text-xs bg-surface-3 hover:bg-surface-2 rounded text-fg-faint hover:text-danger-2 transition-colors flex-shrink-0 ml-0.5"
        aria-label="イベントを削除"
        title="削除"
      >✕</button>
    </div>
  )
}

interface BgProps {
  constDmg: number
  constRec: number
  constRecBerry: number
  berryThresholdPct: number
  berryCudChew: boolean
  berryHarvestChance: number
  poisonTurns: number
  poisonPerTurn: number[]
  poisonTotal: number
  defenderMaxHp: number
  setConstDmg: (v: number) => void
  setConstRec: (v: number) => void
  setConstRecBerry: (v: number) => void
  setConstRecBerryThresholdPct: (v: number) => void
  setBerryCudChew: (v: boolean) => void
  setBerryHarvestChance: (v: number) => void
  setPoisonTurns: (n: number) => void
}

function BackgroundEffectsSection({
  constDmg, constRec, constRecBerry, berryThresholdPct, berryCudChew, berryHarvestChance,
  poisonTurns, poisonPerTurn, poisonTotal, defenderMaxHp,
  setConstDmg, setConstRec, setConstRecBerry, setConstRecBerryThresholdPct,
  setBerryCudChew, setBerryHarvestChance, setPoisonTurns,
}: BgProps) {
  const [isOpen, setIsOpen] = useState(false)
  const activeEffectCount =
    (constDmg > 0 ? 1 : 0) +
    (constRec > 0 ? 1 : 0) +
    (constRecBerry > 0 ? 1 : 0) +
    (poisonTurns > 0 ? 1 : 0)
  const totalDamage = constDmg + poisonTotal
  const totalRecovery = constRec + constRecBerry
  const summaryParts = [
    constDmg > 0 ? `定数${constDmg}` : null,
    constRec > 0 ? `回復${constRec}` : null,
    constRecBerry > 0 ? `きのみ${constRecBerry}` : null,
    poisonTurns > 0 ? `猛毒${poisonTotal}` : null,
  ].filter((part): part is string => part !== null)

  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(v => !v)}
        className="w-full rounded border border-edge bg-surface-2 px-2 py-1.5 text-left text-xs text-fg-muted transition-colors hover:bg-surface-3"
      >
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[10px] text-fg-faint">{isOpen ? '▲' : '▼'}</span>
          <span className="font-semibold text-fg-muted">背景効果</span>
          <span className="font-mono text-fg-subtle">{activeEffectCount}件</span>
          {activeEffectCount > 0 ? (
            <>
              <span className="font-mono text-warning">-{totalDamage}</span>
              <span className="font-mono text-success">+{totalRecovery}</span>
              <span className="text-[10px] text-fg-faint">{summaryParts.join(' / ')}</span>
            </>
          ) : (
            <span className="text-[10px] text-fg-faint">未設定</span>
          )}
        </span>
      </button>

      {isOpen && (
      <div className="space-y-3">
        {/* 定数ダメージ */}
        <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-fg-muted w-14 flex-shrink-0">定数ダメ</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="w-5 h-5 text-xs bg-surface-3 hover:bg-surface-2 rounded text-fg-muted"
              onClick={() => setConstDmg(Math.max(0, constDmg - 1))}
            >−</button>
            <input
              type="number"
              min={0}
              value={constDmg}
              onChange={e => setConstDmg(readNonNegative(e.target.value))}
              className="input-base w-14 text-center text-xs px-1"
            />
            <button
              type="button"
              className="w-5 h-5 text-xs bg-surface-3 hover:bg-surface-2 rounded text-fg-muted"
              onClick={() => setConstDmg(constDmg + 1)}
            >+</button>
          </div>
          <span className="text-xs text-fg-subtle">砂/毒/やけど等</span>
        </div>
        <div className="flex items-center gap-1 pl-[3.75rem] flex-wrap">
          {CONST_DMG_FRACTIONS.map(f => {
            const val = Math.floor(defenderMaxHp * f.num / f.den)
            return (
              <button
                key={f.label}
                type="button"
                onClick={() => setConstDmg(constDmg + val)}
                className="text-xs px-1 py-0.5 rounded border transition-colors bg-surface-3 border-edge text-fg-muted hover:border-warning hover:text-warning"
                title={`+${val} (${f.label})`}
              >
                +{f.label}<span className="ml-0.5 opacity-60">{val}</span>
              </button>
            )
          })}
        </div>
        {constDmg > 0 && (
          <div className="pl-[3.75rem]">
            <ConstBar value={constDmg} maxHp={defenderMaxHp} />
            <span className="text-xs text-warning font-mono">
              {hpPercentText(constDmg, defenderMaxHp)}
            </span>
          </div>
        )}
        </div>

        {/* 定数回復（たべのこし等の per-turn passive） */}
        <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-fg-muted w-20 flex-shrink-0">食べ残し/ポイヒ</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="w-5 h-5 text-xs bg-surface-3 hover:bg-surface-2 rounded text-fg-muted"
              onClick={() => setConstRec(Math.max(0, constRec - 1))}
            >−</button>
            <input
              type="number"
              min={0}
              value={constRec}
              onChange={e => setConstRec(readNonNegative(e.target.value))}
              className="input-base w-14 text-center text-xs px-1"
            />
            <button
              type="button"
              className="w-5 h-5 text-xs bg-surface-3 hover:bg-surface-2 rounded text-fg-muted"
              onClick={() => setConstRec(constRec + 1)}
            >+</button>
          </div>
          <span className="text-xs text-fg-subtle">毎ターン回復</span>
        </div>
        <div className="pl-[3.75rem] text-[10px] text-fg-faint">
          毎ターン適用・加算可（重複ソースは複数クリック）
        </div>
        <div className="flex items-center gap-1 pl-[3.75rem] flex-wrap">
          {CONST_REC_FRACTIONS.map(f => {
            const val = Math.floor(defenderMaxHp * f.num / f.den)
            const src = f.label === '1/16'
              ? '食べ残し/あめうけざら/アクアリング/ねをはる'
              : 'ポイズンヒール'
            return (
              <button
                key={f.label}
                type="button"
                onClick={() => setConstRec(constRec + val)}
                className="text-xs px-1 py-0.5 rounded border transition-colors bg-surface-3 border-edge text-fg-muted hover:border-success hover:text-success"
                title={`+${val} (${f.label} = ${src}) クリックで加算`}
              >
                +{f.label}<span className="ml-0.5 opacity-60">{val}</span>
              </button>
            )
          })}
        </div>
        {constRec > 0 && (
          <div className="pl-[3.75rem]">
            <ConstBar value={constRec} maxHp={defenderMaxHp} isRecovery />
            <span className="text-xs text-success font-mono">
              {hpPercentText(constRec, defenderMaxHp)}
            </span>
          </div>
        )}
        </div>

        {/* オボン/混乱実回復（HP≤しきい値 で1回限り） */}
        <div className="space-y-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-fg-muted w-14 flex-shrink-0">オボン/混乱実</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="w-5 h-5 text-xs bg-surface-3 hover:bg-surface-2 rounded text-fg-muted"
              onClick={() => setConstRecBerry(Math.max(0, constRecBerry - 1))}
            >−</button>
            <input
              type="number"
              min={0}
              value={constRecBerry}
              onChange={e => setConstRecBerry(readNonNegative(e.target.value))}
              className="input-base w-14 text-center text-xs px-1"
            />
            <button
              type="button"
              className="w-5 h-5 text-xs bg-surface-3 hover:bg-surface-2 rounded text-fg-muted"
              onClick={() => setConstRecBerry(constRecBerry + 1)}
            >+</button>
          </div>
          <span className="text-xs text-fg-muted">HP≤</span>
          <input
            type="number"
            min={1}
            max={100}
            value={berryThresholdPct}
            onChange={e => setConstRecBerryThresholdPct(readPercent(e.target.value))}
            className="input-base w-10 text-center text-xs px-1"
            title="発動しきい値（防御側HPの%）"
          />
          <span className="text-xs text-fg-muted">%で1回限り</span>
        </div>
        <div className="pl-[3.75rem] text-[10px] text-fg-faint">
          ※防御側HPがしきい値以下に達した時点で1回限り自動発動・以後消費
        </div>
        <div className="flex items-center gap-1 pl-[3.75rem] flex-wrap">
          <button
            type="button"
            onClick={() => {
              setConstRecBerry(Math.floor(defenderMaxHp / 4))
              setConstRecBerryThresholdPct(50)
            }}
            className="text-xs px-1.5 py-0.5 rounded border transition-colors bg-surface-3 border-edge text-fg-muted hover:border-success hover:text-success"
            title={`オボンのみ: HP≤50% で +${Math.floor(defenderMaxHp / 4)} (1/4)`}
          >
            オボン<span className="ml-0.5 opacity-60">HP≤50% / +1/4</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setConstRecBerry(Math.floor(defenderMaxHp / 3))
              setConstRecBerryThresholdPct(25)
            }}
            className="text-xs px-1.5 py-0.5 rounded border transition-colors bg-surface-3 border-edge text-fg-muted hover:border-success hover:text-success"
            title={`混乱実: HP≤25% で +${Math.floor(defenderMaxHp / 3)} (1/3)`}
          >
            混乱実<span className="ml-0.5 opacity-60">HP≤25% / +1/3</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setConstRecBerry(Math.floor(defenderMaxHp / 3))
              setConstRecBerryThresholdPct(50)
            }}
            className="text-xs px-1.5 py-0.5 rounded border transition-colors bg-surface-3 border-edge text-fg-muted hover:border-accent hover:text-accent"
            title={`くいしんぼう: 混乱実が HP≤50% で発動 (+${Math.floor(defenderMaxHp / 3)})`}
          >
            +くいしんぼう<span className="ml-0.5 opacity-60">→HP≤50%</span>
          </button>
          <button
            type="button"
            onClick={() => setConstRecBerry(constRecBerry + Math.floor(defenderMaxHp / 3))}
            className="text-xs px-1.5 py-0.5 rounded border transition-colors bg-surface-3 border-edge text-fg-muted hover:border-accent hover:text-accent"
            title={`ほおぶくろ: きのみ消費時に追加 +${Math.floor(defenderMaxHp / 3)} (1/3)`}
          >
            +ほおぶくろ<span className="ml-0.5 opacity-60">+1/3</span>
          </button>
        </div>
        {/* はんすう・しゅうかく（複数回発動） */}
        {constRecBerry > 0 && (
          <div className="flex items-center gap-3 pl-[3.75rem] flex-wrap text-xs">
            <label className="flex items-center gap-1 cursor-pointer" title="はんすう: 次のターン終了時にもう一度発動（計2回）">
              <input
                type="checkbox"
                checked={berryCudChew}
                onChange={e => setBerryCudChew(e.target.checked)}
                className="accent-accent"
              />
              <span className="text-fg-muted">はんすう（2回）</span>
            </label>
            <span className="flex items-center gap-1" title="しゅうかく/ものひろい: 各ターン終了時に再装填">
              <span className="text-fg-muted">しゅうかく:</span>
              {[
                { label: 'なし', v: 0 },
                { label: '50%', v: 0.5 },
                { label: '晴/物拾', v: 1 },
              ].map(o => (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => setBerryHarvestChance(o.v)}
                  className={`px-1 py-0.5 rounded border text-[11px] transition-colors ${
                    berryHarvestChance === o.v
                      ? 'bg-accent-bg border-accent-border text-accent'
                      : 'bg-surface-3 border-edge text-fg-muted hover:bg-surface-2'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </span>
          </div>
        )}
        <div className="pl-[3.75rem] text-[10px] text-fg-faint">
          リサイクル（手動再装填）はイベント「＋リサイクル」を時系列に挿入
        </div>
        {constRecBerry > 0 && (
          <div className="pl-[3.75rem]">
            <ConstBar value={constRecBerry} maxHp={defenderMaxHp} isRecovery />
            <span className="text-xs text-success font-mono">
              {hpPercentText(constRecBerry, defenderMaxHp)}
            </span>
          </div>
        )}
        </div>

        {/* もうどく累積 */}
        <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-fg-muted w-14 flex-shrink-0">もうどく</span>
          <div className="flex flex-wrap gap-1">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setPoisonTurns(n)}
                className={`w-6 h-6 text-xs rounded transition-colors ${
                  poisonTurns === n
                    ? 'bg-accent-bg border border-accent-border text-accent'
                    : 'bg-surface-3 text-fg-muted hover:bg-surface-2'
                }`}
                title={n === 0 ? 'なし' : `${n}ターン目まで`}
              >
                {n === 0 ? '×' : n}
              </button>
            ))}
          </div>
        </div>
        {poisonTurns > 0 && (
          <div className="pl-[3.75rem] space-y-1">
            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
              {poisonPerTurn.map((dmg, i) => (
                <span key={i} className="text-[10px] font-mono text-fg-muted">
                  {i + 1}T:{dmg}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-fg-muted">
                累計 {poisonTotal}
                <span className="font-normal text-fg-subtle ml-1">
                  ({hpPercentText(poisonTotal, defenderMaxHp)})
                </span>
              </span>
              <span className="text-[10px] text-fg-subtle">→ ダメ進行に自動加算</span>
            </div>
          </div>
        )}
      </div>
      </div>
      )}
    </div>
  )
}
