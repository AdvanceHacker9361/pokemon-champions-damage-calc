import type { TypeName } from '@/domain/models/Pokemon'
import { getTypeEffectiveness } from '@/domain/constants/typeChart'

/**
 * 常時効果（V3.18.0）
 *
 * 「ダメージ進行」パネルの定数ダメ／回復タブで積み上げる効果の定義。
 * イベント時系列（ProgressionEvent）とは別に保持し、フック層がターン境界に自動展開する。
 *
 * ターンの定義:
 *   - `attack`（usages 分だけ 1 ターンずつ）と `setupTurn` がターンを開始する
 *   - それ以外のイベント（incoming / painSplit / const / recover / megaEvolve / rearmBerry）は
 *     進行中のターンに属する
 *   - 最初のターン開始イベントより前にあるイベントは「ターン 0（開始時）」に属する
 *
 * タイミング:
 *   - `start`     : 時系列の先頭で count 回適用（ステルスロック・まきびし・任意の固定ダメ）
 *   - `turnEnd`   : 各ターン末（次のターン開始イベントの直前、および末尾）に 1 回ずつ適用。
 *                   startTurn 以降の count ターン分。count がターン数を超える分は末尾に追加ターンとして続ける
 *   - `perAttack` : その側が攻撃した直後に 1 回ずつ適用（いのちのたま等）。startTurn 以降、count 回まで
 */

export type PassiveSide = 'attacker' | 'defender'

/** 丸め方式（ポケソル表記に準拠） */
export type Rounding =
  | 'floor' // 切り捨て
  | 'round' // 四捨五入
  | 'roundHalfDown' // 五捨五超入（.5 ちょうどは切り捨て、.5 超は切り上げ）
  | 'ceil' // 切り上げ

export type PassiveAmount =
  /** 対象側の最大HP × num/den を rounding で丸め、最低 1 */
  | { type: 'ratio'; num: number; den: number; rounding: Rounding }
  /** 固定値 */
  | { type: 'fixed'; value: number }
  /** ステルスロック: 最大HP × 1/8 × いわ相性（対象側のタイプで解決）、切り捨て・最低 1 */
  | { type: 'stealthRock' }
  /** もうどく: 適用回数 k（1 始まり、上限 15）に対して 最大HP × k/16 切り捨て・最低 1 */
  | { type: 'toxic' }

export type PassiveTiming = 'start' | 'turnEnd' | 'perAttack'

export type PassiveKind =
  /** 対象側 (side) の HP を減らす */
  | 'damage'
  /** 対象側 (side) の HP を回復する */
  | 'recover'
  /** 対象側 (side) が 1/8 ダメージを受け、反対側が同量回復する（宿り木のタネ） */
  | 'leechSeed'

export interface PassiveEffect {
  id: string
  /** 効果を受ける側 */
  side: PassiveSide
  kind: PassiveKind
  amount: PassiveAmount
  timing: PassiveTiming
  /** 適用回数。'all' は全ターン（turnEnd / perAttack のみ意味を持つ。start で 'all' は 1 回扱い） */
  count: number | 'all'
  /** 最初に適用するターン番号（1 始まり）。start では無視 */
  startTurn: number
  /** 同一ターン末での適用順序（小さいほど先）。プリセットは TURN_END_ORDER から、カスタムは TURN_END_ORDER.custom */
  order: number
  /** カタログ由来のときのプリセットキー */
  presetKey?: string
  /** 表示ラベル（プリセットのラベル、またはカスタム入力の名前） */
  label: string
}

/**
 * ターン末の適用順序（本編準拠の概略）。
 * 天候ダメ → グラスフィールド回復 → 持ち物回復（たべのこし/くろいヘドロ/ポイズンヒール）
 * → アクアリング/ねをはる → やどりぎ → どく/もうどく → やけど → のろい → バインド/しおづけ → カスタム
 */
