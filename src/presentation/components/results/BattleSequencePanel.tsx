import { useBattleSequence } from '@/presentation/hooks/useBattleSequence'
import { useBattleSequenceStore, type SeqStep, type SeqStepKind } from '@/presentation/store/battleSequenceStore'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'

/** 分布Mapから残HPの最小・最大を取得 */
function hpRange(dist: Map<number, number>): { min: number; max: number } | null {
  if (dist.size === 0) return null
  let min = Infinity, max = -Infinity
  for (const hp of dist.keys()) {
    if (hp < min) min = hp
    if (hp > max) max = hp
  }
  return { min, max }
}

const ADD_BUTTONS: { kind: SeqStepKind; label: string; defaults?: Partial<SeqStep> }[] = [
  { kind: 'attack',          label: '＋与ダメ', defaults: { crit: false } },
  { kind: 'incoming',        label: '＋被ダメ', defaults: { crit: false } },
  { kind: 'painSplit',       label: '＋痛み分け' },
  { kind: 'defenderConst',   label: '＋防御側定数ダメ', defaults: { amount: 0 } },
  { kind: 'attackerConst',   label: '＋攻撃側定数ダメ', defaults: { amount: 0 } },
  { kind: 'defenderRecover', label: '＋防御側回復', defaults: { amount: 0 } },
  { kind: 'attackerRecover', label: '＋攻撃側回復', defaults: { amount: 0 } },
]

