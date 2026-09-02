import { useProgressionStore } from '@/presentation/store/progressionStore'

function ConstBar({ value, maxHp }: { value: number; maxHp: number }) {
  const pct = maxHp > 0 ? Math.min(100, (value / maxHp) * 100) : 0
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, backgroundColor: 'var(--success)' }}
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

/**
 * 回復タブ「きのみ」サブタブ（V3.18.0 フェーズC。旧 BackgroundEffectsSection から移設）。
 * オボン/混乱実は防御側のみ対応（攻撃側は次フェーズ）。
 */
export function BerrySection({ defenderMaxHp }: { defenderMaxHp: number }) {
  const constRecBerry = useProgressionStore(s => s.constRecBerry)
  const berryThresholdPct = useProgressionStore(s => s.constRecBerryThresholdPct)
  const berryCudChew = useProgressionStore(s => s.berryCudChew)
  const berryHarvestChance = useProgressionStore(s => s.berryHarvestChance)
  const setConstRecBerry = useProgressionStore(s => s.setConstRecBerry)
  const setConstRecBerryThresholdPct = useProgressionStore(s => s.setConstRecBerryThresholdPct)
  const setBerryCudChew = useProgressionStore(s => s.setBerryCudChew)
  const setBerryHarvestChance = useProgressionStore(s => s.setBerryHarvestChance)

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="flex-shrink-0 text-xs text-fg-muted">オボン/混乱実</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="h-5 w-5 rounded bg-surface-3 text-xs text-fg-muted hover:bg-surface-2"
            onClick={() => setConstRecBerry(Math.max(0, constRecBerry - 1))}
            aria-label="きのみ回復量を減らす"
          >−</button>
          <input
            type="number"
            min={0}
            value={constRecBerry}
            onChange={e => setConstRecBerry(readNonNegative(e.target.value))}
            aria-label="きのみ回復量"
            className="input-base w-14 px-1 text-center text-xs"
          />
          <button
            type="button"
            className="h-5 w-5 rounded bg-surface-3 text-xs text-fg-muted hover:bg-surface-2"
            onClick={() => setConstRecBerry(constRecBerry + 1)}
            aria-label="きのみ回復量を増やす"
          >+</button>
        </div>
        <span className="text-xs text-fg-muted">HP≤</span>
        <input
          type="number"
          min={1}
          max={100}
          value={berryThresholdPct}
          onChange={e => setConstRecBerryThresholdPct(readPercent(e.target.value))}
          className="input-base w-10 px-1 text-center text-xs"
          aria-label="きのみ発動しきい値（%）"
          title="発動しきい値（防御側HPの%）"
        />
        <span className="text-xs text-fg-muted">%で1回限り</span>
      </div>

      <div className="text-[10px] text-fg-faint">
        ※防御側HPがしきい値以下に達した時点で1回限り自動発動・以後消費
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => {
            setConstRecBerry(Math.floor(defenderMaxHp / 4))
            setConstRecBerryThresholdPct(50)
          }}
          className="rounded border border-edge bg-surface-3 px-1.5 py-0.5 text-xs text-fg-muted transition-colors hover:border-success hover:text-success"
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
          className="rounded border border-edge bg-surface-3 px-1.5 py-0.5 text-xs text-fg-muted transition-colors hover:border-success hover:text-success"
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
          className="rounded border border-edge bg-surface-3 px-1.5 py-0.5 text-xs text-fg-muted transition-colors hover:border-accent hover:text-accent"
          title={`くいしんぼう: 混乱実が HP≤50% で発動 (+${Math.floor(defenderMaxHp / 3)})`}
        >
          +くいしんぼう<span className="ml-0.5 opacity-60">→HP≤50%</span>
        </button>
        <button
          type="button"
          onClick={() => setConstRecBerry(constRecBerry + Math.floor(defenderMaxHp / 3))}
          className="rounded border border-edge bg-surface-3 px-1.5 py-0.5 text-xs text-fg-muted transition-colors hover:border-accent hover:text-accent"
          title={`ほおぶくろ: きのみ消費時に追加 +${Math.floor(defenderMaxHp / 3)} (1/3)`}
        >
          +ほおぶくろ<span className="ml-0.5 opacity-60">+1/3</span>
        </button>
      </div>

      {constRecBerry > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex cursor-pointer items-center gap-1" title="はんすう: 次のターン終了時にもう一度発動（計2回）">
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
                aria-pressed={berryHarvestChance === o.v}
                className={`rounded border px-1 py-0.5 text-[11px] transition-colors ${
                  berryHarvestChance === o.v
                    ? 'border-accent-border bg-accent-bg text-accent'
                    : 'border-edge bg-surface-3 text-fg-muted hover:bg-surface-2'
                }`}
              >
                {o.label}
              </button>
            ))}
          </span>
        </div>
      )}

      <div className="text-[10px] text-fg-faint">
        リサイクル（手動再装填）はイベントタブの「＋リサイクル」を時系列に挿入
      </div>

      {constRecBerry > 0 && (
        <div>
          <ConstBar value={constRecBerry} maxHp={defenderMaxHp} />
          <span className="font-mono text-xs text-success">
            {hpPercentText(constRecBerry, defenderMaxHp)}
          </span>
        </div>
      )}
    </div>
  )
}
