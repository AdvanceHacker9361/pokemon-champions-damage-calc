import { useAccumStore } from '@/presentation/store/accumStore'

interface DamageAccumPanelProps {
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

export function DamageAccumPanel({ defenderMaxHp }: DamageAccumPanelProps) {
  const entries        = useAccumStore(s => s.entries)
  const constDmg       = useAccumStore(s => s.constDmg)
  const constRec       = useAccumStore(s => s.constRec)
  const poisonTurns    = useAccumStore(s => s.poisonTurns)
  const removeEntry    = useAccumStore(s => s.removeEntry)
  const clearEntries   = useAccumStore(s => s.clearEntries)
  const setEntryUsages = useAccumStore(s => s.setEntryUsages)
  const setConstDmg    = useAccumStore(s => s.setConstDmg)
  const setConstRec    = useAccumStore(s => s.setConstRec)
  const setPoisonTurns = useAccumStore(s => s.setPoisonTurns)

  const poisonPerTurn = Array.from({ length: poisonTurns }, (_, i) =>
    Math.max(1, Math.floor(defenderMaxHp * (i + 1) / 16))
  )
  const poisonTotal = poisonPerTurn.reduce((s, v) => s + v, 0)

  const hasEntries = entries.length > 0
  const hasAnything = hasEntries || constDmg > 0 || constRec > 0 || poisonTurns > 0

  return (
    <div className="panel space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-fg-muted">加算計算リスト</h3>
        {hasAnything && (
          <button
            type="button"
            onClick={clearEntries}
            className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border border-danger-2 text-danger-2 hover:bg-surface-3 transition-colors"
            title="加算リスト・定数ダメ・定数回復・もうどくをすべてクリア"
          >
            <span>✕</span>
            <span>全クリア</span>
          </button>
        )}
      </div>

      <div className="text-[10px] text-fg-faint">
        総合累積はページ上部のサマリーに表示されます
      </div>

      {/* エントリ一覧 */}
      {hasEntries ? (
        <div className="space-y-1">
          {entries.map(entry => {
            const subMin = entry.minDmg * entry.usages
            const subMax = entry.maxDmg * entry.usages
            return (
              <div key={entry.id} className="flex items-center gap-2 text-xs">
                <span className="text-fg truncate flex-1 min-w-0">
                  {entry.label}
                </span>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setEntryUsages(entry.id, entry.usages - 1)}
                    disabled={entry.usages <= 1}
                    className="w-5 h-5 text-xs bg-surface-3 hover:bg-surface-2 rounded text-fg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                    title="回数を減らす"
                  >−</button>
                  <span className="w-6 text-center font-mono text-accent font-medium">
                    ×{entry.usages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEntryUsages(entry.id, entry.usages + 1)}
                    disabled={entry.usages >= 9}
                    className="w-5 h-5 text-xs bg-surface-3 hover:bg-surface-2 rounded text-fg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                    title="回数を増やす"
                  >+</button>
                </div>
                <span className="text-fg-muted font-mono flex-shrink-0 w-24 text-right">
                  {subMin}〜{subMax}
                </span>
                <button
                  type="button"
                  onClick={() => removeEntry(entry.id)}
                  className="text-fg-faint hover:text-danger-2 transition-colors flex-shrink-0"
                  title="削除"
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-xs text-fg-faint text-center py-1">
          各技の「+ 加算」ボタンで追加
        </div>
      )}

      <div className="border-t border-edge" />

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
          <span className="text-xs text-fg-subtle">残飯/黒ヘド等</span>
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
              <span className="text-[10px] text-fg-subtle">→ 総合累積に自動加算</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
