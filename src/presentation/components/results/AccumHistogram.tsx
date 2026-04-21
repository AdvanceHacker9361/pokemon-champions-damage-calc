interface AccumHistogramProps {
  distribution: Map<number, number>
  defenderMaxHp: number
  totalMin: number
  totalMax: number
}

/**
 * 累積ダメージ分布ヒストグラム
 *
 * 乱数ロールは整数なので bin サイズも整数化する（range / targetBins を丸める）。
 * これにより単一エントリ（15値の離散分布）でも bin が空にならずに描画される。
 */
export function AccumHistogram({
  distribution,
  defenderMaxHp,
  totalMin,
  totalMax,
}: AccumHistogramProps) {
  const range = totalMax - totalMin
  if (range <= 0) return null

  // 整数 bin サイズで描画（離散分布でも空 bin を避ける）
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

  // 累積確率の集計（KO確率・耐え確率）
  let koProb = 0
  for (const [dmg, p] of distribution) {
    if (dmg >= defenderMaxHp) koProb += p
  }
  const survivalProb = 1 - koProb

  function binColor(b: { lo: number; hi: number }): string {
    if (b.lo >= defenderMaxHp) return 'bg-red-500 dark:bg-red-400'
    if (b.hi > defenderMaxHp) return 'bg-orange-400 dark:bg-orange-400'
    return 'bg-slate-400 dark:bg-slate-500'
  }

  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-500 mb-0.5">
        <span>ダメ分布（{bins.filter(b => b.prob > 0).length}/{BIN_COUNT} bin）</span>
        <span>
          <span className="text-slate-500 dark:text-slate-500 mr-1.5">耐え {(survivalProb * 100).toFixed(1)}%</span>
          <span className="text-red-500 dark:text-red-400">KO {(koProb * 100).toFixed(1)}%</span>
        </span>
      </div>
      <div className="relative" style={{ height: '48px' }}>
        {/* HP閾値の縦線 */}
        {hpThresholdPct >= 0 && hpThresholdPct <= 100 && (
          <div
            className="absolute top-0 bottom-0 border-l border-dashed border-red-500 dark:border-red-400 z-10 pointer-events-none"
            style={{ left: `${hpThresholdPct}%` }}
            title={`HP ${defenderMaxHp}`}
          />
        )}
        {/* 棒グラフ */}
        <div className="flex items-end gap-px h-full">
          {bins.map((b, i) => {
            const heightPct = (b.prob / maxBinProb) * 100
            return (
              <div
                key={i}
                className="flex-1 flex flex-col justify-end"
                title={`${Math.round(b.lo)}〜${Math.round(b.hi - 1)} : ${(b.prob * 100).toFixed(2)}%`}
              >
                <div
                  className={`w-full rounded-t-sm ${binColor(b)}`}
                  style={{ height: `${heightPct}%`, minHeight: b.prob > 0 ? '2px' : 0 }}
                />
              </div>
            )
          })}
        </div>
      </div>
      {/* X軸ラベル */}
      <div className="relative text-[9px] text-slate-400 dark:text-slate-600 mt-0.5 font-mono" style={{ height: '12px' }}>
        <span className="absolute left-0">{totalMin}</span>
        {hpInRange && (
          <span
            className="absolute text-red-500 dark:text-red-400"
            style={{ left: `${hpThresholdPct}%`, transform: 'translateX(-50%)' }}
          >
            HP{defenderMaxHp}
          </span>
        )}
        <span className="absolute right-0">{totalMax}</span>
      </div>
    </div>
  )
}
