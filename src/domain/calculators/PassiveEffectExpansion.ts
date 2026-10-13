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
  findPassivePreset,
  passiveOriginSuffix,
  resolvePassiveAmount,
  type PassiveEffect,
  type PassiveOrigin,
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
  /** パネル状態から導出された効果の由来（手動効果は undefined）。固定化の対象外 */
  origin?: PassiveOrigin
  /**
   * 由来の常時効果の `order`（同一ターン末の適用順）。`buildPassiveSchedule` は常に設定する。
   * 未設定（手組みの項目）は最後尾扱い。
   */
  order?: number
}

/**
 * 常時効果の展開結果。
 *
 * UI（ゴースト行の描画）は `start` / `afterEvent` / `trailing` だけを見ればよい。
 * `afterEvent[eventId]` はそのイベントの処理中〜直後に適用される全項目を
 * **フックの適用順そのまま** に並べた集約リスト（usages 分の perAttack とターン末を交互に含む）。
 *
 * フック（SeqEvent への変換）は、usages 単位で割り込む必要があるため
 * `perAttackByTurn` / `perAttackByEventId` / `turnEndByEventId` を使う。
 * `afterEvent` はその集約ビューなので、**両方を適用すると二重適用になる**。
 *
 * ターン末項目の配置（V3.18.x）: 各項目は `assignTurnEndItems` により、そのターンのイベントのうち
 * 「通常イベント」または「order が自分以下の固定化ターン末イベント」の最後の直後へ置かれる。
 * 部分固定化後も、残った常時効果のターン末項目は固定化行と `order` どおりに交互配置される。
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
  /**
   * ターン番号 → そのターンを含む最後のイベント id（無い＝trailing 側）。
   * 後方互換のために残している。固定化行があるターンでは実際の配置と一致しないため、
   * 適用位置は `turnEndByEventId` を使うこと。
   */
  turnEndOwner: Record<number, string>
  /**
   * イベント id → その直後に適用するターン末項目（order 昇順）。
   * attack（usages≥2）は複数ターンの項目を持ちうるので、usage ごとに `item.turn` で絞り込む。
   */
  turnEndByEventId: Record<string, AutoEventItem[]>
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
  /**
   * そのイベントの技が接触技かを返す（ゴツゴツメット等 `requiresContact` の判定用）。
   * 攻撃側 perAttack は attack イベント、防御側 perAttack は incoming イベントの技を見る。
   * 未指定・技が特定できない場合は従来どおり適用する（`true` 扱い）。
   */
  isContactAttack?: (eventId: string) => boolean
  /**
   * そのイベントの技が「ちからずく の対象（追加効果あり）かつ使用者の特性が ちからずく」かを返す
   * （いのちのたま等 `suppressedBySheerForce` の判定用）。攻撃側 perAttack は attack イベント、
   * 防御側 perAttack は incoming イベントを見る。未指定なら従来どおり適用する。
   */
  isSheerForceAttack?: (eventId: string) => boolean
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
    order: eff.order,
    ...(eff.origin !== undefined ? { origin: eff.origin } : {}),
  }
}

/**
 * その効果が「接触技のときだけ発動する」もので、かつ当該イベントが非接触技のときに
 * 展開をスキップすべきかを判定する。判定材料がなければ従来どおり適用する。
 */
function isSuppressedByContact(
  eff: PassiveEffect,
  eventId: string,
  ctx: PassiveExpansionContext,
): boolean {
  if (eff.presetKey === undefined) return false
  if (findPassivePreset(eff.presetKey)?.requiresContact !== true) return false
  if (ctx.isContactAttack === undefined) return false
  return ctx.isContactAttack(eventId) === false
}

/**
 * その効果が「ちからずく で発動しない」もの（いのちのたま）で、かつ当該イベントが
 * ちからずく対象の技のときに展開をスキップすべきかを判定する。
 */
function isSuppressedBySheerForce(
  eff: PassiveEffect,
  eventId: string,
  ctx: PassiveExpansionContext,
): boolean {
  if (eff.presetKey === undefined) return false
  if (findPassivePreset(eff.presetKey)?.suppressedBySheerForce !== true) return false
  return ctx.isSheerForceAttack?.(eventId) === true
}

/** perAttack 項目をそのイベントで展開しないか（接触限定・ちからずく） */
function isPerAttackSuppressed(
  eff: PassiveEffect,
  eventId: string,
  ctx: PassiveExpansionContext,
): boolean {
  return isSuppressedByContact(eff, eventId, ctx) || isSuppressedBySheerForce(eff, eventId, ctx)
}

const NO_ORDER = Number.POSITIVE_INFINITY

/** 固定化行のタイミングの同一ターン内での前後（開始時 → 攻撃ごと → ターン末） */
function pinnedTimingRank(timing: TurnEventLike['pinnedTiming']): number {
  if (timing === 'start') return 0
  if (timing === 'perAttack') return 1
  return 2 // turnEnd / trailing
}

