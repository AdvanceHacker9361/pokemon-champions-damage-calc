import type { ProgressionEvent } from '@/presentation/store/progressionStore'
import type { DmgDist, SeqEvent } from '@/domain/calculators/BattleSequenceCalc'
import {
  calcVariableHitsSingleUsageDist,
  calcVariableHitsSingleUsageDistWithCrit,
} from '@/domain/calculators/KoProbabilityCalc'

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
}

export interface ExpandedAttack {
  /** 通常ロール版。**必ず usages 個**（ラベル生成はこの添字と1:1で対応する） */
  normal: SeqEvent[]
  /** 急所混合版。おやこあいは親・子の独立スロットへ分割されるため個数は normal と一致しないことがある */
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

/**
 * 攻撃イベントを SeqEvent 列（通常パス・急所込みパス）へ展開する。
 * usages 展開・マルチスケイル継承・変動連続技・ばけのかわ・おやこあい分割を扱う。
 *
 * 通常パスと急所込みパスは「攻撃のダメージ分布」だけが異なり、
 * それ以外（イベントの順序・ターン境界・吸収/反動）は同一になる。
 */
export function expandAttackEvent(e: AttackEvent, params: AttackExpandParams): ExpandedAttack {
  const tracked = params.mode === 'sequenceTrackedAttacker'
  const drain = tracked ? params.drain : undefined
  const drainBoosted = tracked ? params.drainBoosted : undefined
  const recoil = tracked ? params.recoil : undefined

  const atk = (dmg: DmgDist, noTurnBoundary?: boolean): SeqEvent =>
    ({ kind: 'attack', dmg, drain, drainBoosted, recoil, noTurnBoundary })

  const normal: SeqEvent[] = []
  const crit: SeqEvent[] = []

  for (let u = 0; u < e.usages; u++) {
    const isVeryFirst = params.isFirstOverall && u === 0
    const useRaw = !isVeryFirst && params.firstHadMultiscale
    const normalRolls = useRaw ? e.rawRolls : e.rolls
    const critRolls   = useRaw ? e.rawCritRolls : e.critRolls
    const firstHitFixedDamage = u === 0 ? (e.firstHitFixedDamage ?? 0) : 0

    if (e.variableHitDist) {
      const nullifyFirstHit = e.firstHitNullified === true && u === 0
      const hit1Rolls = nullifyFirstHit
        ? normalRolls.map(() => firstHitFixedDamage)
        : normalRolls.map(r => r + firstHitFixedDamage)
      const hit1CritRolls = nullifyFirstHit
        ? critRolls.map(() => firstHitFixedDamage)
        : critRolls.map(r => r + firstHitFixedDamage)
      const hit2plusRolls = e.rawRolls
      const dist = calcVariableHitsSingleUsageDist(hit1Rolls, e.variableHitDist, hit2plusRolls)
      normal.push(atk(dist))
      if (e.isForcedCrit) {
        const critDist = calcVariableHitsSingleUsageDist(hit1CritRolls, e.variableHitDist, e.rawCritRolls)
        crit.push(atk(critDist))
      } else {
        const distWithCrit = calcVariableHitsSingleUsageDistWithCrit(
          hit1Rolls, hit1CritRolls, e.critChance, e.variableHitDist, hit2plusRolls, e.rawCritRolls,
        )
        crit.push(atk(distWithCrit))
      }
      continue
    }

    const normalRollsWithFixed = normalRolls.map(r => r + firstHitFixedDamage)
    const critRollsWithFixed = critRolls.map(r => r + firstHitFixedDamage)
    normal.push(atk(normalRollsWithFixed))

    if (e.pbChildRolls !== undefined) {
      const parentNorm = useRaw ? (e.pbParentRawRolls ?? normalRolls) : (e.pbParentRolls ?? normalRolls)
      const parentCrit = useRaw ? (e.pbParentRawCritRolls ?? critRolls) : (e.pbParentCritRolls ?? critRolls)
      const childNorm = e.pbChildRolls
      const childCrit = e.pbChildCritRolls ?? childNorm
      // おやこあいは親+子で1ターン。親（中間ヒット）はターン境界を発生させず、
      // 子（最終ヒット）のみがターンを終了させる（通常パスの単一マージイベントと整合）。
      if (e.isForcedCrit) {
        crit.push(atk(parentNorm, true))
        crit.push(atk(childNorm))
      } else {
        crit.push(atk(mixToMap(parentNorm, parentCrit, e.critChance), true))
        crit.push(atk(mixToMap(childNorm, childCrit, e.critChance)))
      }
    } else if (e.isForcedCrit) {
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
