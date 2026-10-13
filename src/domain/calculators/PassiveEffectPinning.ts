/**
 * 常時効果の「固定化」（V3.18.2）
 *
 * 常時効果（PassiveEffect）が自動展開している各適用を、**フックが適用するのとまったく同じ位置**へ
 * 通常の編集可能イベント（ProgressionEvent）として実体化する純粋ロジック。
 * 実体化した常時効果はカタログから取り除かれるため、二重適用は起きない。
 *
 * 位置の規則（`useBattleSequence` の適用順と 1:1）:
 *   - `start` 項目            → 時系列の先頭（順序そのまま）
 *   - 攻撃側 perAttack 項目   → 対応する attack の各 usage 直後
 *   - ターン t のターン末項目 → `assignTurnEndItems` が決める位置（`turnEndByEventId`）。
 *                               固定化行が無ければターン t を含む**最後のイベント**の直後。
 *                               既に固定化されたターン末行があれば、order が自分以下のものの直後
 *   - 防御側 perAttack 項目   → 対応する `incoming` の直後
 *   - trailing 項目           → 時系列の末尾
 *
 * usages 分割:
 *   `attack` の usages が 2 以上で、**最後の usage より前**のターンに固定化対象の項目があるときは、
 *   その attack を usages=1 の attack N 個へ分割して間に挟めるようにする。
 *   分割コピー 2 個目以降は `firstHitNullified` / `firstHitFixedDamage`（＝「最初の使用だけ」の効果）を
 *   落とす。これは `expandAttackEvent` が u=0 のときだけこれらを適用する挙動と一致するため、
 *   分割前後でダメージ分布は完全に一致する。
 *   （マルチスケイル/半減実の「全体の1発目だけ」判定は `firstHadMultiscale` により
 *     時系列全体の最初の attack から引き継がれるため、分割の影響を受けない）
 *
 * パネル状態からの導出効果（`PassiveEffect.origin` あり。いのちのたま・やけど 等）:
 *   ストアに存在せず毎回導出されるため固定化の対象外（`effectIdsToPin` に含まれていても無視する）。
 *   固定化後も導出効果は自動展開のまま残る。
 *
 * 部分固定化と order の保証:
 *   固定化イベントは由来の自動項目の適用ターン・order・タイミング（`pinnedTurn` / `pinnedOrder` /
 *   `pinnedTiming`）を持つ。展開（`assignTurnEndItems`）はこれを見て、残った常時効果（導出効果を含む）の
 *   ターン末項目を固定化行と `order` どおりに交互配置する。固定化側も同じ規則で挿入位置を決めるため、
 *   一部ずつ何回に分けて固定化しても、全件を一度に固定化しても、フックの適用順は固定化前と同じになる。
 *
 * 残る注意点:
 *   - 同 order 同士（例: たべのこし と くろいヘドロ）の前後は、固定化行が先になる（配列順は保たれない）。
 *     ダメージ同士・回復同士の入れ替わりは数値に影響しない。
 *   - trailing（既存ターンを超えた分）の項目は従来どおり時系列の末尾へまとめて置くため、
 *     trailing を部分固定化すると、残った trailing 項目は固定化行の後ろへ回る。
 *   - ユーザーが固定化行を手で別の位置へ動かした場合は、その位置を尊重する（並べ直さない）。
 *   - メタ情報を持たない固定化行（この仕組みより前に保存されたセッション）は通常イベント扱い。
 */

import {
  buildPassiveSchedule,
  turnEndItemsAfter,
  type AutoEventItem,
  type PassiveExpansionContext,
} from '@/domain/calculators/PassiveEffectExpansion'
import { computeTurnRanges, type PassiveEffect, type PinnedTiming } from '@/domain/models/PassiveEffect'

/**
 * 固定化が参照するイベントの最小形。
 * `progressionStore` の `ProgressionEvent` は構造的にこの型へ代入できる
 * （ドメイン層からプレゼンテーション層へ依存しないための構造型）。
 */
