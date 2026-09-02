import type { EventKind } from '@/presentation/store/progressionStore'

/**
 * イベント挿入メニューの単一情報源（V3.18.0 フェーズB）。
 *
 * 「イベント時系列」へ新しいイベントを差し込むための全アクションを1か所で定義する。
 * - タブ（ProgressionTabs のイベントタブ）: `<EventInsertGrid>` で末尾追加
 * - 各行の「＋」ボタン: `<EventInsertPopover>` でそのイベント直後へ挿入
 * 両者は同じ `key` を `onSelect` に渡すだけで、実際のディスパッチ（addAfter/addSetupTurn/
 * addMegaEvolve への振り分け）は呼び出し側（DamageProgressionPanel）が1か所で担う。
 */

export type InsertEventGroup = 'turn' | 'manual'

export const INSERT_EVENT_GROUP_LABELS: Record<InsertEventGroup, string> = {
  turn: 'ターン進行',
  manual: '手動HP補正',
}

export interface InsertEventCtx {
  attackerCanMega: boolean
  defenderCanMega: boolean
}

/** 実際にディスパッチする際に必要な最小情報。呼び出し側の switch で分岐する。 */
export type InsertEventDispatch =
  | { type: 'event'; kind: EventKind }
  | { type: 'setupTurn'; side: 'attacker' | 'defender' }
  | { type: 'megaEvolve'; side: 'attacker' | 'defender' }
  | { type: 'rearmBerry'; side: 'attacker' | 'defender' }

export interface InsertEventActionDef {
  key: string
  label: string
  group: InsertEventGroup
  tone: 'accent' | 'warning' | 'success'
  dispatch: InsertEventDispatch
  title?: string
  disabled: (ctx: InsertEventCtx) => boolean
}

const NEVER_DISABLED = () => false

export const INSERT_EVENT_ACTIONS: InsertEventActionDef[] = [
  // ---------- ターン進行 ----------
  {
    key: 'incoming',
    label: '＋攻撃側被ダメ',
    group: 'turn',
    tone: 'warning',
    dispatch: { type: 'event', kind: 'incoming' },
    disabled: NEVER_DISABLED,
  },
  {
    key: 'painSplit',
    label: '＋痛み分け',
    group: 'turn',
    tone: 'accent',
    dispatch: { type: 'event', kind: 'painSplit' },
    disabled: NEVER_DISABLED,
  },
  {
    key: 'setupTurn-attacker',
    label: '＋攻撃側補助',
    group: 'turn',
    tone: 'accent',
    dispatch: { type: 'setupTurn', side: 'attacker' },
    title: '攻撃側が積み技などの補助技を使うターンを時系列に追加',
    disabled: NEVER_DISABLED,
  },
  {
    key: 'setupTurn-defender',
    label: '＋防御側補助',
    group: 'turn',
    tone: 'accent',
    dispatch: { type: 'setupTurn', side: 'defender' },
    title: '防御側が積み技などの補助技を使うターンを時系列に追加',
    disabled: NEVER_DISABLED,
  },
  {
    key: 'megaEvolve-attacker',
    label: '＋攻撃側メガ',
    group: 'turn',
    tone: 'accent',
    dispatch: { type: 'megaEvolve', side: 'attacker' },
    title: 'この時点以降、攻撃側をメガシンカ後のステータス・特性として扱います',
    disabled: ctx => !ctx.attackerCanMega,
  },
  {
    key: 'megaEvolve-defender',
    label: '＋防御側メガ',
    group: 'turn',
    tone: 'accent',
    dispatch: { type: 'megaEvolve', side: 'defender' },
    title: 'この時点以降、防御側をメガシンカ後のステータス・特性として扱います',
    disabled: ctx => !ctx.defenderCanMega,
  },
  {
    key: 'rearmBerry-attacker',
    label: '＋リサイクル（攻）',
    group: 'turn',
    tone: 'success',
    dispatch: { type: 'rearmBerry', side: 'attacker' },
    title: '攻撃側の消費済みきのみを再装填し、直後のHP減少で再び発動できるようにする',
    disabled: NEVER_DISABLED,
  },
  {
    key: 'rearmBerry-defender',
    label: '＋リサイクル（防）',
    group: 'turn',
    tone: 'success',
    dispatch: { type: 'rearmBerry', side: 'defender' },
    title: '防御側の消費済みきのみを再装填し、直後の与ダメで再びきのみが発動できるようにする',
    disabled: NEVER_DISABLED,
  },
  // ---------- 手動HP補正 ----------
  {
    key: 'defenderConst',
    label: '＋防御側ダメ',
    group: 'manual',
    tone: 'warning',
    dispatch: { type: 'event', kind: 'defenderConst' },
    disabled: NEVER_DISABLED,
  },
  {
    key: 'defenderRecover',
    label: '＋防御側回復',
    group: 'manual',
    tone: 'success',
    dispatch: { type: 'event', kind: 'defenderRecover' },
    disabled: NEVER_DISABLED,
  },
  {
    key: 'attackerConst',
    label: '＋攻撃側ダメ',
    group: 'manual',
    tone: 'warning',
    dispatch: { type: 'event', kind: 'attackerConst' },
    disabled: NEVER_DISABLED,
  },
  {
    key: 'attackerRecover',
    label: '＋攻撃側回復',
    group: 'manual',
    tone: 'success',
    dispatch: { type: 'event', kind: 'attackerRecover' },
    disabled: NEVER_DISABLED,
  },
]

export const INSERT_EVENT_GROUPS: InsertEventGroup[] = ['turn', 'manual']

export function findInsertEventAction(key: string): InsertEventActionDef | undefined {
  return INSERT_EVENT_ACTIONS.find(a => a.key === key)
}
