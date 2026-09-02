/**
 * 常時効果（PassiveEffect）の時系列展開（V3.18.0）
 *
 * 「ダメージ進行」の常時効果カタログ（定数ダメ／回復タブ）を、イベント時系列上の
 * 自動イベント（AutoEventItem）へ展開する純粋ロジック。React / ストアには依存しない。
 *
 * 展開規則（`plan.md` V3.18.0 / `PassiveEffect.ts` の契約）:
 *   - `start`     : 時系列の先頭で count 回（'all' は 1 回扱い）
 *   - `turnEnd`   : startTurn 以降の各ターン末に 1 回ずつ。count がターン数を超える分は
 *                   末尾に追加ターン（trailing）として続ける。'all' は既存ターン分のみ
 *   - `perAttack` : 攻撃側 = attack の各 usage 直後 / 防御側 = incoming の直後に 1 回ずつ
 *   - 同一ターン末の適用順は `order` 昇順 → 同 order は配列の並び順
 *
 * ターン境界は `computeTurnRanges`（attack は usages 分、setupTurn は 1 ターン）に従う。
 */

import type { TypeName } from '@/domain/models/Pokemon'
import type { SeqEvent } from '@/domain/calculators/BattleSequenceCalc'
import {
  computeTurnRanges,
  resolvePassiveAmount,
  type PassiveEffect,
  type PassiveSide,
  type PassiveTiming,
  type TurnEventLike,
} from '@/domain/models/PassiveEffect'

/** 自動展開された 1 適用分 */
export interface AutoEventItem {
  /** 適用ターン（start は 0、trailing は totalTurns 超のターン番号） */
  turn: number
  /** 効果を受ける側（leechSeed では被ダメ側） */
  side: PassiveSide
  kind: 'damage' | 'recover' | 'leechSeed'
  /** 表示ラベル（常時効果のラベルそのまま） */
  label: string
  /** 実量（正の整数） */
  amount: number
  /** 由来の PassiveEffect.id */
  effectId: string
  /** 由来のタイミング（UI のバッジ表示用） */
  timing: PassiveTiming
}

/**
 * 常時効果の展開結果。
 *
 * UI（ゴースト行の描画）は `start` / `afterEvent` / `trailing` だけを見ればよい。
 * `afterEvent[eventId]` はそのイベントの処理中〜直後に適用される全項目を
 * **フックの適用順そのまま** に並べた集約リスト（usages 分の perAttack とターン末を交互に含む）。
 *
 * フック（SeqEvent への変換）は、usages 単位で割り込む必要があるため
 * `perAttackByTurn` / `perAttackByEventId` / `turnEnd` / `turnEndOwner` を使う。
 * `afterEvent` はその集約ビューなので、**両方を適用すると二重適用になる**。
 */
export interface PassiveSchedule {
  /** 時系列の先頭で適用（start タイミング） */
  start: AutoEventItem[]
  /** UI 表示用: イベント id → そのイベントに紐づく自動項目（適用順） */
  afterEvent: Record<string, AutoEventItem[]>
  /** 既存ターンを超えた分のターン末項目（時系列の末尾に追加） */
  trailing: AutoEventItem[]
  /** ターン番号 → そのターン末に適用する項目（order 昇順） */
  turnEnd: Record<number, AutoEventItem[]>
  /** ターン番号 → そのターン末項目を適用するイベント id（無い＝trailing 側） */
  turnEndOwner: Record<number, string>
  /** ターン番号 → 攻撃側 perAttack 項目（その attack usage 直後・ターン末より前） */
  perAttackByTurn: Record<number, AutoEventItem[]>
  /** incoming イベント id → 防御側 perAttack 項目（その被ダメ直後） */
  perAttackByEventId: Record<string, AutoEventItem[]>
  /** 時系列の総ターン数（trailing を含まない） */
  totalTurns: number
}

export interface PassiveExpansionContext {
  attackerMaxHp: number
  defenderMaxHp: number
  attackerTypes: TypeName[]
  defenderTypes: TypeName[]
}

/** count が既存ターンを超えたときに末尾へ追加するターン数の上限（暴走防止） */
export const MAX_TRAILING_TURNS = 20

