import type { ProgressionEvent } from '@/presentation/store/progressionStore'
import type { DmgDist, SeqEvent } from '@/domain/calculators/BattleSequenceCalc'

export type AttackEvent = Extract<ProgressionEvent, { kind: 'attack' }>

/**
 * 攻撃イベント展開のモード。**必ず明示的に指定する**（暗黙のデフォルトを作らない）。
 *
 * - `accumFixedAttacker`: 総合累積（攻撃側HPを固定したダミー1HPで回す）モード。
 *   攻撃側HPは追跡しないため、吸収・反動は SeqEvent に載せない
 *   （載せるとダミー攻撃側が反動で瀕死になり分布が壊れる）。
 * - `sequenceTrackedAttacker`: 攻守シミュレーション（攻撃側HPを実HPで追跡）モード。
 *   吸収・反動を SeqEvent に載せて攻撃側HPへ反映する。
 */
export type AttackExpandMode = 'accumFixedAttacker' | 'sequenceTrackedAttacker'

export interface AttackExpandParams {
  mode: AttackExpandMode
  /** 時系列全体で最初の攻撃イベントか（マルチスケイル/半減実の1発目判定用） */
  isFirstOverall: boolean
  /** 最初の攻撃イベントでマルチスケイル/半減実が発動していたか */
  firstHadMultiscale: boolean
  /** 吸収率（sequenceTrackedAttacker のときだけ SeqEvent に載る） */
  drain?: number
  /** おおきなねっこ相当の吸収ブースト */
  drainBoosted?: boolean
  /** 反動率（sequenceTrackedAttacker のときだけ SeqEvent に載る） */
  recoil?: number
  /**
   * きょけんとつげき後の被ダメ補正（`GlaiveRushState` が返す factor）。
   * 2 = 2倍、0.5 = 織り込み済みロールを等倍へ戻す、1（既定）= 補正なし。
   * ばけのかわ等の固定ダメージ（`firstHitFixedDamage`）は技のダメージではないため対象外。
   */
  damageScale?: number
}

export interface ExpandedAttack {
  /** 通常ロール版。**必ず usages 個**（ラベル生成はこの添字と1:1で対応する） */
  normal: SeqEvent[]
  /** 急所混合版。normal と同じく **必ず usages 個**（連続技は1使用=1つの multiHit） */
  crit: SeqEvent[]
}

/** 通常ロール + 急所ロールを critChance で混合した1発分の分布Map */
export function mixToMap(
  rolls: number[],
  critRolls: number[] | undefined,
  critChance: number,
): Map<number, number> {
  const m = new Map<number, number>()
  const useCrit = critRolls != null && critChance > 0
  const pN = useCrit ? 1 - critChance : 1
  const nN = rolls.length
  for (const r of rolls) m.set(r, (m.get(r) ?? 0) + pN / nN)
  if (useCrit && critRolls) {
    const nC = critRolls.length
    for (const r of critRolls) m.set(r, (m.get(r) ?? 0) + critChance / nC)
  }
  return m
}

/** ヒット別ロールの組（通常・2回目以降・急所・急所2回目以降） */
interface PerHitArrays {
  norm: number[][]
  raw: number[][]
  crit: number[][]
  rawCrit: number[][]
}

/**
 * 攻撃イベントのヒット別ロールを取り出す。連続技でなければ null。
 * 新形式（perHitRolls）を優先し、旧データはおやこあい（pb*）・変動連続技（rolls/rawRolls）から復元する。
 */
function perHitArraysOf(e: AttackEvent): PerHitArrays | null {
  if (e.perHitRolls && e.perHitRolls.length > 0) {
    const norm = e.perHitRolls
    const crit = e.perHitCritRolls ?? norm
    return {
      norm,
      raw: e.perHitRawRolls ?? norm,
      crit,
      rawCrit: e.perHitRawCritRolls ?? crit,
    }
  }
  if (e.pbChildRolls !== undefined) {
    const child = e.pbChildRolls
    const childCrit = e.pbChildCritRolls ?? child
    const parent = e.pbParentRolls ?? e.rolls
    const parentCrit = e.pbParentCritRolls ?? e.critRolls
    return {
      norm: [parent, child],
      raw: [e.pbParentRawRolls ?? e.rawRolls, child],
      crit: [parentCrit, childCrit],
      rawCrit: [e.pbParentRawCritRolls ?? e.rawCritRolls, childCrit],
    }
  }
  if (e.variableHitDist && e.variableHitDist.length > 0) {
    const maxHits = Math.max(...e.variableHitDist.map(d => d.hits))
    const tail = Array.from({ length: Math.max(0, maxHits - 1) }, () => e.rawRolls)
    const tailCrit = Array.from({ length: Math.max(0, maxHits - 1) }, () => e.rawCritRolls)
    return {
      norm: [e.rolls, ...tail],
      raw: [e.rawRolls, ...tail],
      crit: [e.critRolls, ...tailCrit],
      rawCrit: [e.rawCritRolls, ...tailCrit],
    }
  }
  return null
}

