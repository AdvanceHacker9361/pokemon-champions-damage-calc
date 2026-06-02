import { useMemo } from 'react'
import { useDefenderStore } from '@/presentation/store/pokemonStore'
import { useProgressionStore } from '@/presentation/store/progressionStore'
import { findOptimalAccumDurability } from '@/application/usecases/FindOptimalAccumDurability'

/**
 * 総合累積用の耐久調整パネル。
 * HP SP のみを振って「耐えるか」を探索する。
 * 技の最大/最小ダメは加算リストにキャッシュされた値（現在の防御側設定由来）を使う。
 * → B/D の再探索はしない（攻撃側コンテキストが各エントリに紐付かないため）。
 */
export function AccumDurabilityPanel() {
  const defenderBase = useDefenderStore(s => s.baseStats)
  const defenderSp   = useDefenderStore(s => s.sp)

  const events      = useProgressionStore(s => s.events)
  const constDmg    = useProgressionStore(s => s.constDmg)
  const constRec    = useProgressionStore(s => s.constRec)
  const poisonTurns = useProgressionStore(s => s.poisonTurns)

  const result = useMemo(() => {
    const attacks = events.filter((e): e is Extract<typeof e, { kind: 'attack' }> => e.kind === 'attack')
    const movesMaxTotal = attacks.reduce((s, e) => s + e.maxDmg * e.usages, 0)
    const movesMinTotal = attacks.reduce((s, e) => s + e.minDmg * e.usages, 0)
    return findOptimalAccumDurability({
      defenderBaseHp: defenderBase.hp,
      defenderCurrentSp: defenderSp,
      movesMaxTotal,
      movesMinTotal,
      constDmg,
      constRec,
      poisonTurns,
    })
  }, [defenderBase.hp, defenderSp, events, constDmg, constRec, poisonTurns])

  const {
    budget, currentSpH, currentHp, currentMaxDmg,
    currentSurvives, minSurvivingSpH, points,
  } = result

  const highlightSpHs = new Set<number>()
  highlightSpHs.add(0)
  highlightSpHs.add(currentSpH)
  if (minSurvivingSpH != null) {
    highlightSpHs.add(minSurvivingSpH)
    if (minSurvivingSpH > 0) highlightSpHs.add(minSurvivingSpH - 1)
  }
  for (let s = 0; s <= Math.min(32, budget); s += 4) highlightSpHs.add(s)
  highlightSpHs.add(Math.min(32, budget))

  const displayPoints = points.filter(p => highlightSpHs.has(p.spH))

  return (
    <div className="space-y-2 mt-2 pt-2 border-t border-edge">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-fg-muted">
          耐久調整（総合累積 / HPのみ）
        </span>
        <span className="text-[10px] text-fg-subtle">
          予算 <span className="font-mono text-fg-muted">{budget}</span> SP
        </span>
      </div>

      {/* 現状サマリ */}
      <div className="flex items-center justify-between text-[10px] text-fg-subtle">
        <span>
          現在 H
          <span className="font-mono text-fg-muted ml-0.5">{currentSpH}</span>
          {'　'}HP
          <span className="font-mono text-fg-muted ml-0.5">{currentHp}</span>
          {'　'}最大被ダメ
          <span className="font-mono text-fg-muted ml-0.5">{currentMaxDmg}</span>
        </span>
        <span className={`font-semibold ${currentSurvives ? 'text-success' : 'text-danger-2'}`}>
          {currentSurvives ? '✓ 確定耐え' : '✗ 耐えられない'}
        </span>
      </div>

      {/* 最小必要 SP の告知 */}
      {minSurvivingSpH == null ? (
        <div className="text-[11px] text-danger-2 py-1">
          H 最大振り（H32）でも確定耐え不可。B/D や持ち物・特性で対応が必要です。
        </div>
      ) : (
        <div className="text-[11px] text-success py-1">
          必要最小 HP 投資:
          <span className="font-mono font-bold ml-1">H{minSurvivingSpH}</span>
          <span className="text-fg-subtle ml-1">
            （残HP +{points[minSurvivingSpH].remainHpWorst}）
          </span>
        </div>
      )}

      {/* 結果テーブル */}
      {displayPoints.length > 0 && (
        <div className="overflow-x-auto">
          <table className="text-xs font-mono w-full">
            <thead>
              <tr className="text-[10px] text-fg-subtle border-b border-edge">
                <th className="text-right pr-2 py-0.5 font-normal">H SP</th>
                <th className="text-right pr-2 font-normal">HP実数</th>
                {poisonTurns > 0 && <th className="text-right pr-2 font-normal">毒累計</th>}
                <th className="text-right pr-2 font-normal">最大被ダメ</th>
                <th className="text-right pr-2 font-normal">残HP</th>
                <th className="text-center font-normal">判定</th>
              </tr>
            </thead>
            <tbody>
              {displayPoints.map(p => {
                const isMin = p.spH === minSurvivingSpH
                const isCurrent = p.spH === currentSpH
                return (
                  <tr
                    key={p.spH}
                    className={`border-b border-edge last:border-0 ${
                      isMin
                        ? 'bg-emerald-50 dark:bg-emerald-950/40'
                        : isCurrent
                        ? 'bg-surface-2'
                        : 'hover:bg-surface-2'
                    }`}
                  >
                    <td className={`text-right pr-2 py-0.5 ${isMin ? 'font-bold text-success' : isCurrent ? 'text-fg-muted' : 'text-fg-muted'}`}>
                      {p.spH}{isCurrent && !isMin ? '*' : ''}
                    </td>
                    <td className="text-right pr-2 text-fg">{p.hp}</td>
                    {poisonTurns > 0 && (
                      <td className="text-right pr-2 text-fg-muted">{p.poisonTotal}</td>
                    )}
                    <td className="text-right pr-2 text-fg-subtle">{p.maxEffectiveDmg}</td>
                    <td className={`text-right pr-2 ${p.remainHpWorst > 0 ? 'text-success' : 'text-fg-subtle'}`}>
                      {p.remainHpWorst > 0 ? `+${p.remainHpWorst}` : p.remainHpWorst}
                    </td>
                    <td className={`text-center ${p.survivesMax ? 'text-success' : 'text-danger-2'}`}>
                      {p.survivesMax ? '✓' : '✗'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="text-[10px] text-fg-faint mt-1">
            * = 現在の設定{'　｜　'}B/D の最適化は個別技の耐久調整を使用してください
          </div>
        </div>
      )}
    </div>
  )
}
