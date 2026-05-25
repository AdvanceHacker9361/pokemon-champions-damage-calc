interface AccumHistogramProps {
  distribution: Map<number, number>
  defenderMaxHp: number
  totalMin: number
  totalMax: number
}

/**
 * 累積ダメージ分布ヒストグラム + KO確率カーブ
 *
 * - 整数 bin で離散分布に対応（単一エントリの15値でも空 bin が出ない）
 * - √スケーリングで小確率 bin も視認可能に
 * - KO ゾーン背景を赤で着色し「耐え / KO」境界を即時判別
 * - 「P(damage ≥ X)」の累積KO確率カーブを線でオーバーレイ
 */
export function AccumHistogram({
  distribution,
  defenderMaxHp,
  totalMin,
  totalMax,
}: AccumHistogramProps) {
  const range = totalMax - totalMin
  if (range <= 0) return null

  const TARGET_BINS = 40
  const binSize = Math.max(1, Math.round(range / TARGET_BINS))
  const BIN_COUNT = Math.max(1, Math.ceil(range / binSize) + 1)

  const bins = Array.from({ length: BIN_COUNT }, (_, i) => ({
    lo: totalMin + i * binSize,
    hi: totalMin + (i + 1) * binSize,
    prob: 0,
  }))
  for (const [dmg, p] of distribution) {
    const idx = Math.min(BIN_COUNT - 1, Math.max(0, Math.floor((dmg - totalMin) / binSize)))
    bins[idx].prob += p
  }

  const maxBinProb = Math.max(...bins.map(b => b.prob), 0.00001)
  const hpInRange = defenderMaxHp >= totalMin && defenderMaxHp <= totalMax
  const hpThresholdPct = hpInRange ? ((defenderMaxHp - totalMin) / range) * 100 : -1

  const sortedEntries = Array.from(distribution.entries()).sort((a, b) => a[0] - b[0])
  const totalProb = sortedEntries.reduce((s, [, p]) => s + p, 0)

  let cumRight = totalProb
  const cumulative = bins.map(b => {
    const val = cumRight
    cumRight -= b.prob
    return val
  })

  let koProb = 0
  for (const [dmg, p] of distribution) {
    if (dmg >= defenderMaxHp) koProb += p
  }
  const survivalProb = 1 - koProb

  function binColor(b: { lo: number; hi: number }): string {
    if (b.lo >= defenderMaxHp) return 'var(--danger-1)'
    if (b.hi > defenderMaxHp) return 'var(--danger-3)'
    return 'var(--accent)'
  }

  const HEIGHT_PX = 80
  const heightScale = (p: number) => Math.sqrt(p / maxBinProb) * 100

  return (
    <div className="mt-1.5">
      {/* サマリ行 */}
      <div className="flex items-center justify-between text-[10px] text-fg-subtle mb-0.5">
        <span>
          ダメ分布
          <span className="text-fg-faint ml-1">
            {bins.filter(b => b.prob > 0).length}/{BIN_COUNT} bin・√スケール
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: 'var(--accent)' }} />
            <span className="text-accent">耐え {(survivalProb * 100).toFixed(1)}%</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: 'var(--danger-1)' }} />
            <span className="text-danger-1">KO {(koProb * 100).toFixed(1)}%</span>
          </span>
        </span>
      </div>

      {/* 描画エリア */}
      <div className="relative" style={{ height: `${HEIGHT_PX}px` }}>
        {/* KO ゾーン背景（HP閾値より右を赤く着色） */}
        {hpThresholdPct >= 0 && hpThresholdPct <= 100 && (
          <div
            className="absolute inset-y-0 pointer-events-none"
            style={{ left: `${hpThresholdPct}%`, right: 0, backgroundColor: 'var(--danger-1)', opacity: 0.08 }}
          />
        )}
        {/* 耐えゾーン背景 */}
        {hpThresholdPct > 0 && hpThresholdPct <= 100 && (
          <div
            className="absolute inset-y-0 left-0 pointer-events-none"
            style={{ width: `${hpThresholdPct}%`, backgroundColor: 'var(--accent)', opacity: 0.05 }}
          />
        )}

        {/* 棒グラフ */}
        <div className="flex items-end gap-px h-full relative" style={{ zIndex: 10 }}>
          {bins.map((b, i) => {
            const heightPct = heightScale(b.prob)
            return (
              <div
                key={i}
                className="flex-1 flex flex-col justify-end"
                title={`${Math.round(b.lo)}〜${Math.round(b.hi - 1)} : ${(b.prob * 100).toFixed(2)}%`}
              >
                <div
                  className="w-full rounded-t-sm transition-all"
                  style={{
                    height: `${heightPct}%`,
                    minHeight: b.prob > 0 ? '3px' : 0,
                    opacity: b.prob > 0 ? 0.85 : 0,
                    backgroundColor: binColor(b),
                  }}
                />
              </div>
            )
          })}
        </div>

        {/* 累積KO確率カーブ（P(damage ≥ X) — 右に進むほど単調減少） */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
          style={{ zIndex: 15 }}
        >
          <polyline
            points={cumulative
              .map((p, i) => {
                const x = (i / Math.max(1, BIN_COUNT - 1)) * 100
                const y = 100 - p * 100
                return `${x},${y}`
              })
              .join(' ')}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            className="text-fg opacity-70"
          />
        </svg>

        {/* HP閾値の縦線 */}
        {hpThresholdPct >= 0 && hpThresholdPct <= 100 && (
          <>
            <div
              className="absolute top-0 bottom-0 border-l-2 border-danger-1 pointer-events-none"
              style={{ left: `${hpThresholdPct}%`, zIndex: 20 }}
              title={`HP ${defenderMaxHp}`}
            />
            <span
              className="absolute top-0 text-[9px] font-mono font-bold text-danger-1 bg-surface-1 px-0.5 rounded pointer-events-none whitespace-nowrap"
              style={{ left: `${hpThresholdPct}%`, transform: 'translateX(-50%)', zIndex: 20 }}
            >
              HP{defenderMaxHp}
            </span>
          </>
        )}
      </div>

      {/* X軸ラベル */}
      <div className="relative text-[9px] text-fg-faint mt-0.5 font-mono" style={{ height: '12px' }}>
        <span className="absolute left-0">{totalMin}</span>
        <span className="absolute left-1/2 -translate-x-1/2 text-fg-subtle not-italic">
          <svg width="12" height="6" className="inline-block align-middle mr-0.5">
            <line x1="0" y1="3" x2="12" y2="3" stroke="currentColor" strokeWidth="2" className="text-fg-muted" />
          </svg>
          P(ダメ≧X) 曲線
        </span>
        <span className="absolute right-0">{totalMax}</span>
      </div>
    </div>
  )
}