export function BattleSequencePanel() {
  const enabled            = useBattleSequenceStore(s => s.enabled)
  const steps              = useBattleSequenceStore(s => s.steps)
  const attackerStartHp    = useBattleSequenceStore(s => s.attackerStartHp)
  const defenderStartHp    = useBattleSequenceStore(s => s.defenderStartHp)
  const setEnabled         = useBattleSequenceStore(s => s.setEnabled)
  const addStep            = useBattleSequenceStore(s => s.addStep)
  const removeStep         = useBattleSequenceStore(s => s.removeStep)
  const updateStep         = useBattleSequenceStore(s => s.updateStep)
  const moveStep           = useBattleSequenceStore(s => s.moveStep)
  const clear              = useBattleSequenceStore(s => s.clear)
  const setAttackerStartHp = useBattleSequenceStore(s => s.setAttackerStartHp)
  const setDefenderStartHp = useBattleSequenceStore(s => s.setDefenderStartHp)

  const attackerMoves = useAttackerStore(s => s.moves)
  const attackerName  = useAttackerStore(s => s.pokemonName)
  const defenderMoves = useDefenderStore(s => s.moves)
  const defenderName  = useDefenderStore(s => s.pokemonName)

  const { attackerMaxHp, defenderMaxHp, resolved, result } = useBattleSequence()

  const attackerMoveOptions = attackerMoves.filter((m): m is string => !!m)
  const defenderMoveOptions = defenderMoves.filter((m): m is string => !!m)

  return (
    <div className="panel space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-fg-muted">
          バトルシーケンス（痛み分け・反撃を含む多ターン計算）
        </h3>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => setEnabled(e.target.checked)}
            className="accent-accent"
          />
          <span className="text-fg-muted">有効</span>
        </label>
      </div>

      {!enabled ? (
        <div className="text-[11px] text-fg-faint leading-relaxed">
          攻撃側が複数ターン技を撃つ間に、防御側の反撃（被ダメ）や痛み分けを挟むシナリオを、
          攻撃側HP×防御側HPの同時分布でシミュレートします。
          「有効」にして、ターン順にステップを並べてください。
        </div>
      ) : (
        <>
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

          {/* ステップ一覧 */}
          {steps.length > 0 ? (
            <div className="space-y-1.5">
              {steps.map((step, idx) => {
                const r = resolved[idx]
                return (
                  <div
                    key={step.id}
                    className="flex items-center gap-1.5 text-xs bg-surface-2 rounded px-2 py-1.5"
                  >
                    <span className="text-fg-faint w-5 text-right font-mono">{idx + 1}</span>

                    <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
                      <StepControls
                        step={step}
                        attackerMoveOptions={attackerMoveOptions}
                        defenderMoveOptions={defenderMoveOptions}
                        onUpdate={patch => updateStep(step.id, patch)}
                      />
                      {r?.error && (
                        <span className="text-[10px] text-danger-2">{r.error}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => moveStep(step.id, -1)}
                        disabled={idx === 0}
                        className="w-5 h-5 text-xs bg-surface-3 hover:bg-surface-2 rounded text-fg-muted disabled:opacity-30"
                        title="上へ"
                      >↑</button>
                      <button
                        type="button"
                        onClick={() => moveStep(step.id, 1)}
                        disabled={idx === steps.length - 1}
                        className="w-5 h-5 text-xs bg-surface-3 hover:bg-surface-2 rounded text-fg-muted disabled:opacity-30"
                        title="下へ"
                      >↓</button>
                      <button
                        type="button"
                        onClick={() => removeStep(step.id)}
                        className="text-fg-faint hover:text-danger-2 transition-colors ml-0.5"
                        title="削除"
                      >✕</button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-[11px] text-fg-faint text-center py-1">
              下のボタンでステップを追加してください
            </div>
          )}

          {/* 追加ボタン */}
          <div className="flex flex-wrap gap-1">
            {ADD_BUTTONS.map(b => (
              <button
                key={b.kind}
                type="button"
                onClick={() => addStep({ kind: b.kind, ...b.defaults })}
                className="text-[11px] px-1.5 py-0.5 rounded border border-edge text-fg-muted hover:border-accent hover:text-accent transition-colors"
              >
                {b.label}
              </button>
            ))}
            {steps.length > 0 && (
              <button
                type="button"
                onClick={clear}
                className="text-[11px] px-1.5 py-0.5 rounded border border-danger-2 text-danger-2 hover:bg-surface-3 transition-colors ml-auto"
              >
                全クリア
              </button>
            )}
          </div>

          {/* 結果 */}
          {result && (
            <div className="space-y-2 pt-1 border-t border-edge">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span className="font-mono">
                  <span className="text-fg-muted">防御側撃破: </span>
                  <span className="font-bold text-danger-2">
                    {(result.defenderKoProb * 100).toFixed(1)}%
                  </span>
                </span>
                <span className="font-mono">
                  <span className="text-fg-muted">攻撃側生存: </span>
                  <span className="font-bold text-success">
                    {(result.attackerSurviveProb * 100).toFixed(1)}%
                  </span>
                </span>
                <span className="font-mono">
                  <span className="text-fg-muted">両者生存: </span>
                  <span className="text-fg">{(result.bothAliveProb * 100).toFixed(1)}%</span>
                </span>
              </div>

              {/* ステップ後HP分布テーブル */}
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
                    {result.steps.map((s, i) => {
                      const aR = hpRange(s.attackerHpDist)
                      const dR = hpRange(s.defenderHpDist)
                      return (
                        <tr key={i} className="border-b border-edge/40">
                          <td className="py-0.5 pr-2 text-fg-faint">{i + 1}</td>
                          <td className="py-0.5 pr-2 text-fg-muted truncate max-w-[10rem]">{s.label}</td>
                          <td className="py-0.5 pr-2 text-right text-fg">
                            {aR ? `${aR.min}〜${aR.max}` : '−'}
                          </td>
                          <td className="py-0.5 pr-2 text-right text-fg">
                            {dR ? `${dR.min}〜${dR.max}` : '−'}
                          </td>
                          <td className="py-0.5 pr-2 text-right text-danger-2">
                            {(s.koProb * 100).toFixed(0)}%
                          </td>
                          <td className="py-0.5 text-right text-warning">
                            {(s.faintProb * 100).toFixed(0)}%
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="text-[10px] text-fg-faint leading-relaxed">
                ※ 残HPは両者生存マスでの範囲。被ダメは攻守を入れ替えて自動計算（防御側の状態異常も反映）。
                痛み分けは攻撃側・防御側の現在HP同時分布から正確に均します。
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function StepControls({
  step,
  attackerMoveOptions,
  defenderMoveOptions,
  onUpdate,
}: {
  step: SeqStep
  attackerMoveOptions: string[]
  defenderMoveOptions: string[]
  onUpdate: (patch: Partial<Omit<SeqStep, 'id'>>) => void
}) {
  switch (step.kind) {
    case 'attack':
    case 'incoming': {
      const options = step.kind === 'attack' ? attackerMoveOptions : defenderMoveOptions
      const tag = step.kind === 'attack' ? '与ダメ' : '被ダメ'
      const tagColor = step.kind === 'attack' ? 'text-danger-2' : 'text-warning'
      return (
        <>
          <span className={`font-semibold ${tagColor}`}>{tag}</span>
          <select
            value={step.moveName ?? ''}
            onChange={e => onUpdate({ moveName: e.target.value || null })}
            className="input-base text-xs px-1 py-0.5 max-w-[9rem]"
          >
            <option value="">技を選択</option>
            {options.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={step.crit ?? false}
              onChange={e => onUpdate({ crit: e.target.checked })}
              className="accent-accent"
            />
            <span className="text-[10px] text-fg-muted">急所</span>
          </label>
        </>
      )
    }
    case 'painSplit':
      return <span className="font-semibold text-accent">↺ 痛み分け</span>
    case 'defenderConst':
    case 'attackerConst':
    case 'defenderRecover':
    case 'attackerRecover': {
      const labels: Record<string, string> = {
        defenderConst: '防御側ダメ',
        attackerConst: '攻撃側ダメ',
        defenderRecover: '防御側回復',
        attackerRecover: '攻撃側回復',
      }
      return (
        <>
          <span className="text-fg-muted">{labels[step.kind]}</span>
          <input
            type="number"
            min={0}
            value={step.amount ?? 0}
            onChange={e => onUpdate({ amount: Math.max(0, Number(e.target.value)) })}
            className="input-base w-16 text-center text-xs px-1 py-0.5"
          />
        </>
      )
    }
  }
}
