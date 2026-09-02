import {
  useProgressionStore,
  type BerryConfig,
  type BerrySide,
} from '@/presentation/store/progressionStore'

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

export interface BerrySectionProps {
  /** 編集対象の側（PassiveCatalog の対象トグルと連動） */
  side: BerrySide
  /** 対象側の最大HP（プリセットの回復量算出・プレビューに使用） */
  maxHp: number
}

/**
 * 回復タブ「きのみ」サブタブ（V3.18.0 フェーズC で移設、V3.18.1 で両側対応）。
 * 攻撃側・防御側それぞれ独立の `BerryConfig` を編集する。
 */
export function BerrySection({ side, maxHp }: BerrySectionProps) {
  const berry: BerryConfig = useProgressionStore(
    s => (side === 'attacker' ? s.attackerBerry : s.defenderBerry)
  )
  const setBerry = useProgressionStore(s => s.setBerry)
  const sideLabel = side === 'attacker' ? '攻撃側' : '防御側'

  const quarter = Math.floor(maxHp / 4)
  const third = Math.floor(maxHp / 3)

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="flex-shrink-0 text-xs text-fg-muted">オボン/混乱実</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="h-5 w-5 rounded bg-surface-3 text-xs text-fg-muted hover:bg-surface-2"
            onClick={() => setBerry(side, { amount: Math.max(0, berry.amount - 1) })}
            aria-label="きのみ回復量を減らす"
          >−</button>
          <input
            type="number"
            min={0}
            value={berry.amount}
            onChange={e => setBerry(side, { amount: readNonNegative(e.target.value) })}
            aria-label="きのみ回復量"
            className="input-base w-14 px-1 text-center text-xs"
          />
          <button
            type="button"
            className="h-5 w-5 rounded bg-surface-3 text-xs text-fg-muted hover:bg-surface-2"
            onClick={() => setBerry(side, { amount: berry.amount + 1 })}
            aria-label="きのみ回復量を増やす"
          >+</button>
        </div>
        <span className="text-xs text-fg-muted">HP≤</span>
        <input
          type="number"
          min={1}
          max={100}
          value={berry.thresholdPct}
          onChange={e => setBerry(side, { thresholdPct: readPercent(e.target.value) })}
          className="input-base w-10 px-1 text-center text-xs"
          aria-label="きのみ発動しきい値（%）"
          title={`発動しきい値（${sideLabel}HPの%）`}
        />
        <span className="text-xs text-fg-muted">%で1回限り</span>
      </div>

      <div className="text-[10px] text-fg-faint">
        ※{sideLabel}HPがしきい値以下へ減少した時点で1回限り自動発動・以後消費
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => setBerry(side, { amount: quarter, thresholdPct: 50 })}
          className="rounded border border-edge bg-surface-3 px-1.5 py-0.5 text-xs text-fg-muted transition-colors hover:border-success hover:text-success"
          title={`オボンのみ: HP≤50% で +${quarter} (1/4)`}
        >
          オボン<span className="ml-0.5 opacity-60">HP≤50% / +1/4</span>
        </button>
        <button
          type="button"
          onClick={() => setBerry(side, { amount: third, thresholdPct: 25 })}
          className="rounded border border-edge bg-surface-3 px-1.5 py-0.5 text-xs text-fg-muted transition-colors hover:border-success hover:text-success"
          title={`混乱実: HP≤25% で +${third} (1/3)`}
        >
          混乱実<span className="ml-0.5 opacity-60">HP≤25% / +1/3</span>
        </button>
        <button
          type="button"
          onClick={() => setBerry(side, { amount: third, thresholdPct: 50 })}
          className="rounded border border-edge bg-surface-3 px-1.5 py-0.5 text-xs text-fg-muted transition-colors hover:border-accent hover:text-accent"
          title={`くいしんぼう: 混乱実が HP≤50% で発動 (+${third})`}
        >
          +くいしんぼう<span className="ml-0.5 opacity-60">→HP≤50%</span>
        </button>
        <button
          type="button"
          onClick={() => setBerry(side, { amount: berry.amount + third })}
          className="rounded border border-edge bg-surface-3 px-1.5 py-0.5 text-xs text-fg-muted transition-colors hover:border-accent hover:text-accent"
          title={`ほおぶくろ: きのみ消費時に追加 +${third} (1/3)`}
        >
          +ほおぶくろ<span className="ml-0.5 opacity-60">+1/3</span>
        </button>
      </div>

      {berry.amount > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex cursor-pointer items-center gap-1" title="はんすう: 次のターン終了時にもう一度発動（計2回）">
            <input
              type="checkbox"
              checked={berry.cudChew}
              onChange={e => setBerry(side, { cudChew: e.target.checked })}
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
                onClick={() => setBerry(side, { harvestChance: o.v })}
                aria-pressed={berry.harvestChance === o.v}
                className={`rounded border px-1 py-0.5 text-[11px] transition-colors ${
                  berry.harvestChance === o.v
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
        リサイクル（手動再装填）はイベントタブの「＋リサイクル（{side === 'attacker' ? '攻' : '防'}）」を時系列に挿入
      </div>

      {berry.amount > 0 && (
        <div>
          <ConstBar value={berry.amount} maxHp={maxHp} />
          <span className="font-mono text-xs text-success">
            {hpPercentText(berry.amount, maxHp)}
          </span>
        </div>
      )}
    </div>
  )
}
