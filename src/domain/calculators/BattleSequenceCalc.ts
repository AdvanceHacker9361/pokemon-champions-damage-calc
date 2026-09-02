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
 * defenderBerry / attackerBerry オプション指定時は「オボン相当」の1回限り条件回復を再現する:
 *   その側のHPが threshold 以下へ **減少した** 時点で amount だけ回復し、以後発動しない。
 *   両側それぞれ独立のきのみ状態（消費フラグ + はんすう cud カウント）を状態キーへ packing する。
 */

import { calcDrainHeal } from '@/domain/calculators/DrainCalc'

/** ダメージ分布: 一様ロール配列、または事前計算済み (ダメージ→確率) Map */
export type DmgDist = number[] | Map<number, number>

export type SeqEvent =
  /**
   * 防御側へのダメージ（攻撃側の技）。drain/recoil 指定時は実ダメに応じて攻撃側HPを増減。
   * noTurnBoundary=true のとき、このイベントの後にターン境界処理（はんすう cud カウントダウン・
   * しゅうかく再装填）を実行しない。1ターン内の複数ヒット（おやこあいの親子分割など）で
   * 中間ヒットに付与し、最終ヒットのみがターンを終了させるために使う。
   * drainBoosted=true のとき、吸収回復量におおきなねっこ相当のブースト（×5324/4096）を適用する。
   */
  | { kind: 'attack'; dmg: DmgDist; drain?: number; recoil?: number; drainBoosted?: boolean; noTurnBoundary?: boolean }
  /** 攻撃側へのダメージ（防御側の反撃 = 被ダメ）。drain/recoil 指定時は実ダメに応じて防御側HPを増減 */
  | { kind: 'incoming'; dmg: DmgDist; drain?: number; recoil?: number; drainBoosted?: boolean }
  /** ダメージを伴わない補助技・積み技ターン。HPは変えず、ターン経過だけを記録する */
  | { kind: 'setupTurn'; side: 'attacker' | 'defender' }
  /** メガシンカのタイミング。HPは変えず、表示ステップだけを記録する */
  | { kind: 'megaEvolve'; side: 'attacker' | 'defender' }
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
  /**
   * きのみを再装填（リサイクル等）。消費済みのきのみを再び発動可能にする。
   * side 省略時は防御側（旧データとの後方互換）。
   */
  | { kind: 'rearmBerry'; side?: 'attacker' | 'defender' }
  /**
   * 宿り木のタネの1ティック（毎ターン適用）。
   * direction='fromAttacker': 攻撃側が植えた → 防御側 -amount、攻撃側 +amount
   * direction='fromDefender': 防御側が植えた → 攻撃側 -amount、防御側 +amount
   * amount は植えた側ではなく **被ダメ側の最大HP/8** をホック側で算出して渡す
   */
  | { kind: 'leechSeed'; direction: 'fromAttacker' | 'fromDefender'; amount: number }

export interface SeqStepResult {
  label: string
  /** このステップ完了時点の攻撃側HP周辺分布（両者生存マスのみ） */
  attackerHpDist: Map<number, number>
  /** このステップ完了時点の防御側HP周辺分布（両者生存マスのみ） */
  defenderHpDist: Map<number, number>
  /** 累積: 防御側撃破確率（両者瀕死＝反動同時死を含む表示用の値） */
  koProb: number
  /** 累積: 攻撃側瀕死確率（両者瀕死＝反動同時死を含む表示用の値） */
  faintProb: number
  /** 両者生存マスの確率 */
  bothAliveProb: number
}