export interface ProgressionEventLike {
  id: string
  kind: string
  usages?: number
  firstHitNullified?: boolean
  firstHitFixedDamage?: number
  amount?: number
  label?: string
  source?: string
  direction?: string
  pinnedTurn?: number
  pinnedOrder?: number
  pinnedTiming?: PinnedTiming
}

/** 固定化イベントが持つメタ情報（部分固定化後の order 保証に使う） */
export interface PinnedMeta {
  pinnedTurn: number
  pinnedOrder?: number
  pinnedTiming: PinnedTiming
}

/** 固定化で生成されるイベント（`ProgressionEvent` の該当メンバーへ代入可能） */
export type PinnedEvent =
  | ({ kind: 'defenderConst'; id: string; amount: number; label: string; source: 'pinned' } & PinnedMeta)
  | ({ kind: 'attackerConst'; id: string; amount: number; label: string; source: 'pinned' } & PinnedMeta)
  | ({ kind: 'defenderRecover'; id: string; amount: number; label: string; source: 'pinned' } & PinnedMeta)
  | ({ kind: 'attackerRecover'; id: string; amount: number; label: string; source: 'pinned' } & PinnedMeta)
  | ({
      kind: 'leechSeed'
      id: string
      direction: 'fromAttacker' | 'fromDefender'
      amount: number
      label: string
      source: 'pinned'
    } & PinnedMeta)

export interface PinResult<T extends ProgressionEventLike = ProgressionEventLike> {
  /** 固定化後の新しい時系列 */
  events: (T | PinnedEvent)[]
  /** カタログから取り除くべき常時効果の id（実体化が 0 件でも取り除く） */
  removedEffectIds: string[]
}

/** 固定化イベントの表示ラベル（例: `開始時 ステロ` / `T2末 すなあらし` / `T3 いのちのたま`） */
export function pinnedEventLabel(item: AutoEventItem): string {
  const when = item.turn === 0
    ? '開始時'
    : item.timing === 'perAttack'
      ? `T${item.turn}`
      : `T${item.turn}末`
  return `${when} ${item.label}`
}

/** 自動項目のタイミング → 固定化行のタイミング */
function pinnedTimingOf(item: AutoEventItem, trailing: boolean): PinnedTiming {
  if (item.timing === 'turnEnd') return trailing ? 'trailing' : 'turnEnd'
  return item.timing
}

/**
 * 自動項目 1 件を編集可能イベントへ実体化する。
 * @param opts.trailing 既存ターンを超えた分（時系列末尾へ置く）項目か
 */
export function materializePassiveItem(
  item: AutoEventItem,
  id: string,
  opts: { trailing?: boolean } = {},
): PinnedEvent {
  const label = pinnedEventLabel(item)
  const meta: PinnedMeta = {
    pinnedTurn: item.turn,
    ...(item.order !== undefined ? { pinnedOrder: item.order } : {}),
    pinnedTiming: pinnedTimingOf(item, opts.trailing === true),
  }
  if (item.kind === 'leechSeed') {
    return {
      kind: 'leechSeed',
      id,
      // side は被ダメ側。防御側が受けるなら攻撃側が植え主（fromAttacker）
      direction: item.side === 'defender' ? 'fromAttacker' : 'fromDefender',
      amount: item.amount,
      label,
      source: 'pinned',
      ...meta,
    }
  }
  if (item.kind === 'recover') {
    return item.side === 'attacker'
      ? { kind: 'attackerRecover', id, amount: item.amount, label, source: 'pinned', ...meta }
      : { kind: 'defenderRecover', id, amount: item.amount, label, source: 'pinned', ...meta }
  }
  return item.side === 'attacker'
    ? { kind: 'attackerConst', id, amount: item.amount, label, source: 'pinned', ...meta }
    : { kind: 'defenderConst', id, amount: item.amount, label, source: 'pinned', ...meta }
}

/**
 * 与えられた自動項目群に現れる常時効果 id（重複除去・出現順）。
 * パネル状態からの導出効果（`origin` あり）は固定化できないため含めない。
 */
export function collectEffectIds(items: readonly AutoEventItem[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    if (item.origin !== undefined) continue
    if (seen.has(item.effectId)) continue
    seen.add(item.effectId)
    out.push(item.effectId)
  }
  return out
}

