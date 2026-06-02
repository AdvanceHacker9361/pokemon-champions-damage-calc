/**
 * バトルシーケンス計算（攻撃側HP × 防御側HP の2D同時分布DP）
 *
 * 攻撃側が複数ターンにわたって技を撃つ間に、防御側からの反撃（被ダメ）や
 * 痛み分け（両者HPの平均化）を挟むシナリオを、(攻撃側HP, 防御側HP) の
 * 同時確率分布を時系列で変換することで正確にシミュレートする。
 *
 * 例: メガゲンガー vs カバルドン
 *   T1: ゲンガー鬼火（防御側に火傷）→ カバルドンの地震を耐える（被ダメ）
 *   T2: 痛み分け（両HP平均化）→ さらに地震を耐える（被ダメ）
 *   T3: 祟り目（威力130）でカバルドン撃破できるか？
 *
 * 痛み分けで両HPが結合するため、防御側だけの1D分布では表現できない。
 */

/** ダメージ分布: 一様ロール配列、または事前計算済み (ダメージ→確率) Map */
export type DmgDist = number[] | Map<number, number>

export type SeqEvent =
  /** 防御側へのダメージ（攻撃側の技） */
  | { kind: 'attack'; dmg: DmgDist }
  /** 攻撃側へのダメージ（防御側の反撃 = 被ダメ） */
  | { kind: 'incoming'; dmg: DmgDist }
  /** 痛み分け: 両者HPを floor((aHP + dHP) / 2) に均す */
  | { kind: 'painSplit' }
  /** 防御側への定数ダメージ（火傷・砂・毒など） */
  | { kind: 'defenderConst'; amount: number }
  /** 攻撃側への定数ダメージ */
  | { kind: 'attackerConst'; amount: number }
  /** 防御側の定数回復 */
  | { kind: 'defenderRecover'; amount: number }
  /** 攻撃側の定数回復（残飯など） */
  | { kind: 'attackerRecover'; amount: number }

export interface SeqStepResult {
  label: string
  /** このステップ完了時点の攻撃側HP周辺分布（両者生存マスのみ） */
  attackerHpDist: Map<number, number>
  /** このステップ完了時点の防御側HP周辺分布（両者生存マスのみ） */
  defenderHpDist: Map<number, number>
  /** 累積: 防御側を撃破した確率（攻撃側生存中のKO） */
  koProb: number
  /** 累積: 攻撃側が瀕死になった確率 */
  faintProb: number
  /** 両者生存マスの確率 */
  bothAliveProb: number
}

export interface BattleSequenceResult {
  steps: SeqStepResult[]
  /** 防御側撃破確率（シーケンス完了時点までの累積） */
  defenderKoProb: number
  /** 攻撃側生存確率（= 1 - 瀕死確率） */
  attackerSurviveProb: number
  /** 両者生存して終了する確率 */
  bothAliveProb: number
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/** DmgDist を (ダメージ, 確率) のイテレータに正規化 */
function* iterDist(dmg: DmgDist): Iterable<[number, number]> {
  if (dmg instanceof Map) {
    yield* dmg
  } else {
    const n = dmg.length
    if (n === 0) return
    const p = 1 / n
    for (const r of dmg) yield [r, p]
  }
}

export interface RunSequenceOptions {
  attackerStartHp?: number
  defenderStartHp?: number
  labels?: string[]
}

/**
 * バトルシーケンスを実行し、各ステップ後のHP分布と最終的な撃破/生存確率を返す。
 *
 * 状態は (攻撃側HP, 防御側HP) の同時分布を `Map<number, number>` で保持する。
 * key = aHP * stride + dHP（stride = defenderMaxHp + 1）。
 * 両者HP > 0 のマスのみ live として保持し、
 * 防御側が0以下 → koProb（吸収）、攻撃側が0以下 → faintProb（吸収）。
 */
export function runBattleSequence(
  events: SeqEvent[],
  attackerMaxHp: number,
  defenderMaxHp: number,
  opts: RunSequenceOptions = {},
): BattleSequenceResult {
  const stride = defenderMaxHp + 1
  const enc = (a: number, d: number) => a * stride + d

  const a0 = clamp(opts.attackerStartHp ?? attackerMaxHp, 0, attackerMaxHp)
  const d0 = clamp(opts.defenderStartHp ?? defenderMaxHp, 0, defenderMaxHp)

  let joint = new Map<number, number>([[enc(a0, d0), 1]])
  let koProb = 0
  let faintProb = 0
  const steps: SeqStepResult[] = []

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    const next = new Map<number, number>()
    const addLive = (a: number, d: number, p: number) => {
      const k = enc(a, d)
      next.set(k, (next.get(k) ?? 0) + p)
    }

    for (const [key, p] of joint) {
      const a = Math.floor(key / stride)
      const d = key % stride

      switch (ev.kind) {
        case 'attack': {
          for (const [r, rp] of iterDist(ev.dmg)) {
            const nd = d - r
            if (nd <= 0) koProb += p * rp
            else addLive(a, nd, p * rp)
          }
          break
        }
        case 'incoming': {
          for (const [r, rp] of iterDist(ev.dmg)) {
            const na = a - r
            if (na <= 0) faintProb += p * rp
            else addLive(na, d, p * rp)
          }
          break
        }
        case 'painSplit': {
          const v = Math.floor((a + d) / 2)
          const na = clamp(v, 0, attackerMaxHp)
          const nd = clamp(v, 0, defenderMaxHp)
          // a,d >= 1 なので v >= 1、瀕死にはならない
          addLive(na, nd, p)
          break
        }
        case 'defenderConst': {
          const nd = d - ev.amount
          if (nd <= 0) koProb += p
          else addLive(a, nd, p)
          break
        }
        case 'attackerConst': {
          const na = a - ev.amount
          if (na <= 0) faintProb += p
          else addLive(na, d, p)
          break
        }
        case 'defenderRecover': {
          addLive(a, clamp(d + ev.amount, 0, defenderMaxHp), p)
          break
        }
        case 'attackerRecover': {
          addLive(clamp(a + ev.amount, 0, attackerMaxHp), d, p)
          break
        }
      }
    }

    joint = next

    // ステップ後の周辺分布を記録
    const aDist = new Map<number, number>()
    const dDist = new Map<number, number>()
    let bothAlive = 0
    for (const [key, p] of joint) {
      const a = Math.floor(key / stride)
      const d = key % stride
      aDist.set(a, (aDist.get(a) ?? 0) + p)
      dDist.set(d, (dDist.get(d) ?? 0) + p)
      bothAlive += p
    }
    steps.push({
      label: opts.labels?.[i] ?? `ステップ ${i + 1}`,
      attackerHpDist: aDist,
      defenderHpDist: dDist,
      koProb: Math.min(1, koProb),
      faintProb: Math.min(1, faintProb),
      bothAliveProb: bothAlive,
    })
  }

  let bothAlive = 0
  for (const p of joint.values()) bothAlive += p

  return {
    steps,
    defenderKoProb: Math.min(1, koProb),
    attackerSurviveProb: Math.min(1, 1 - faintProb),
    bothAliveProb: bothAlive,
  }
}