function targetOf(side: PassiveSide, ctx: PassiveExpansionContext): { maxHp: number; types: TypeName[] } {
  return side === 'attacker'
    ? { maxHp: ctx.attackerMaxHp, types: ctx.attackerTypes }
    : { maxHp: ctx.defenderMaxHp, types: ctx.defenderTypes }
}

function makeItem(
  eff: PassiveEffect,
  turn: number,
  applicationIndex: number,
  ctx: PassiveExpansionContext,
): AutoEventItem {
  const target = targetOf(eff.side, ctx)
  const amount = resolvePassiveAmount(eff.amount, {
    targetMaxHp: target.maxHp,
    targetTypes: target.types,
    // もうどくは効果ごとに適用回数 k（1 始まり）を数える
    toxicCounter: applicationIndex + 1,
  })
  return {
    turn,
    side: eff.side,
    kind: eff.kind,
    label: eff.label,
    amount,
    effectId: eff.id,
    timing: eff.timing,
  }
}

/** count を数値へ正規化（'all' は Infinity、start では 1 回扱い） */
function countLimit(eff: PassiveEffect): number {
  if (eff.count === 'all') return eff.timing === 'start' ? 1 : Infinity
  return Math.max(0, Math.floor(eff.count))
}

function push<K extends string | number>(map: Record<K, AutoEventItem[]>, key: K, item: AutoEventItem): void {
  const list = map[key]
  if (list) list.push(item)
  else map[key] = [item]
}

/**
 * 常時効果を時系列へ展開したスケジュールを構築する。
 *
 * @param events ターン境界の判定に使うイベント列（id / kind / usages のみ参照）
 * @param effects 常時効果（配列順が同 order 内の適用順）
 */