type AttackCopyShape = {
  id: string
  usages: number
  firstHitNullified?: boolean
  firstHitFixedDamage?: number
}

/** usages 分割コピーを作る。2 個目以降は「最初の使用だけ」のフィールドを落とす */
function splitAttackCopy<T extends ProgressionEventLike>(ev: T, id: string, isFirstCopy: boolean): T {
  const copy = { ...ev, usages: 1 } as T & AttackCopyShape
  if (!isFirstCopy) {
    copy.id = id
    copy.firstHitNullified = false
    delete copy.firstHitFixedDamage
  }
  return copy
}

/**
 * 指定した常時効果を、自動展開されている位置そのままの手動イベントへ変換する。
 *
 * @param events        現在の時系列
 * @param effects       現在の常時効果（全件。スケジュールは全件で構築し、対象だけ実体化する）
 * @param effectIdsToPin 固定化する常時効果の id
 * @param ctx           実量の解決に使う攻守の最大HP・タイプ
 * @param genId         新規イベント id 生成器
 */
export function pinPassiveEffects<T extends ProgressionEventLike>(
  events: T[],
  effects: PassiveEffect[],
  effectIdsToPin: string[],
  ctx: PassiveExpansionContext,
  genId: () => string,
): PinResult<T> {
  const requested = new Set(effectIdsToPin)
  // パネル状態からの導出効果（origin あり）はストアから取り除けないため固定化しない
  // （実体化すると導出側と二重に適用される）。スケジュールは渡された全効果で構築する
  const removedEffectIds = effects
    .filter(e => requested.has(e.id) && e.origin === undefined)
    .map(e => e.id)
  if (removedEffectIds.length === 0) {
    return { events: [...events], removedEffectIds: [] }
  }

  const pinSet = new Set(removedEffectIds)
  const schedule = buildPassiveSchedule(events, effects, ctx)
  const rangeById = new Map(computeTurnRanges(events).map(r => [r.eventId, r] as const))

  const pinned = (items: AutoEventItem[] | undefined): AutoEventItem[] =>
    (items ?? []).filter(i => pinSet.has(i.effectId))

  const out: (T | PinnedEvent)[] = []
  const emit = (items: AutoEventItem[], trailing = false) => {
    for (const item of items) out.push(materializePassiveItem(item, genId(), { trailing }))
  }

  emit(pinned(schedule.start))

  for (const ev of events) {
    const range = rangeById.get(ev.id)
    if (ev.kind === 'attack' && range) {
      const usages = Math.max(1, ev.usages ?? 1)
      // usage ごとの固定化対象（攻撃側 perAttack → そのターンのターン末 の順）
      const perUsage: AutoEventItem[][] = []
      for (let u = 0; u < usages; u++) {
        const turn = range.startTurn + u
        const items = pinned(schedule.perAttackByTurn[turn])
        items.push(...pinned(turnEndItemsAfter(schedule, ev.id, turn)))
        perUsage.push(items)
      }
      // 最後の usage より前に挟むものが無ければ分割不要（末尾へまとめて置ける）
      const needSplit = usages > 1 && perUsage.slice(0, usages - 1).some(list => list.length > 0)
      if (!needSplit) {
        out.push(ev)
        emit(perUsage[usages - 1])
      } else {
        for (let u = 0; u < usages; u++) {
          // 1 個目は元の id を保つ（新 id を消費しない）
          out.push(u === 0 ? splitAttackCopy(ev, ev.id, true) : splitAttackCopy(ev, genId(), false))
          emit(perUsage[u])
        }
      }
      continue
    }

    out.push(ev)
    if (!range) continue
    emit(pinned(schedule.perAttackByEventId[ev.id]))
    // ターン末項目は既存の固定化行も含めて order どおりの位置（assignTurnEndItems）へ
    emit(pinned(turnEndItemsAfter(schedule, ev.id)))
  }

  emit(pinned(schedule.trailing), true)

  return { events: out, removedEffectIds }
}