export const TURN_END_ORDER = {
  weather: 10,
  grassyTerrain: 20,
  itemHeal: 30,
  aquaRing: 35,
  leechSeed: 40,
  poison: 50,
  burn: 60,
  curse: 70,
  bind: 80,
  saltCure: 85,
  custom: 90,
} as const

export type PassiveTab = 'damage' | 'recover'
export type PassiveSubTab = 'ratio' | 'toxic' | 'fixed' | 'oneShot'

export interface PassivePreset {
  key: string
  tab: PassiveTab
  subTab: PassiveSubTab
  /** 行の主ラベル（例: "1/16 切り捨て"） */
  label: string
  /** 発生源の説明（例: "やけど / しおづけ / すなあらし"） */
  sources: string
  kind: PassiveKind
  amount: PassiveAmount
  timing: PassiveTiming
  order: number
  /** ＋ を押したときの初期 count */
  defaultCount: number | 'all'
}

/**
 * カタログ（ポケソルの構成を参考に Pokémon Champions 向けへ調整）。
 * subTab 'oneShot' は常時効果ではなく「時系列へ単発イベントとして追加」する行（回復技など）。
 */
export const PASSIVE_PRESETS: PassivePreset[] = [
  // ---------- 定数ダメ / 割合 ----------
  {
    key: 'stealthRock',
    tab: 'damage',
    subTab: 'ratio',
    label: 'ステルスロック (1/8×相性)',
    sources: '対象側のいわ相性で割合が変わる',
    kind: 'damage',
    amount: { type: 'stealthRock' },
    timing: 'start',
    order: TURN_END_ORDER.custom,
    defaultCount: 1,
  },
  {
    key: 'spikes1',
    tab: 'damage',
    subTab: 'ratio',
    label: 'まきびし×1 (1/8)',
    sources: '登場時',
    kind: 'damage',
    amount: { type: 'ratio', num: 1, den: 8, rounding: 'floor' },
    timing: 'start',
    order: TURN_END_ORDER.custom,
    defaultCount: 1,
  },
  {
    key: 'spikes2',
    tab: 'damage',
    subTab: 'ratio',
    label: 'まきびし×2 (1/6)',
    sources: '登場時',
    kind: 'damage',
    amount: { type: 'ratio', num: 1, den: 6, rounding: 'floor' },
    timing: 'start',
    order: TURN_END_ORDER.custom,
    defaultCount: 1,
  },
  {
    key: 'spikes3',
    tab: 'damage',
    subTab: 'ratio',
    label: 'まきびし×3 (1/4)',
    sources: '登場時',
    kind: 'damage',
    amount: { type: 'ratio', num: 1, den: 4, rounding: 'floor' },
    timing: 'start',
    order: TURN_END_ORDER.custom,
    defaultCount: 1,
  },
  {
    key: 'sandstorm',
    tab: 'damage',
    subTab: 'ratio',
    label: '1/16 切り捨て（天候）',
    sources: 'すなあらし',
    kind: 'damage',
    amount: { type: 'ratio', num: 1, den: 16, rounding: 'floor' },
    timing: 'turnEnd',
    order: TURN_END_ORDER.weather,
    defaultCount: 'all',
  },
  {
    key: 'burn',
    tab: 'damage',
    subTab: 'ratio',
    label: '1/16 切り捨て（やけど）',
    sources: 'やけど',
    kind: 'damage',
    amount: { type: 'ratio', num: 1, den: 16, rounding: 'floor' },
    timing: 'turnEnd',
    order: TURN_END_ORDER.burn,
    defaultCount: 'all',
  },
  {
    key: 'saltCure',
    tab: 'damage',
    subTab: 'ratio',
    label: '1/8 切り捨て（しおづけ）',
    sources: 'しおづけ（みず/はがねは 1/4）',
    kind: 'damage',
    amount: { type: 'ratio', num: 1, den: 8, rounding: 'floor' },
    timing: 'turnEnd',
    order: TURN_END_ORDER.saltCure,
    defaultCount: 'all',
  },
  {
    key: 'saltCureWeak',
    tab: 'damage',
    subTab: 'ratio',
    label: '1/4 切り捨て（しおづけ 水/鋼）',
    sources: 'しおづけ（対象がみず/はがね）',
    kind: 'damage',
    amount: { type: 'ratio', num: 1, den: 4, rounding: 'floor' },
    timing: 'turnEnd',
    order: TURN_END_ORDER.saltCure,
    defaultCount: 'all',
  },
  {
    key: 'lifeOrb',
    tab: 'damage',
    subTab: 'ratio',
    label: '1/10 切り捨て（攻撃ごと）',
    sources: 'いのちのたま',
    kind: 'damage',
    amount: { type: 'ratio', num: 1, den: 10, rounding: 'floor' },
    timing: 'perAttack',
    order: TURN_END_ORDER.custom,
    defaultCount: 'all',
  },
  {
    key: 'poison',
    tab: 'damage',
    subTab: 'ratio',
    label: '1/8 切り捨て（どく）',
    sources: 'どく / くろいヘドロ(非どく)',
    kind: 'damage',
    amount: { type: 'ratio', num: 1, den: 8, rounding: 'floor' },
    timing: 'turnEnd',
    order: TURN_END_ORDER.poison,
    defaultCount: 'all',
  },
  {
    key: 'leechSeed',
    tab: 'damage',
    subTab: 'ratio',
    label: '1/8 切り捨て（やどりぎ）',
    sources: 'やどりぎのタネ（反対側が同量回復）',
    kind: 'leechSeed',
    amount: { type: 'ratio', num: 1, den: 8, rounding: 'floor' },
    timing: 'turnEnd',
    order: TURN_END_ORDER.leechSeed,
    defaultCount: 'all',
  },
  {
    key: 'bind',
    tab: 'damage',
    subTab: 'ratio',
    label: '1/8 切り捨て（バインド）',
    sources: 'しめつける / うずしお / ほのおのうず 等',
    kind: 'damage',
    amount: { type: 'ratio', num: 1, den: 8, rounding: 'floor' },
    timing: 'turnEnd',
    order: TURN_END_ORDER.bind,
    defaultCount: 'all',
  },
  {
    key: 'bindBand',
    tab: 'damage',
    subTab: 'ratio',
    label: '1/6 切り捨て（バインド強化）',
    sources: 'バインド系（しめつけバンド）',
    kind: 'damage',
    amount: { type: 'ratio', num: 1, den: 6, rounding: 'floor' },
    timing: 'turnEnd',
    order: TURN_END_ORDER.bind,
    defaultCount: 'all',
  },
  {
    key: 'curse',
    tab: 'damage',
    subTab: 'ratio',
    label: '1/4 切り捨て（のろい）',
    sources: 'のろい（ゴースト）',
    kind: 'damage',
    amount: { type: 'ratio', num: 1, den: 4, rounding: 'floor' },
    timing: 'turnEnd',
    order: TURN_END_ORDER.curse,
    defaultCount: 'all',
  },
  // ---------- 定数ダメ / もうどく ----------
  {
    key: 'toxic',
    tab: 'damage',
    subTab: 'toxic',
    label: 'もうどく (k/16 累進)',
    sources: '1ターン目 1/16 → 2ターン目 2/16 → …（上限 15/16）',
    kind: 'damage',
    amount: { type: 'toxic' },
    timing: 'turnEnd',
    order: TURN_END_ORDER.poison,
    defaultCount: 'all',
  },
  // ---------- 回復 / 割合 ----------
  {
    key: 'leftovers',
    tab: 'recover',
    subTab: 'ratio',
    label: '1/16 切り捨て',
    sources: 'たべのこし / くろいヘドロ(どく) / グラスフィールド',
    kind: 'recover',
    amount: { type: 'ratio', num: 1, den: 16, rounding: 'floor' },
    timing: 'turnEnd',
    order: TURN_END_ORDER.itemHeal,
    defaultCount: 'all',
  },
  {
    key: 'grassyTerrain',
    tab: 'recover',
    subTab: 'ratio',
    label: '1/16 切り捨て（フィールド）',
    sources: 'グラスフィールド（地面にいる側）',
    kind: 'recover',
    amount: { type: 'ratio', num: 1, den: 16, rounding: 'floor' },
    timing: 'turnEnd',
    order: TURN_END_ORDER.grassyTerrain,
    defaultCount: 'all',
  },
  {
    key: 'poisonHeal',
    tab: 'recover',
    subTab: 'ratio',
    label: '1/8 切り捨て',
    sources: 'ポイズンヒール',
    kind: 'recover',
    amount: { type: 'ratio', num: 1, den: 8, rounding: 'floor' },
    timing: 'turnEnd',
    order: TURN_END_ORDER.itemHeal,
    defaultCount: 'all',
  },
  {
    key: 'aquaRing',
    tab: 'recover',
    subTab: 'ratio',
    label: '1/16 切り捨て（アクアリング）',
    sources: 'アクアリング / ねをはる',
    kind: 'recover',
    amount: { type: 'ratio', num: 1, den: 16, rounding: 'floor' },
    timing: 'turnEnd',
    order: TURN_END_ORDER.aquaRing,
    defaultCount: 'all',
  },
  // ---------- 回復 / 単発（時系列へ追加） ----------
  {
    key: 'recover50',
    tab: 'recover',
    subTab: 'oneShot',
    label: '1/2 切り捨て',
    sources: 'じこさいせい / はねやすめ / なまける / ねがいごと',
    kind: 'recover',
    amount: { type: 'ratio', num: 1, den: 2, rounding: 'floor' },
    timing: 'turnEnd',
    order: TURN_END_ORDER.custom,
    defaultCount: 1,
  },
  {
    key: 'synthesisNormal',
    tab: 'recover',
    subTab: 'oneShot',
    label: '1/2 五捨五超入',
    sources: 'こうごうせい / つきのひかり / あさのひざし（通常）',
    kind: 'recover',
    amount: { type: 'ratio', num: 1, den: 2, rounding: 'roundHalfDown' },
    timing: 'turnEnd',
    order: TURN_END_ORDER.custom,
    defaultCount: 1,
  },
  {
    key: 'synthesisSun',
    tab: 'recover',
    subTab: 'oneShot',
    label: '2/3 五捨五超入',
    sources: 'こうごうせい / つきのひかり / あさのひざし（はれ）',
    kind: 'recover',
    amount: { type: 'ratio', num: 2, den: 3, rounding: 'roundHalfDown' },
    timing: 'turnEnd',
    order: TURN_END_ORDER.custom,
    defaultCount: 1,
  },
  {
    key: 'synthesisWeather',
    tab: 'recover',
    subTab: 'oneShot',
    label: '1/4 五捨五超入',
    sources: 'こうごうせい / つきのひかり / あさのひざし（雨・砂・雪）',
    kind: 'recover',
    amount: { type: 'ratio', num: 1, den: 4, rounding: 'roundHalfDown' },
    timing: 'turnEnd',
    order: TURN_END_ORDER.custom,
    defaultCount: 1,
  },
  {
    key: 'regenerator',
    tab: 'recover',
    subTab: 'oneShot',
    label: '1/3 切り捨て',
    sources: 'さいせいりょく（交代時）',
    kind: 'recover',
    amount: { type: 'ratio', num: 1, den: 3, rounding: 'floor' },
    timing: 'turnEnd',
    order: TURN_END_ORDER.custom,
    defaultCount: 1,
  },
]

