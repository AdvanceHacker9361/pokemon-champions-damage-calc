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
 *
 * defenderBerry オプション指定時は「オボン相当」の1回限り条件回復を再現する:
 *   防御側HPが threshold 以下になった時点で amount だけ回復し、以後発動しない。
 *   状態に berryConsumed ビット (0/1) を加えて追跡。
 */

/** ダメージ分布: 一様ロール配列、または事前計算済み (ダメージ→確率) Map */
export type DmgDist = number[] | Map<number, number>

export type SeqEvent =
  /** 防御側へのダメージ（攻撃側の技）。drain 指定時は与ダメに応じて攻撃側が回復 */
  | { kind: 'attack'; dmg: DmgDist; drain?: number }
  /** 攻撃側へのダメージ（防御側の反撃 = 被ダメ）。drain 指定時は防御側が回復 */
  | { kind: 'incoming'; dmg: DmgDist; drain?: number }
  /** 痛み分け: 両者HPを floor((aHP + dHP) / 2) に均す。
   *  attackerHp 指定時は防御側のみを floor((attackerHp + dHP) / 2) に変換し
   *  攻撃側HPは変えない（総合累積=攻撃側HP固定の特殊ケース用） */
  | { kind: 'painSplit'; attackerHp?: number }
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
  /** 防御側のオボン相当回復（1回限り、HP≤threshold で自動発動） */
  defenderBerry?: { threshold: number; amount: number }
}

