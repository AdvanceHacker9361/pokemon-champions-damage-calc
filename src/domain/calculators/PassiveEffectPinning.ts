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
 *   - ターン t のターン末項目 → ターン t を含む**最後のイベント**の直後（`turnEndOwner`）
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
 * 既知の制限:
 *   一部の常時効果だけを固定化した場合、残った常時効果のターン末項目は
 *   「固定化されたイベント」が同ターンの最後のイベントになることで、その**後ろ**へ回る。
 *   同一ターン末の `order` による前後関係が変わりうるが、HP のしきい値（きのみ発動）に
 *   絡まない限り数値は変わらない。全件固定化（`すべて固定化` / ゴースト行の固定化）では起きない。
 */

import {
  buildPassiveSchedule,
  type AutoEventItem,
  type PassiveExpansionContext,
} from '@/domain/calculators/PassiveEffectExpansion'
import { computeTurnRanges, type PassiveEffect } from '@/domain/models/PassiveEffect'

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
}

/** 固定化で生成されるイベント（`ProgressionEvent` の該当メンバーへ代入可能） */
export type PinnedEvent =
  | { kind: 'defenderConst'; id: string; amount: number; label: string; source: 'pinned' }
  | { kind: 'attackerConst'; id: string; amount: number; label: string; source: 'pinned' }
  | { kind: 'defenderRecover'; id: string; amount: number; label: string; source: 'pinned' }
  | { kind: 'attackerRecover'; id: string; amount: number; label: string; source: 'pinned' }
  | {
      kind: 'leechSeed'
      id: string
      direction: 'fromAttacker' | 'fromDefender'
      amount: number
      label: string
      source: 'pinned'
    }

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

/** 自動項目 1 件を編集可能イベントへ実体化する */
export function materializePassiveItem(item: AutoEventItem, id: string): PinnedEvent {
  const label = pinnedEventLabel(item)
  if (item.kind === 'leechSeed') {
    return {
      kind: 'leechSeed',
      id,
      // side は被ダメ側。防御側が受けるなら攻撃側が植え主（fromAttacker）
      direction: item.side === 'defender' ? 'fromAttacker' : 'fromDefender',
      amount: item.amount,
      label,
      source: 'pinned',
    }
  }
  if (item.kind === 'recover') {
    return item.side === 'attacker'
      ? { kind: 'attackerRecover', id, amount: item.amount, label, source: 'pinned' }
      : { kind: 'defenderRecover', id, amount: item.amount, label, source: 'pinned' }
  }
  return item.side === 'attacker'
    ? { kind: 'attackerConst', id, amount: item.amount, label, source: 'pinned' }
    : { kind: 'defenderConst', id, amount: item.amount, label, source: 'pinned' }
}

/** 与えられた自動項目群に現れる常時効果 id（重複除去・出現順） */
export function collectEffectIds(items: readonly AutoEventItem[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
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
  const removedEffectIds = effects.filter(e => requested.has(e.id)).map(e => e.id)
  if (removedEffectIds.length === 0) {
    return { events: [...events], removedEffectIds: [] }
  }

  const pinSet = new Set(removedEffectIds)
  const schedule = buildPassiveSchedule(events, effects, ctx)
  const rangeById = new Map(computeTurnRanges(events).map(r => [r.eventId, r] as const))

  const pinned = (items: AutoEventItem[] | undefined): AutoEventItem[] =>
    (items ?? []).filter(i => pinSet.has(i.effectId))

  const out: (T | PinnedEvent)[] = []
  const emit = (items: AutoEventItem[]) => {
    for (const item of items) out.push(materializePassiveItem(item, genId()))
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
        if (schedule.turnEndOwner[turn] === ev.id) items.push(...pinned(schedule.turnEnd[turn]))
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
    const turn = range.endTurn
    if (turn >= 1 && schedule.turnEndOwner[turn] === ev.id) emit(pinned(schedule.turnEnd[turn]))
  }

  emit(pinned(schedule.trailing))

  return { events: out, removedEffectIds }
}