export interface BattleSequenceResult {
  steps: SeqStepResult[]
  /** 防御側撃破確率（シーケンス完了時点までの累積、両者瀕死を含む） */
  defenderKoProb: number
  /** 攻撃側瀕死確率（シーケンス完了時点までの累積、両者瀕死を含む） */
  attackerFaintProb: number
  /**
   * 両者が同時に瀕死になる確率（Gen9: 反動ダメは相手を倒しても適用されるため実在するケース）。
   * defenderKoProb / attackerFaintProb の両方に含まれている。
   */
  bothFaintProb: number
  /** 攻撃側生存確率（= 1 - 攻撃側瀕死確率、両者瀕死は非生存として扱う） */
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

/** 片側のきのみ設定（オボン/混乱実 相当の1回限り条件回復） */
export interface BerryOption {
  /** 発動しきい値（この値以下へ **減少した** 時点で発動） */
  threshold: number
  /** 回復量（0 以下ならきのみなし扱い） */
  amount: number
  /** はんすう: 発動後、次のターン終了時にもう一度発動 */
  cudChew?: boolean
  /** しゅうかく/ものひろい: 各ターン終了時にこの確率で再装填（0〜1） */
  harvestChance?: number
}

export interface RunSequenceOptions {
  attackerStartHp?: number
  defenderStartHp?: number
  labels?: string[]
  /**
   * 防御側のきのみ回復（HP≤threshold へ減少した時点で1回限り自動発動・以後消費）。
   * これらの再発動は `rearmBerry` イベントでも手動再装填できる（リサイクル）。
   */
  defenderBerry?: BerryOption
  /**
   * 攻撃側のきのみ回復。防御側と同仕様で、状態は防御側と独立に保持する。
   * 発動契機は攻撃側HPが減少するイベント（被ダメ・反動・攻撃側定数・宿り木(防→攻)・痛み分け）。
   */
  attackerBerry?: BerryOption
}

/**
 * 片側のきのみ状態機械。状態は consumed(0/1) と cud(0/1/2, はんすう用カウントダウン) の packing。
 * unit = きのみなし:1 / はんすうなし:2 / はんすうあり:6
 */
interface BerryRuntime {
  active: boolean
  threshold: number
  amount: number
  cudEnabled: boolean
  harvestChance: number
  unit: number
  pack: (consumed: number, cud: number) => number
  consumedOf: (state: number) => number
  cudOf: (state: number) => number
}

function makeBerryRuntime(opt: BerryOption | undefined): BerryRuntime {
  if (opt == null || opt.amount <= 0) {
    return {
      active: false, threshold: 0, amount: 0, cudEnabled: false, harvestChance: 0, unit: 1,
      pack: () => 0, consumedOf: () => 0, cudOf: () => 0,
    }
  }
  const cudEnabled = opt.cudChew === true
  return {
    active: true,
    threshold: opt.threshold,
    amount: opt.amount,
    cudEnabled,
    harvestChance: Math.max(0, Math.min(1, opt.harvestChance ?? 0)),
    unit: cudEnabled ? 6 : 2,
    pack: (consumed, cud) => (cudEnabled ? consumed * 3 + cud : consumed),
    consumedOf: state => (cudEnabled ? Math.floor(state / 3) : state),
    cudOf: state => (cudEnabled ? state % 3 : 0),
  }
}

/** ターン境界のしゅうかく分岐（消費済みなら harvestChance で再装填） */
function harvestBranches(
  berry: BerryRuntime, consumed: number, cud: number,
): { state: number; prob: number }[] {
  if (berry.harvestChance > 0 && consumed === 1) {
    const branches = [{ state: berry.pack(0, cud), prob: berry.harvestChance }]
    if (berry.harvestChance < 1) {
      branches.push({ state: berry.pack(1, cud), prob: 1 - berry.harvestChance })
    }
    return branches
  }
  return [{ state: berry.pack(consumed, cud), prob: 1 }]
}

/**
 * バトルシーケンスを実行し、各ステップ後のHP分布と最終的な撃破/生存確率を返す。
 *
 * 状態は (攻撃側HP, 防御側HP[, 防御側きのみ状態][, 攻撃側きのみ状態]) の同時分布を
 * `Map<number, number>` で保持する。
 *   key = ((aHP * stride + dHP) * dUnit + dState) * aUnit + aState
 *   dUnit / aUnit = きのみなし:1 / はんすうなし:2 / はんすうあり:6
 * きのみを使わない構成では両 unit = 1 となり key = aHP * stride + dHP に退化する。
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
  const dBerry = makeBerryRuntime(opts.defenderBerry)
  const aBerry = makeBerryRuntime(opts.attackerBerry)
  const dUnit = dBerry.unit
  const aUnit = aBerry.unit

  const enc = (a: number, d: number, dState = 0, aState = 0): number =>
    ((a * stride + d) * dUnit + dState) * aUnit + aState

  const dec = (key: number): { a: number; d: number; dState: number; aState: number } => {
    const aState = aUnit === 1 ? 0 : key % aUnit
    const rest = aUnit === 1 ? key : Math.floor(key / aUnit)
    const dState = dUnit === 1 ? 0 : rest % dUnit
    const baseAD = dUnit === 1 ? rest : Math.floor(rest / dUnit)
    return { a: Math.floor(baseAD / stride), d: baseAD % stride, dState, aState }
  }

  /** 防御側HP減少後のきのみ発動チェック（HP≤threshold && 未消費 → +amount＋消費＋はんすう予約） */
  function triggerD(d: number, state: number): { d: number; state: number } {
    if (dBerry.active && dBerry.consumedOf(state) === 0 && d > 0 && d <= dBerry.threshold) {
      return {
        d: Math.min(defenderMaxHp, d + dBerry.amount),
        state: dBerry.pack(1, dBerry.cudEnabled ? 2 : 0),
      }
    }
    return { d, state }
  }