/**
 * 攻撃イベントを SeqEvent 列（通常パス・急所込みパス）へ展開する。
 * usages 展開・マルチスケイル継承・連続技（ヒット別 multiHit）・ばけのかわを扱う。
 *
 * 連続技（固定多段・段階威力・変動連続技・おやこあい）は1使用を1つの `multiHit` にし、
 * 各ヒットをエンジンへ個別に見せる（ヒット間でオボン等のきのみが発動する Gen5+ 仕様）。
 * 急所込みパスは各ヒットで独立に急所判定する（ヒットごとに mixToMap）。
 *
 * 通常パスと急所込みパスは「攻撃のダメージ分布」だけが異なり、
 * それ以外（イベントの個数・順序・ターン境界・吸収/反動）は同一になる。
 */
export function expandAttackEvent(e: AttackEvent, params: AttackExpandParams): ExpandedAttack {
  const tracked = params.mode === 'sequenceTrackedAttacker'
  const drain = tracked ? params.drain : undefined
  const drainBoosted = tracked ? params.drainBoosted : undefined
  const recoil = tracked ? params.recoil : undefined

  const atk = (dmg: DmgDist): SeqEvent =>
    ({ kind: 'attack', dmg, drain, drainBoosted, recoil })
  const hitCountDist = e.variableHitDist && e.variableHitDist.length > 0 ? e.variableHitDist : undefined
  const multi = (hits: DmgDist[]): SeqEvent =>
    ({ kind: 'multiHit', hits, hitCountDist, drain, drainBoosted, recoil })

  /** きょけんとつげき後の被ダメ補正。すべてのロール系配列へ一律に適用する */
  const scale = params.damageScale ?? 1
  const scl = (arr: number[]): number[] =>
    scale === 1 ? arr : arr.map(v => Math.round(v * scale))

  const perHit = perHitArraysOf(e)

  const normal: SeqEvent[] = []
  const crit: SeqEvent[] = []

  for (let u = 0; u < e.usages; u++) {
    const isVeryFirst = params.isFirstOverall && u === 0
    const useRaw = !isVeryFirst && params.firstHadMultiscale
    const firstHitFixedDamage = u === 0 ? (e.firstHitFixedDamage ?? 0) : 0

    if (perHit) {
      // ばけのかわ: 最初の使用だけ1発目を固定ダメへ置換（残りのヒットは通常どおり）
      const nullifyFirstHit = e.firstHitNullified === true && u === 0
      const withFirst = (hits: number[][]): number[][] => hits.map((h, k) => {
        if (k !== 0) return h
        if (nullifyFirstHit) return [firstHitFixedDamage]
        return firstHitFixedDamage === 0 ? h : h.map(r => r + firstHitFixedDamage)
      })
      const normHits = withFirst((useRaw ? perHit.raw : perHit.norm).map(scl))
      const critHits = withFirst((useRaw ? perHit.rawCrit : perHit.crit).map(scl))
      normal.push(multi(normHits))
      if (e.isForcedCrit) {
        crit.push(multi(critHits))
      } else {
        crit.push(multi(normHits.map((h, k) => mixToMap(h, critHits[k], e.critChance))))
      }
      continue
    }

    const normalRolls = scl(useRaw ? e.rawRolls : e.rolls)
    const critRolls   = scl(useRaw ? e.rawCritRolls : e.critRolls)
    const normalRollsWithFixed = normalRolls.map(r => r + firstHitFixedDamage)
    const critRollsWithFixed = critRolls.map(r => r + firstHitFixedDamage)
    normal.push(atk(normalRollsWithFixed))
    if (e.isForcedCrit) {
      crit.push(atk(normalRollsWithFixed))
    } else {
      crit.push(atk(mixToMap(normalRollsWithFixed, critRollsWithFixed, e.critChance)))
    }
  }

  return { normal, crit }
}

/**
 * 急所込みパスを別途走らせる意味があるか（＝通常パスと分布が変わりうるか）。
 * 変わらないなら 2D エンジンの2回目実行を省略できる。
 */
export function needsCritPass(events: ProgressionEvent[]): boolean {
  return events.some(e =>
    e.kind === 'attack' &&
    (e.pbChildRolls !== undefined || (!e.isForcedCrit && e.critChance > 0))
  )
}