export function findPassivePreset(key: string): PassivePreset | undefined {
  return PASSIVE_PRESETS.find((p) => p.key === key)
}

// ---------------------------------------------------------------------------
// 量の解決
// ---------------------------------------------------------------------------

export function applyRounding(value: number, rounding: Rounding): number {
  switch (rounding) {
    case 'floor':
      return Math.floor(value)
    case 'ceil':
      return Math.ceil(value)
    case 'round':
      return Math.floor(value + 0.5)
    case 'roundHalfDown': {
      // 五捨五超入: 小数部がちょうど 0.5 なら切り捨て、0.5 を超えるなら切り上げ
      const f = Math.floor(value)
      const frac = value - f
      return frac > 0.5 + 1e-9 ? f + 1 : f
    }
  }
}

export interface ResolveAmountContext {
  /** 効果を受ける側の最大HP */
  targetMaxHp: number
  /** 効果を受ける側のタイプ（ステルスロック用） */
  targetTypes: TypeName[]
  /** もうどくの適用回数（1 始まり）。amount.type==='toxic' 以外では無視 */
  toxicCounter?: number
}

/** 常時効果 1 回分の実量（正の整数、最低 1）を解決する */
export function resolvePassiveAmount(amount: PassiveAmount, ctx: ResolveAmountContext): number {
  switch (amount.type) {
    case 'fixed':
      return Math.max(0, Math.floor(amount.value))
    case 'ratio':
      return Math.max(1, applyRounding((ctx.targetMaxHp * amount.num) / amount.den, amount.rounding))
    case 'stealthRock': {
      const eff = getTypeEffectiveness('いわ', ctx.targetTypes)
      return Math.max(1, Math.floor((ctx.targetMaxHp * eff) / 8))
    }
    case 'toxic': {
      const k = Math.min(15, Math.max(1, ctx.toxicCounter ?? 1))
      return Math.max(1, Math.floor((ctx.targetMaxHp * k) / 16))
    }
  }
}