/**
 * ターン末項目 `item` を、イベント `ev` の後ろへ置けるか。
 * 通常イベント（固定化メタ情報なし）は常に可。固定化行は
 * (適用ターン, タイミング, order) が項目以下のときだけ可（＝本来その項目より前に適用されるもの）。
 */
function canFollow(ev: TurnEventLike, item: AutoEventItem): boolean {
  if (ev.pinnedTiming === undefined) return true
  const evTurn = ev.pinnedTurn ?? item.turn
  if (evTurn !== item.turn) return evTurn < item.turn
  const rank = pinnedTimingRank(ev.pinnedTiming)
  if (rank !== 2) return rank < 2
  return (ev.pinnedOrder ?? Number.NEGATIVE_INFINITY) <= (item.order ?? NO_ORDER)
}

/**
 * 1 ターン分のターン末項目を、そのターンのイベントへ割り当てる純粋関数。
 *
 * 項目は order 昇順（同 order は入力順）に並べ、各項目を `turnEvents` のうち
 *   - 通常イベント（本来の所有者。order −∞ 扱い。固定化された開始時/攻撃ごと行も同様）
 *   - 固定化ターン末行で `pinnedOrder <= item.order` のもの
 * の**最後**の直後へ置く。固定化行が無ければ全項目がターン最後のイベント（従来の所有者）へ付く。
 *
 * @param turnEvents そのターンを含むイベント（時系列順）
 * @param items      そのターンのターン末項目
 * @returns イベント id → その直後に適用する項目（order 昇順）
 */
export function assignTurnEndItems(
  turnEvents: TurnEventLike[],
  items: AutoEventItem[],
): Map<string, AutoEventItem[]> {
  const out = new Map<string, AutoEventItem[]>()
  if (turnEvents.length === 0 || items.length === 0) return out
  const sorted = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => ((a.item.order ?? NO_ORDER) - (b.item.order ?? NO_ORDER)) || (a.index - b.index))
  for (const { item } of sorted) {
    let target = turnEvents[0]
    for (const ev of turnEvents) {
      if (canFollow(ev, item)) target = ev
    }
    const list = out.get(target.id)
    if (list) list.push(item)
    else out.set(target.id, [item])
  }
  return out
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
    turnEndByEventId: {},
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

  // --- ターン末項目の割り当て（固定化行の order を考慮） ---
  for (let t = 1; t <= totalTurns; t++) {
    const items = schedule.turnEnd[t]
    if (!items || items.length === 0) continue
    const turnEvents: TurnEventLike[] = []
    events.forEach((ev, i) => {
      const r = ranges[i]
      if (r.startTurn <= t && t <= r.endTurn && r.startTurn >= 1) turnEvents.push(ev)
    })
    for (const [eventId, assigned] of assignTurnEndItems(turnEvents, items)) {
      for (const item of assigned) push(schedule.turnEndByEventId, eventId, item)
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
          if (isPerAttackSuppressed(eff, ev.id, ctx)) continue
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
        if (isPerAttackSuppressed(eff, ev.id, ctx)) continue
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
        bucket.push(...turnEndItemsAfter(schedule, ev.id, turn))
      }
    } else {
      bucket.push(...(schedule.perAttackByEventId[ev.id] ?? []))
      bucket.push(...(schedule.turnEndByEventId[ev.id] ?? []))
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

/**
 * イベントの直後に適用するターン末項目。`turn` を渡すとそのターンの分だけに絞る
 * （attack の usage ごとに割り込む用）。
 */
export function turnEndItemsAfter(
  schedule: Pick<PassiveSchedule, 'turnEndByEventId'>,
  eventId: string,
  turn?: number,
): AutoEventItem[] {
  const items = schedule.turnEndByEventId[eventId] ?? []
  return turn === undefined ? items : items.filter(i => i.turn === turn)
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

/** 自動項目の名前（導出効果は「（持ち物）」「（状態異常）」を付ける） */
export function autoItemName(item: AutoEventItem): string {
  return `${item.label}${passiveOriginSuffix(item.origin)}`
}

/** 自動項目の表示ラベル（例: `T2末 すなあらし −9` / `T1攻撃後 いのちのたま（持ち物） 攻−10`） */
export function autoItemLabel(item: AutoEventItem): string {
  const when = item.turn === 0 ? '開始時' : item.timing === 'perAttack' ? `T${item.turn}攻撃後` : `T${item.turn}末`
  const name = autoItemName(item)
  if (item.kind === 'leechSeed') {
    const arrow = item.side === 'defender' ? '攻→防' : '防→攻'
    return `${when} ${name}（${arrow} ${item.amount}）`
  }
  const sign = item.kind === 'recover' ? '+' : '−'
  const who = item.side === 'attacker' ? '攻' : '防'
  return `${when} ${name} ${who}${sign}${item.amount}`
}
