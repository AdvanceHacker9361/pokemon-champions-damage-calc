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
  { label: '1/4',  num: 1, den: 4  },
  { label: '1/3',  num: 1, den: 3  },
  { label: '1/2',  num: 1, den: 2  },
  { label: '2/3',  num: 2, den: 3  },
]

const ADD_BUTTONS: { kind: EventKind; label: string }[] = [
  { kind: 'incoming',        label: '＋被ダメ' },
  { kind: 'painSplit',       label: '＋痛み分け' },
  { kind: 'defenderConst',   label: '＋防御側ダメ' },
  { kind: 'attackerConst',   label: '＋攻撃側ダメ' },
  { kind: 'defenderRecover', label: '＋防御側回復' },
  { kind: 'attackerRecover', label: '＋攻撃側回復' },
]

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
  const pct = Math.min(100, (value / maxHp) * 100)
  return (
    <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, backgroundColor: isRecovery ? 'var(--success)' : 'var(--warning)' }}
      />
    </div>
  )
}

export function DamageProgressionPanel({ defenderMaxHp }: DamageProgressionPanelProps) {
  const events           = useProgressionStore(s => s.events)
  const constDmg         = useProgressionStore(s => s.constDmg)
  const constRec         = useProgressionStore(s => s.constRec)
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
  const hasAnything = hasEvents || constDmg > 0 || constRec > 0 || poisonTurns > 0
  const showSequenceOutputs = hasSequenceImpact({ events, attackerStartHp })

  const { result: seqResult } = useBattleSequence()

  function addAfter(kind: EventKind, targetId: string | null) {
    if (kind === 'painSplit') {
      addEventAfter(targetId, { kind: 'painSplit', attackerHp: attackerMaxHp })
    } else if (kind === 'incoming') {
      addEventAfter(targetId, { kind: 'incoming', moveName: null, crit: false })
    } else if (kind === 'defenderConst' || kind === 'attackerConst' || kind === 'defenderRecover' || kind === 'attackerRecover') {
      addEventAfter(targetId, { kind, amount: 0 })
    }
  }

  return (
    <div className="panel space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-xs font-semibold text-fg-muted">イベント時系列</h3>
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
        ダメージ結果から「+加算」で与ダメを追加。被ダメ・痛み分け・定数イベントは下のボタンで追加できます。
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
              attackerMaxHp={attackerMaxHp}
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
      <div className="flex flex-wrap gap-1">
        {ADD_BUTTONS.map(b => (
          <button
            key={b.kind}
            type="button"
            onClick={() => addAfter(b.kind, null)}
            className="text-[11px] px-1.5 py-0.5 rounded border border-edge text-fg-muted hover:border-accent hover:text-accent transition-colors"
          >
            {b.label}
          </button>
        ))}
      </div>

      <div className="border-t border-edge" />

      {/* 背景効果セクション（旧 DamageAccumPanel と同じ UI） */}
      <BackgroundEffectsSection
        constDmg={constDmg}
        constRec={constRec}
        poisonTurns={poisonTurns}
        poisonPerTurn={poisonPerTurn}
        poisonTotal={poisonTotal}
        defenderMaxHp={defenderMaxHp}
        setConstDmg={setConstDmg}
        setConstRec={setConstRec}
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
  attackerMaxHp: number
  defenderMoveOptions: string[]
  onSetAttackUsages: (id: string, usages: number) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onAddPainSplit: () => void
  onUpdate: (patch: Partial<ProgressionEvent>) => void
}

function EventRow({
  ev, idx, total,
  attackerMaxHp, defenderMoveOptions,
  onSetAttackUsages, onRemove, onMoveUp, onMoveDown, onAddPainSplit, onUpdate,
}: EventRowProps) {
  if (ev.kind === 'attack') {
    const subMin = ev.minDmg * ev.usages
    const subMax = ev.maxDmg * ev.usages
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-fg-faint w-5 text-right font-mono">{idx + 1}</span>
        <span className="text-fg truncate flex-1 min-w-0">{ev.label}</span>
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
        <span className="text-fg-muted font-mono flex-shrink-0 w-24 text-right">{subMin}〜{subMax}</span>
        <button
          type="button"
          onClick={onAddPainSplit}
          className="text-[10px] px-1.5 py-0.5 rounded border border-edge text-fg-faint hover:border-accent hover:text-accent transition-colors flex-shrink-0"
          title="このエントリの直後に痛み分けを挿入"
        >+痛み分け</button>
        <RowControls idx={idx} total={total} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onRemove={onRemove} />
      </div>
    )
  }

  if (ev.kind === 'painSplit') {
    return (
      <div className="flex items-center gap-2 text-xs pl-3 ml-1 border-l-2 border-accent-border bg-accent-bg/30 rounded-r py-1 pr-2">
        <span className="text-fg-faint w-5 text-right font-mono">{idx + 1}</span>
        <span className="text-accent">↺ 痛み分け</span>
        <span
          className="text-fg-muted"
          title="累積モードでの攻撃側HP（被ダメ等を含むシーケンス時は追跡中のHPが使われ、この値は無視されます）"
        >
          累積時の攻撃側HP:
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
        <span className="flex-1" />
        <RowControls idx={idx} total={total} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onRemove={onRemove} />
      </div>
    )
  }

  if (ev.kind === 'incoming') {
    return (
      <div className="flex items-center gap-2 text-xs bg-surface-2 rounded px-2 py-1">
        <span className="text-fg-faint w-5 text-right font-mono">{idx + 1}</span>
        <span className="font-semibold text-warning">被ダメ</span>
        <select
          value={ev.moveName ?? ''}
          onChange={e => onUpdate({ moveName: e.target.value || null } as Partial<ProgressionEvent>)}
          className="input-base text-xs px-1 py-0.5 max-w-[10rem]"
        >
          <option value="">技を選択</option>
          {defenderMoveOptions.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={ev.crit}
            onChange={e => onUpdate({ crit: e.target.checked } as Partial<ProgressionEvent>)}
            className="accent-accent"
          />
          <span className="text-[10px] text-fg-muted">急所</span>
        </label>
        <span className="flex-1" />
        <RowControls idx={idx} total={total} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onRemove={onRemove} />
      </div>
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
  return (
    <div className="flex items-center gap-2 text-xs bg-surface-2 rounded px-2 py-1">
      <span className="text-fg-faint w-5 text-right font-mono">{idx + 1}</span>
      <span className={`font-semibold ${meta.color}`}>{meta.text}</span>
      <input
        type="number"
        min={0}
        value={ev.amount}
        onChange={e => onUpdate({ amount: Math.max(0, Number(e.target.value)) } as Partial<ProgressionEvent>)}
        className="input-base w-16 text-center text-xs px-1 py-0.5"
      />
      <span className="flex-1" />
      <RowControls idx={idx} total={total} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onRemove={onRemove} />
    </div>
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
        title="上へ"
      >↑</button>
      <button
        type="button"
        onClick={onMoveDown}
        disabled={idx === total - 1}
        className="w-5 h-5 text-xs bg-surface-3 hover:bg-surface-2 rounded text-fg-muted disabled:opacity-30"
        title="下へ"
      >↓</button>
      <button
        type="button"
        onClick={onRemove}
        className="text-fg-faint hover:text-danger-2 transition-colors flex-shrink-0 ml-0.5"
        title="削除"
      >✕</button>
    </div>
  )
}

interface BgProps {
  constDmg: number
  constRec: number
  poisonTurns: number
  poisonPerTurn: number[]
  poisonTotal: number
  defenderMaxHp: number
  setConstDmg: (v: number) => void
  setConstRec: (v: number) => void
  setPoisonTurns: (n: number) => void
}

function BackgroundEffectsSection({
  constDmg, constRec, poisonTurns, poisonPerTurn, poisonTotal, defenderMaxHp,
  setConstDmg, setConstRec, setPoisonTurns,
}: BgProps) {
  return (
    <>
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
              onChange={e => setConstDmg(Math.max(0, Number(e.target.value)))}
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
              {(constDmg / defenderMaxHp * 100).toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      {/* 定数回復 */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-fg-muted w-14 flex-shrink-0">定数回復</span>
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
              onChange={e => setConstRec(Math.max(0, Number(e.target.value)))}
              className="input-base w-14 text-center text-xs px-1"
            />
            <button
              type="button"
              className="w-5 h-5 text-xs bg-surface-3 hover:bg-surface-2 rounded text-fg-muted"
              onClick={() => setConstRec(constRec + 1)}
            >+</button>
          </div>
          <span className="text-xs text-fg-subtle">オボン等</span>
        </div>
        <div className="pl-[3.75rem] text-[10px] text-fg-faint">
          ※オボン相当（防御側HPが50%以下に達した時点で1回限り自動発動・以後消費）
        </div>
        <div className="flex items-center gap-1 pl-[3.75rem] flex-wrap">
          {CONST_REC_FRACTIONS.map(f => {
            const val = Math.floor(defenderMaxHp * f.num / f.den)
            return (
              <button
                key={f.label}
                type="button"
                onClick={() => setConstRec(constRec + val)}
                className="text-xs px-1 py-0.5 rounded border transition-colors bg-surface-3 border-edge text-fg-muted hover:border-success hover:text-success"
                title={`+${val} (${f.label})`}
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
              {(constRec / defenderMaxHp * 100).toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      {/* もうどく累積 */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-fg-muted w-14 flex-shrink-0">もうどく</span>
          <div className="flex gap-1">
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
                  ({(poisonTotal / defenderMaxHp * 100).toFixed(1)}%)
                </span>
              </span>
              <span className="text-[10px] text-fg-subtle">→ ダメ進行に自動加算</span>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
