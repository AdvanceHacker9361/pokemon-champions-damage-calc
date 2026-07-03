import { useState } from 'react'

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
  moveConstDmgToTimeline: () => void
  moveConstRecToTimeline: () => void
  movePoisonToTimeline: () => void
}

export function BackgroundEffectsSection({
  constDmg, constRec, constRecBerry, berryThresholdPct, berryCudChew, berryHarvestChance,
  poisonTurns,
  poisonPerTurn, poisonTotal, defenderMaxHp,
  setConstDmg, setConstRec, setConstRecBerry, setConstRecBerryThresholdPct,
  setBerryCudChew, setBerryHarvestChance, setPoisonTurns,
  moveConstDmgToTimeline, moveConstRecToTimeline, movePoisonToTimeline,
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
    constDmg > 0 ? `定数候補${constDmg}` : null,
    constRec > 0 ? `回復候補${constRec}` : null,
    constRecBerry > 0 ? `きのみ${constRecBerry}` : null,
    poisonTurns > 0 ? `猛毒候補${poisonTotal}` : null,
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
          <span className="font-semibold text-fg-muted">背景効果プリセット</span>
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
        <div className="rounded border border-accent-border bg-accent-bg/30 px-2 py-1.5 text-[10px] text-fg-muted leading-relaxed">
          定数ダメージ・毎ターン回復・もうどくは、値を作ってから時系列イベントへ移動します。任意値だけを直接入れる場合は上の「イベント追加 / HP補正」を使います。
        </div>

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
          <div className="pl-[3.75rem] space-y-1">
            <div>
              <ConstBar value={constDmg} maxHp={defenderMaxHp} />
              <span className="text-xs text-warning font-mono">
                {hpPercentText(constDmg, defenderMaxHp)}
              </span>
            </div>
            <button
              type="button"
              onClick={moveConstDmgToTimeline}
              className="text-[11px] px-1.5 py-0.5 rounded border border-warning text-warning hover:bg-surface-3 transition-colors"
              title="この定数ダメージを時系列イベント末尾へ移し、プリセット値を0にします"
            >
              イベントへ移動
            </button>
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
          <div className="pl-[3.75rem] space-y-1">
            <div>
              <ConstBar value={constRec} maxHp={defenderMaxHp} isRecovery />
              <span className="text-xs text-success font-mono">
                {hpPercentText(constRec, defenderMaxHp)}
              </span>
            </div>
            <button
              type="button"
              onClick={moveConstRecToTimeline}
              className="text-[11px] px-1.5 py-0.5 rounded border border-success text-success hover:bg-surface-3 transition-colors"
              title="この毎ターン回復を時系列イベント末尾へ移し、プリセット値を0にします"
            >
              イベントへ移動
            </button>
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
              <button
                type="button"
                onClick={movePoisonToTimeline}
                className="text-[11px] px-1.5 py-0.5 rounded border border-warning text-warning hover:bg-surface-3 transition-colors"
                title="もうどく各ターンを時系列イベント末尾へ移し、もうどく候補を0にします"
              >
                イベントへ移動
              </button>
            </div>
          </div>
        )}
      </div>
      </div>
      )}
    </div>
  )
}