  /** 攻撃側HP減少後のきのみ発動チェック（防御側と同仕様） */
  function triggerA(a: number, state: number): { a: number; state: number } {
    if (aBerry.active && aBerry.consumedOf(state) === 0 && a > 0 && a <= aBerry.threshold) {
      return {
        a: Math.min(attackerMaxHp, a + aBerry.amount),
        state: aBerry.pack(1, aBerry.cudEnabled ? 2 : 0),
      }
    }
    return { a, state }
  }

  /** 攻撃側HPが減少したときだけきのみ判定を通す（回復では発動しない） */
  function afterAttackerHpChange(prev: number, next: number, state: number) {
    return next < prev ? triggerA(next, state) : { a: next, state }
  }

  const a0 = clamp(opts.attackerStartHp ?? attackerMaxHp, 0, attackerMaxHp)
  const d0 = clamp(opts.defenderStartHp ?? defenderMaxHp, 0, defenderMaxHp)

  // 初期状態でも HP ≤ threshold ならきのみを即発動
  const initD = triggerD(d0, 0)
  const initA = triggerA(a0, 0)
  let joint = new Map<number, number>([[enc(initA.a, initD.d, initD.state, initA.state), 1]])
  // 3つの互いに排反な終端バケツ:
  //   koProb    = 防御側のみ瀕死（攻撃側生存）
  //   faintProb = 攻撃側のみ瀕死（防御側生存）
  //   bothFaint = 両者同時瀕死（反動で相手を倒しつつ自分も倒れる Gen9 ケース）
  let koProb = 0
  let faintProb = 0
  let bothFaint = 0
  const steps: SeqStepResult[] = []

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    const next = new Map<number, number>()
    const addLive = (a: number, d: number, dState: number, aState: number, p: number) => {
      const k = enc(a, d, dState, aState)
      next.set(k, (next.get(k) ?? 0) + p)
    }