/**
 * バトルシーケンスを実行し、各ステップ後のHP分布と最終的な撃破/生存確率を返す。
 *
 * 状態は (攻撃側HP, 防御側HP[, berryConsumed]) の同時分布を `Map<number, number>` で保持する。
 * defenderBerry なし: key = aHP * stride + dHP
 * defenderBerry あり: key = (aHP * stride + dHP) * 2 + berry（berry=0 未消費, 1 消費済み）
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
  const berry = opts.defenderBerry
  const hasBerry = berry != null && berry.amount > 0
  const stateMul = hasBerry ? 2 : 1
  const enc = (a: number, d: number, b: 0 | 1 = 0) =>
    (a * stride + d) * stateMul + (hasBerry ? b : 0)

  /** 防御側HP変化後にオボン発動チェック（HP≤threshold && 未消費 → +amount＋クランプ＆消費） */
  function applyBerry(d: number, b: 0 | 1): { d: number; b: 0 | 1 } {
    if (!hasBerry) return { d, b }
    if (b === 0 && d > 0 && d <= berry.threshold) {
      return {
        d: Math.min(defenderMaxHp, d + berry.amount),
        b: 1,
      }
    }
    return { d, b }
  }

  const a0 = clamp(opts.attackerStartHp ?? attackerMaxHp, 0, attackerMaxHp)
  const d0 = clamp(opts.defenderStartHp ?? defenderMaxHp, 0, defenderMaxHp)

  // 初期状態でも HP ≤ threshold ならオボンを即発動
  const init0 = applyBerry(d0, 0)
  let joint = new Map<number, number>([[enc(a0, init0.d, init0.b), 1]])
  let koProb = 0
  let faintProb = 0
  const steps: SeqStepResult[] = []

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    const next = new Map<number, number>()
    const addLive = (a: number, d: number, b: 0 | 1, p: number) => {
      const k = enc(a, d, b)
      next.set(k, (next.get(k) ?? 0) + p)
    }

    for (const [key, p] of joint) {
      const baseAD = hasBerry ? Math.floor(key / 2) : key
      const a = Math.floor(baseAD / stride)
      const d = baseAD % stride
      const b: 0 | 1 = hasBerry ? ((key & 1) as 0 | 1) : 0

      switch (ev.kind) {
        case 'attack': {
          for (const [r, rp] of iterDist(ev.dmg)) {
            const nd0 = d - r
            // 吸収: 実際に与えたダメージ（防御側残HPでクランプ）に応じて攻撃側が回復
            let na = a
            if (ev.drain && ev.drain > 0) {
              const actual = Math.min(r, d)
              if (actual > 0) {
                na = clamp(a + Math.max(1, Math.floor(actual * ev.drain)), 0, attackerMaxHp)
              }
            }
            if (nd0 <= 0) koProb += p * rp
            else {
              const ab = applyBerry(nd0, b)
              addLive(na, ab.d, ab.b, p * rp)
            }
          }
          break
        }
        case 'incoming': {
          for (const [r, rp] of iterDist(ev.dmg)) {
            const na = a - r
            // 吸収: 相手（防御側）が被ダメに応じて回復
            let nd = d
            if (ev.drain && ev.drain > 0) {
              const actual = Math.min(r, a)
              if (actual > 0) {
                nd = clamp(d + Math.max(1, Math.floor(actual * ev.drain)), 0, defenderMaxHp)
              }
            }
            if (na <= 0) faintProb += p * rp
            else addLive(na, nd, b, p * rp)
          }
          break
        }
        case 'painSplit': {
          if (ev.attackerHp !== undefined) {
            // 攻撃側HP固定（総合累積モード）: 防御側のみ均し、攻撃側HPは不変
            const nd0 = clamp(Math.floor((ev.attackerHp + d) / 2), 0, defenderMaxHp)
            const ab = applyBerry(nd0, b)
            addLive(a, ab.d, ab.b, p)
          } else {
            const v = Math.floor((a + d) / 2)
            const na = clamp(v, 0, attackerMaxHp)
            const nd0 = clamp(v, 0, defenderMaxHp)
            // a,d >= 1 なので v >= 1、瀕死にはならない
            const ab = applyBerry(nd0, b)
            addLive(na, ab.d, ab.b, p)
          }
          break
        }
        case 'defenderConst': {
          const nd0 = d - ev.amount
          if (nd0 <= 0) koProb += p
          else {
            const ab = applyBerry(nd0, b)
            addLive(a, ab.d, ab.b, p)
          }
          break
        }
        case 'attackerConst': {
          const na = a - ev.amount
          if (na <= 0) faintProb += p
          else addLive(na, d, b, p)
          break
        }
        case 'defenderRecover': {
          addLive(a, clamp(d + ev.amount, 0, defenderMaxHp), b, p)
          break
        }
        case 'attackerRecover': {
          addLive(clamp(a + ev.amount, 0, attackerMaxHp), d, b, p)
          break
        }
      }
    }

    joint = next

    // ステップ後の周辺分布を記録（berry ビットは集約）
    const aDist = new Map<number, number>()
    const dDist = new Map<number, number>()
    let bothAlive = 0
    for (const [key, p] of joint) {
      const baseAD = hasBerry ? Math.floor(key / 2) : key
      const a = Math.floor(baseAD / stride)
      const d = baseAD % stride
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

/**
 * バトルシーケンス結果から、防御側への累積ダメージ分布を導出する。
 * （総合累積のヒストグラム・撃破率に使用）
 *
 * - 生存マス: ダメージ = defenderMaxHp - 残HP
 * - 撃破マス (koProb): しきい値 defenderMaxHp に集約（オーバーキルの裾は畳む = 簡潔優先）
 *
 * 攻撃側生存マス（faint なし前提＝総合累積）の防御側周辺分布を使う。
 * @returns ダメージ値 -> 確率 の Map（総和は live + ko = 1、faint=0 の前提）
 */
export function extractDefenderDamageDistribution(
  result: BattleSequenceResult,
  defenderMaxHp: number,
): Map<number, number> {
  const out = new Map<number, number>()
  const last = result.steps[result.steps.length - 1]
  if (last) {
    for (const [hp, p] of last.defenderHpDist) {
      const dmg = defenderMaxHp - hp
      out.set(dmg, (out.get(dmg) ?? 0) + p)
    }
  }
  if (result.defenderKoProb > 0) {
    out.set(defenderMaxHp, (out.get(defenderMaxHp) ?? 0) + result.defenderKoProb)
  }
  return out
}