export function buildPassiveSchedule(
  events: TurnEventLike[],
  effects: PassiveEffect[],
  ctx: PassiveExpansionContext,
): PassiveSchedule {
  const ranges = computeTurnRanges(events)
  const totalTurns = ranges.length === 0 ? 0 : ranges[ranges.length - 1].endTurn

  const schedule: PassiveSchedule = {
    start: [],
    afterEvent: {},
    trailing: [],
    turnEnd: {},
    turnEndOwner: {},
    perAttackByTurn: {},
    perAttackByEventId: {},
    totalTurns,
  }
  if (effects.length === 0) return schedule

  // 同 order 内は配列順を保つ安定ソート
  const sorted = effects
    .map((eff, index) => ({ eff, index }))
    .sort((a, b) => (a.eff.order - b.eff.order) || (a.index - b.index))

  // --- ターン末の所有イベント: ターン t を含む最後のイベント ---
  for (let t = 1; t <= totalTurns; t++) {
    let ownerId: string | undefined
    for (const r of ranges) {
      if (r.startTurn <= t && t <= r.endTurn && r.startTurn >= 1) ownerId = r.eventId
    }
    if (ownerId !== undefined) schedule.turnEndOwner[t] = ownerId
  }

  // --- start ---
  for (const { eff } of sorted) {
    if (eff.timing !== 'start') continue
    const n = countLimit(eff)
    const times = Number.isFinite(n) ? n : 1
    for (let k = 0; k < times; k++) {
      schedule.start.push(makeItem(eff, 0, k, ctx))
    }
  }

  // --- turnEnd（trailing 含む） ---
  for (const { eff } of sorted) {
    if (eff.timing !== 'turnEnd') continue
    const limit = countLimit(eff)
    if (limit <= 0) continue
    const startTurn = Math.max(1, Math.floor(eff.startTurn) || 1)
    // 'all' は既存ターン分のみ。数値 count は不足分を末尾ターンへ延長する
    const lastTurn = Number.isFinite(limit)
      ? Math.min(startTurn + limit - 1, totalTurns + MAX_TRAILING_TURNS)
      : totalTurns
    for (let t = startTurn, k = 0; t <= lastTurn; t++, k++) {
      push(schedule.turnEnd, t, makeItem(eff, t, k, ctx))
    }
  }

  // --- perAttack ---
  const perAttackUsed = new Map<string, number>()
  for (const ev of events) {
    const range = ranges.find(r => r.eventId === ev.id)
    if (!range) continue
    if (ev.kind === 'attack') {
      const usages = Math.max(1, ev.usages ?? 1)
      for (let u = 0; u < usages; u++) {
        const turn = range.startTurn + u
        for (const { eff } of sorted) {
          if (eff.timing !== 'perAttack' || eff.side !== 'attacker') continue
          if (turn < Math.max(1, eff.startTurn)) continue
          const used = perAttackUsed.get(eff.id) ?? 0
          if (used >= countLimit(eff)) continue
          perAttackUsed.set(eff.id, used + 1)
          push(schedule.perAttackByTurn, turn, makeItem(eff, turn, used, ctx))
        }
      }
    } else if (ev.kind === 'incoming') {
      const turn = Math.max(1, range.endTurn)
      for (const { eff } of sorted) {
        if (eff.timing !== 'perAttack' || eff.side !== 'defender') continue
        if (turn < Math.max(1, eff.startTurn)) continue
        const used = perAttackUsed.get(eff.id) ?? 0
        if (used >= countLimit(eff)) continue
        perAttackUsed.set(eff.id, used + 1)
        push(schedule.perAttackByEventId, ev.id, makeItem(eff, turn, used, ctx))
      }
    }
  }

  // --- UI 集約ビュー（フックの適用順そのまま） ---
  for (const ev of events) {
    const range = ranges.find(r => r.eventId === ev.id)
    if (!range) continue
    const bucket: AutoEventItem[] = []
    if (ev.kind === 'attack') {
      const usages = Math.max(1, ev.usages ?? 1)
      for (let u = 0; u < usages; u++) {
        const turn = range.startTurn + u
        bucket.push(...(schedule.perAttackByTurn[turn] ?? []))
        if (schedule.turnEndOwner[turn] === ev.id) bucket.push(...(schedule.turnEnd[turn] ?? []))
      }
    } else {
      bucket.push(...(schedule.perAttackByEventId[ev.id] ?? []))
      const turn = range.endTurn
      if (turn >= 1 && schedule.turnEndOwner[turn] === ev.id) {
        bucket.push(...(schedule.turnEnd[turn] ?? []))
      }
    }
    if (bucket.length > 0) schedule.afterEvent[ev.id] = bucket
  }

  // --- trailing（既存ターンを超えたターン末） ---
  const trailingTurns = Object.keys(schedule.turnEnd)
    .map(Number)
    .filter(t => t > totalTurns)
    .sort((a, b) => a - b)
  for (const t of trailingTurns) {
    schedule.trailing.push(...(schedule.turnEnd[t] ?? []))
  }

  return schedule
}

/** 自動項目を SeqEvent へ変換する */
export function autoItemToSeqEvent(item: AutoEventItem): SeqEvent {
  if (item.kind === 'leechSeed') {
    // side は被ダメ側。防御側が受けるなら攻撃側が植え主（fromAttacker）
    return {
      kind: 'leechSeed',
      direction: item.side === 'defender' ? 'fromAttacker' : 'fromDefender',
      amount: item.amount,
    }
  }
  if (item.kind === 'recover') {
    return item.side === 'attacker'
      ? { kind: 'attackerRecover', amount: item.amount }
      : { kind: 'defenderRecover', amount: item.amount }
  }
  return item.side === 'attacker'
    ? { kind: 'attackerConst', amount: item.amount }
    : { kind: 'defenderConst', amount: item.amount }
}

/** 自動項目の表示ラベル（例: `T2末 すなあらし −9`） */
export function autoItemLabel(item: AutoEventItem): string {
  const when = item.turn === 0 ? '開始時' : item.timing === 'perAttack' ? `T${item.turn}攻撃後` : `T${item.turn}末`
  if (item.kind === 'leechSeed') {
    const arrow = item.side === 'defender' ? '攻→防' : '防→攻'
    return `${when} ${item.label}（${arrow} ${item.amount}）`
  }
  const sign = item.kind === 'recover' ? '+' : '−'
  const who = item.side === 'attacker' ? '攻' : '防'
  return `${when} ${item.label} ${who}${sign}${item.amount}`
}
