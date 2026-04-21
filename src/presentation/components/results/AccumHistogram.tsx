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
 * - 「P(damage ≥ X)」の累積KO確率カーブを白線でオーバーレイ
 */
export function AccumHistogram({
  distribution,
  defenderMaxHp,
  totalMin,
  totalMax,
}: AccumHistogramProps) {
  const range = totalMax - totalMin
  if (range <= 0) return null

  // 整数 bin サイズ（離散分布でも空 bin を避ける）
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

  // 累積KO確率（各 bin 右端での P(damage ≥ HP) ではなく P(damage ≥ bin.lo)）
  const sortedEntries = Array.from(distribution.entries()).sort((a, b) => a[0] - b[0])
  const totalProb = sortedEntries.reduce((s, [, p]) => s + p, 0)

  // bin ごとに「その bin の右端以上となる確率」を計算（= KO 曲線の右肩下がりの値）
  // P(damage >= bin.hi) を前方集計
  let cumRight = totalProb
  const cumulative = bins.map(b => {
    // この bin より大きい値の確率
    const val = cumRight
    // 次の bin に進む前に、この bin 内の確率を引く
    cumRight -= b.prob
    return val
  })

  // 累積確率の集計（耐え確率・KO確率）
  let koProb = 0
  for (const [dmg, p] of distribution) {
    if (dmg >= defenderMaxHp) koProb += p
  }
  const survivalProb = 1 - koProb

  function binColor(b: { lo: number; hi: number }): string {
    if (b.lo >= defenderMaxHp) return 'bg-red-500 dark:bg-red-400'
    if (b.hi > defenderMaxHp) return 'bg-orange-400 dark:bg-orange-400'
    return 'bg-sky-400 dark:bg-sky-500'
  }

  const HEIGHT_PX = 80
  // √スケーリング: 小確率 bin も視認可能に（線形だとダイナミックレンジが大きすぎる）
  const heightScale = (p: number) => Math.sqrt(p / maxBinProb) * 100

  return (
    <div className="mt-1.5">
      {/* サマリ行 */}
      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-500 mb-0.5">
        <span>
          ダメ分布
          <span className="text-slate-400 dark:text-slate-600 ml-1">
            {bins.filter(b => b.prob > 0).length}/{BIN_COUNT} bin・√スケール
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-sky-400 dark:bg-sky-500 inline-block" />
            <span className="text-sky-600 dark:text-sky-400">耐え {(survivalProb * 100).toFixed(1)}%</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-red-500 dark:bg-red-400 inline-block" />
            <span className="text-red-500 dark:text-red-400">KO {(koProb * 100).toFixed(1)}%</span>
          </span>
        </span>
      </div>

      {/* 描画エリア */}
      <div className="relative" style={{ height: `${HEIGHT_PX}px` }}>
        {/* KO ゾーン背景（HP閾値より右を赤く着色） */}
        {hpThresholdPct >= 0 && hpThresholdPct <= 100 && (
          <div
            className="absolute inset-y-0 bg-red-500/10 dark:bg-red-500/15 pointer-events-none"
            style={{ left: `${hpThresholdPct}%`, right: 0 }}
          />
        )}
        {/* 耐えゾーン背景 */}
        {hpThresholdPct > 0 && hpThresholdPct <= 100 && (
          <div
            className="absolute inset-y-0 left-0 bg-sky-500/5 dark:bg-sky-500/10 pointer-events-none"
            style={{ width: `${hpThresholdPct}%` }}
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
                  className={`w-full rounded-t-sm ${binColor(b)} transition-all`}
                  style={{
                    height: `${heightPct}%`,
                    minHeight: b.prob > 0 ? '3px' : 0,
                    opacity: b.prob > 0 ? 0.9 : 0,
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
            className="text-slate-800 dark:text-slate-100 opacity-90"
          />
        </svg>

        {/* HP閾値の縦線（実線・太め） — 棒グラフの上に重ねる */}
        {hpThresholdPct >= 0 && hpThresholdPct <= 100 && (
          <>
            <div
              className="absolute top-0 bottom-0 border-l-2 border-red-500 dark:border-red-400 pointer-events-none"
              style={{ left: `${hpThresholdPct}%`, zIndex: 20 }}
              title={`HP ${defenderMaxHp}`}
            />
            <span
              className="absolute top-0 text-[9px] font-mono font-bold text-red-500 dark:text-red-400 bg-white/90 dark:bg-slate-900/90 px-0.5 rounded pointer-events-none whitespace-nowrap"
              style={{ left: `${hpThresholdPct}%`, transform: 'translateX(-50%)', zIndex: 20 }}
            >
              HP{defenderMaxHp}
            </span>
          </>
        )}
      </div>

      {/* X軸ラベル */}
      <div className="relative text-[9px] text-slate-400 dark:text-slate-600 mt-0.5 font-mono" style={{ height: '12px' }}>
        <span className="absolute left-0">{totalMin}</span>
        <span className="absolute left-1/2 -translate-x-1/2 text-slate-500 dark:text-slate-500 not-italic">
          <svg width="12" height="6" className="inline-block align-middle mr-0.5">
            <line x1="0" y1="3" x2="12" y2="3" stroke="currentColor" strokeWidth="2" className="text-slate-700 dark:text-slate-300" />
          </svg>
          P(ダメ≧X) 曲線
        </span>
        <span className="absolute right-0">{totalMax}</span>
      </div>
    </div>
  )
}