    for (const [key, p] of joint) {
      const { a, d, dState, aState } = dec(key)

      switch (ev.kind) {
        case 'attack': {
          for (const [r, rp] of iterDist(ev.dmg)) {
            const nd0 = d - r
            // 吸収: 実際に与えたダメージ（防御側残HPでクランプ）に応じて攻撃側が回復
            let na = a
            const actual = Math.min(r, d)
            if (ev.drain && ev.drain > 0) {
              if (actual > 0) {
                na = clamp(a + calcDrainHeal(actual, ev.drain, ev.drainBoosted), 0, attackerMaxHp)
              }
            }
            if (ev.recoil && ev.recoil > 0 && actual > 0) {
              na -= Math.max(1, Math.round(actual * ev.recoil))
            }
            if (nd0 <= 0) {
              // 防御側撃破。反動で攻撃側も同時に瀕死しうる（Gen9: 反動は相手を倒しても適用）
              if (na <= 0) bothFaint += p * rp
              else koProb += p * rp
            } else {
              if (na <= 0) {
                faintProb += p * rp
                continue
              }
              const t = triggerD(nd0, dState)
              const ta = afterAttackerHpChange(a, na, aState)
              addLive(ta.a, t.d, t.state, ta.state, p * rp)
            }
          }
          break
        }
        case 'incoming': {
          for (const [r, rp] of iterDist(ev.dmg)) {
            const na = a - r
            // 吸収: 相手（防御側）が被ダメに応じて回復（HP上昇なのできのみは発動しない）
            let nd = d
            const actual = Math.min(r, a)
            if (ev.drain && ev.drain > 0) {
              if (actual > 0) {
                nd = clamp(d + calcDrainHeal(actual, ev.drain, ev.drainBoosted), 0, defenderMaxHp)
              }
            }
            if (ev.recoil && ev.recoil > 0 && actual > 0) {
              nd -= Math.max(1, Math.round(actual * ev.recoil))
            }
            if (na <= 0) {
              // 攻撃側瀕死。防御側が自分の反動で同時に瀕死しうる
              if (nd <= 0) bothFaint += p * rp
              else faintProb += p * rp
            } else if (nd <= 0) koProb += p * rp
            else {
              const ta = afterAttackerHpChange(a, na, aState)
              addLive(ta.a, nd, dState, ta.state, p * rp)
            }
          }
          break
        }
        case 'setupTurn': {
          addLive(a, d, dState, aState, p)
          break
        }
        case 'megaEvolve': {
          addLive(a, d, dState, aState, p)
          break
        }
        case 'painSplit': {
          if (ev.attackerHp !== undefined) {
            // 攻撃側HP固定（総合累積モード）: 防御側のみ均し、攻撃側HPは不変
            const nd0 = clamp(Math.floor((ev.attackerHp + d) / 2), 0, defenderMaxHp)
            const t = triggerD(nd0, dState)
            addLive(a, t.d, t.state, aState, p)
          } else {
            const v = Math.floor((a + d) / 2)
            const na = clamp(v, 0, attackerMaxHp)
            const nd0 = clamp(v, 0, defenderMaxHp)
            const t = triggerD(nd0, dState)
            const ta = afterAttackerHpChange(a, na, aState)
            addLive(ta.a, t.d, t.state, ta.state, p)
          }
          break
        }
        case 'defenderConst': {
          const nd0 = d - ev.amount
          if (nd0 <= 0) koProb += p
          else {
            const t = triggerD(nd0, dState)
            addLive(a, t.d, t.state, aState, p)
          }
          break
        }
        case 'attackerConst': {
          const na = a - ev.amount
          if (na <= 0) faintProb += p
          else {
            const ta = afterAttackerHpChange(a, na, aState)
            addLive(ta.a, d, dState, ta.state, p)
          }
          break
        }
        case 'defenderRecover': {
          addLive(a, clamp(d + ev.amount, 0, defenderMaxHp), dState, aState, p)
          break
        }
        case 'attackerRecover': {
          addLive(clamp(a + ev.amount, 0, attackerMaxHp), d, dState, aState, p)
          break
        }
        case 'rearmBerry': {
          // リサイクル等: 消費済みのきのみを未消費に戻す（はんすう予約カウントは維持）
          if ((ev.side ?? 'defender') === 'attacker') {
            addLive(a, d, dState, aBerry.pack(0, aBerry.cudOf(aState)), p)
          } else {
            addLive(a, d, dBerry.pack(0, dBerry.cudOf(dState)), aState, p)
          }
          break
        }
        case 'leechSeed': {
          // 宿り木ティック: 被ダメ側の残HPで実ダメをクランプ、同量を植え主が回復
          if (ev.direction === 'fromAttacker') {
            const actual = Math.min(ev.amount, d)
            const nd0 = d - actual
            const na = clamp(a + actual, 0, attackerMaxHp)
            if (nd0 <= 0) koProb += p
            else {
              const t = triggerD(nd0, dState)
              addLive(na, t.d, t.state, aState, p) // 攻撃側はHP上昇なのできのみは発動しない
            }
          } else {
            const actual = Math.min(ev.amount, a)
            const na = a - actual
            const nd = clamp(d + actual, 0, defenderMaxHp)
            if (na <= 0) faintProb += p
            else {
              const ta = afterAttackerHpChange(a, na, aState)
              addLive(ta.a, nd, dState, ta.state, p) // 防御側はHP上昇なのできのみは発動しない
            }
          }
          break
        }
      }
    }