// ---------------------------------------------------------------------------
// ターン境界
// ---------------------------------------------------------------------------

/** ターン境界計算に必要な最小のイベント形 */
export interface TurnEventLike {
  id: string
  kind: string
  usages?: number
}

export interface TurnRange {
  eventId: string
  /** このイベントが属する最初のターン（0 = 開始時、最初のターン開始イベントより前） */
  startTurn: number
  /** このイベントが属する最後のターン（attack は usages 分だけ連続する） */
  endTurn: number
  /** このイベントがターンを開始するか（attack / setupTurn） */
  startsTurn: boolean
}

export function isTurnStartKind(kind: string): boolean {
  return kind === 'attack' || kind === 'setupTurn'
}

/**
 * 各イベントのターン範囲を計算する。
 * attack(usages=3) が最初にあれば startTurn=1, endTurn=3。続く incoming は 3/3。
 * その後の setupTurn は 4/4。先頭の defenderConst などは 0/0。
 */
export function computeTurnRanges(events: TurnEventLike[]): TurnRange[] {
  let turn = 0
  const out: TurnRange[] = []
  for (const ev of events) {
    if (ev.kind === 'attack') {
      const n = Math.max(1, ev.usages ?? 1)
      const startTurn = turn + 1
      turn += n
      out.push({ eventId: ev.id, startTurn, endTurn: turn, startsTurn: true })
    } else if (ev.kind === 'setupTurn') {
      turn += 1
      out.push({ eventId: ev.id, startTurn: turn, endTurn: turn, startsTurn: true })
    } else {
      out.push({ eventId: ev.id, startTurn: turn, endTurn: turn, startsTurn: false })
    }
  }
  return out
}

/** 時系列の総ターン数（ターン開始イベントの合計。attack は usages 分） */
export function countTurns(events: TurnEventLike[]): number {
  const ranges = computeTurnRanges(events)
  return ranges.length === 0 ? 0 : ranges[ranges.length - 1].endTurn
}
