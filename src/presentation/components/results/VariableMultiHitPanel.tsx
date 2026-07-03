import {
  calcVariableMultiHitKo,
  calcVariableMultiHitKoWithCrit,
} from '@/domain/calculators/KoProbabilityCalc'

function multiHitKoColor(prob: number): string {
  if (prob >= 1.0) return 'text-danger-1'
  if (prob >= 0.75) return 'text-danger-2'
  if (prob >= 0.5) return 'text-danger-3'
  if (prob > 0) return 'text-danger-4'
  return 'text-neutral'
}

/** 変動連続技の確率計算パネル */
export function VariableMultiHitPanel({
  rolls, rawRolls, defenderHp, hitRate, dist, weakArmorRawRollsByHit,
  critRolls, rawCritRolls, weakArmorRawCritRollsByHit, critChance,
}: {
  rolls: number[]
  rawRolls: number[]
  defenderHp: number
  hitRate: number
  dist: { hits: number; prob: number }[]
  weakArmorRawRollsByHit?: number[][]
  critRolls: number[]
  rawCritRolls: number[]
  weakArmorRawCritRollsByHit?: number[][]
  critChance: number
}) {
  let effectiveRawRolls: number[] | number[][] | undefined
  if (weakArmorRawRollsByHit && weakArmorRawRollsByHit.length > 0) {
    effectiveRawRolls = [rawRolls, ...weakArmorRawRollsByHit]
  } else if (rawRolls !== rolls) {
    effectiveRawRolls = rawRolls
  }
  const res = calcVariableMultiHitKo(rolls, defenderHp, dist, effectiveRawRolls)
  const expectedWithAcc = res.expectedDmg * hitRate

  let effectiveRawCritRolls: number[] | number[][] | undefined
  if (weakArmorRawCritRollsByHit && weakArmorRawCritRollsByHit.length > 0) {
    effectiveRawCritRolls = [rawCritRolls, ...weakArmorRawCritRollsByHit]
  } else if (rawCritRolls !== critRolls) {
    effectiveRawCritRolls = rawCritRolls
  }
  const resCrit = calcVariableMultiHitKoWithCrit(
    rolls, critRolls, critChance, defenderHp, dist,
    effectiveRawRolls, effectiveRawCritRolls,
  )
  const expectedDmgCrit = resCrit.expectedDmg * hitRate
  const koCritWithAcc = resCrit.totalKoProb * hitRate

  const gridCols = dist.length === 1 ? 'grid-cols-1'
    : dist.length === 2 ? 'grid-cols-2'
    : 'grid-cols-4'

  function getRollsForHit(hitNum: number): number[] {
    if (hitNum === 1) return rolls
    if (weakArmorRawRollsByHit && weakArmorRawRollsByHit.length > 0) {
      if (hitNum === 2) return rawRolls
      const idx = Math.min(hitNum - 3, weakArmorRawRollsByHit.length - 1)
      return weakArmorRawRollsByHit[idx]
    }
    return rawRolls
  }
  function sumOverHits(numHits: number, picker: (rolls: number[]) => number): number {
    let total = 0
    for (let h = 1; h <= numHits; h++) total += picker(getRollsForHit(h))
    return total
  }

  return (
    <div className="space-y-1.5">
      <div className="text-xs text-fg-muted font-medium">
        連続技 KO確率
      </div>
      <div className={`grid ${gridCols} gap-x-2 text-xs font-mono`}>
        {res.perHit.map(({ hits, prob, koProbForHits }) => {
          const hitMin = sumOverHits(hits, r => r[0])
          const hitMax = sumOverHits(hits, r => r[r.length - 1])
          const hitMinPct = hitMin / defenderHp * 100
          const hitMaxPct = hitMax / defenderHp * 100
          const distPct = (prob * 100).toFixed(0)
          const koPct = koProbForHits >= 1 ? '確定' : koProbForHits <= 0 ? '不可' : `${(koProbForHits * 100).toFixed(1)}%`
          return (
            <div key={hits} className="bg-surface-2 rounded px-1.5 py-1">
              <div className="text-fg-subtle text-[10px]">{hits}回 ({distPct}%)</div>
              <div className="text-fg">{hitMin}〜{hitMax}</div>
              <div className="text-fg-subtle text-[10px]">
                {hitMinPct.toFixed(1)}〜{hitMaxPct.toFixed(1)}%
              </div>
              <div className={`font-bold text-[10px] mt-0.5 ${multiHitKoColor(koProbForHits)}`}>
                {koPct}
              </div>
            </div>
          )
        })}
      </div>
      <div className="bg-surface-2 rounded px-2 py-1.5 flex items-center justify-between">
        <div className="text-xs text-fg-muted">
          期待KO確率（加重平均）
          <span className="ml-2 text-fg-subtle text-[10px]">
            期待ダメ: {expectedWithAcc.toFixed(1)}
            {hitRate < 1 && <span className="ml-1 text-fg-faint">({Math.round(hitRate * 100)}%命中込)</span>}
          </span>
        </div>
        <span className={`text-sm font-bold ${multiHitKoColor(res.totalKoProb * hitRate)}`}>
          {res.totalKoProb * hitRate >= 1 ? '確定KO'
            : res.totalKoProb * hitRate <= 0 ? '倒せない'
            : `${(res.totalKoProb * hitRate * 100).toFixed(1)}%`}
        </span>
      </div>
      {critChance > 0 && critChance < 1 && (
        <div className="bg-surface-2 border border-edge rounded px-2 py-1.5 flex items-center justify-between">
          <div className="text-xs text-warning">
            期待KO確率（急所込み）
            <span className="ml-2 text-fg-subtle text-[10px]">
              急所率: {(critChance * 100).toFixed(1)}%
              <span className="ml-1">期待ダメ: {expectedDmgCrit.toFixed(1)}</span>
              {hitRate < 1 && <span className="ml-1 text-fg-faint">({Math.round(hitRate * 100)}%命中込)</span>}
            </span>
          </div>
          <span className={`text-sm font-bold ${multiHitKoColor(koCritWithAcc)}`}>
            {koCritWithAcc >= 1 ? '確定KO'
              : koCritWithAcc <= 0 ? '倒せない'
              : `${(koCritWithAcc * 100).toFixed(1)}%`}
          </span>
        </div>
      )}
    </div>
  )
}