    joint = next

    // 攻撃・補助技イベント = ターン境界。はんすう再発動・しゅうかく再装填を両側独立に処理。
    // noTurnBoundary 付き攻撃（1ターン内の中間ヒット）はターンを終了させない。
    const isTurnBoundary =
      (ev.kind === 'attack' && ev.noTurnBoundary !== true) || ev.kind === 'setupTurn'
    const needsBoundary =
      (dBerry.active && (dBerry.cudEnabled || dBerry.harvestChance > 0)) ||
      (aBerry.active && (aBerry.cudEnabled || aBerry.harvestChance > 0))
    if (isTurnBoundary && needsBoundary) {
      const after = new Map<number, number>()
      const addAfter = (a: number, d: number, dState: number, aState: number, p: number) => {
        const k = enc(a, d, dState, aState)
        after.set(k, (after.get(k) ?? 0) + p)
      }
      for (const [key, p] of joint) {
        const { a, d, dState, aState } = dec(key)

        // はんすう: cud カウントダウン（2→1、1→今ターン末に再回復）
        let nd = d
        let dCud = dBerry.cudOf(dState)
        if (dBerry.cudEnabled) {
          if (dCud === 1) { nd = Math.min(defenderMaxHp, nd + dBerry.amount); dCud = 0 }
          else if (dCud === 2) { dCud = 1 }
        }
        let na = a
        let aCud = aBerry.cudOf(aState)
        if (aBerry.cudEnabled) {
          if (aCud === 1) { na = Math.min(attackerMaxHp, na + aBerry.amount); aCud = 0 }
          else if (aCud === 2) { aCud = 1 }
        }

        // しゅうかく/ものひろい: 消費済みなら確率で再装填（両側独立＝確率は積）
        for (const db of harvestBranches(dBerry, dBerry.consumedOf(dState), dCud)) {
          for (const ab of harvestBranches(aBerry, aBerry.consumedOf(aState), aCud)) {
            addAfter(na, nd, db.state, ab.state, p * db.prob * ab.prob)
          }
        }
      }
      joint = after
    }

    // ステップ後の周辺分布を記録（きのみ状態は集約）
    const aDist = new Map<number, number>()
    const dDist = new Map<number, number>()
    let bothAlive = 0
    for (const [key, p] of joint) {
      const { a, d } = dec(key)
      aDist.set(a, (aDist.get(a) ?? 0) + p)
      dDist.set(d, (dDist.get(d) ?? 0) + p)
      bothAlive += p
    }
    steps.push({
      label: opts.labels?.[i] ?? `ステップ ${i + 1}`,
      attackerHpDist: aDist,
      defenderHpDist: dDist,
      // 表示用: 両者瀕死は撃破・瀕死の両方にカウント
      koProb: Math.min(1, koProb + bothFaint),
      faintProb: Math.min(1, faintProb + bothFaint),
      bothAliveProb: bothAlive,
    })
  }

  let bothAlive = 0
  for (const p of joint.values()) bothAlive += p

  const attackerFaintProb = faintProb + bothFaint
  return {
    steps,
    defenderKoProb: Math.min(1, koProb + bothFaint),
    attackerFaintProb: Math.min(1, attackerFaintProb),
    bothFaintProb: Math.min(1, bothFaint),
    attackerSurviveProb: Math.min(1, 1 - attackerFaintProb),
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
