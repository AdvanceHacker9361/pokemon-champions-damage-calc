import { create } from 'zustand'
import type { PassiveEffect, PassiveTab } from '@/domain/models/PassiveEffect'
import { pinPassiveEffects as pinPassiveEffectsPure } from '@/domain/calculators/PassiveEffectPinning'
import type { PassiveExpansionContext } from '@/domain/calculators/PassiveEffectExpansion'

/**
 * 攻撃イベント（旧 AccumEntry）。事前計算済みロールを保持。
 * `+加算` ボタンで生成される攻撃側の技の1使用分。
 */
export interface AttackPayload {
  label: string
  /** 技名（吸収率などの技データ参照用。label はポケモン名等を含む表示用文字列のため別持ち） */
  moveName?: string
  /** マルチスケイル等が発動した状態のロール（1回分） */
  rolls: number[]
  /** HP満タン特性なしの素ダメロール（hadMultiscale=false のときは rolls と同値） */
  rawRolls: number[]
  /** 使用回数 1〜9（連続して同じ条件で当てる場合は usages を増やす） */
  usages: number
  minDmg: number
  maxDmg: number
  rawMin: number
  rawMax: number
  defenderMaxHp: number
  /** 1発目のみマルチスケイル/半減実が発動していたか */
  hadMultiscale: boolean

  critRolls: number[]
  rawCritRolls: number[]
  critMin: number
  critMax: number
  rawCritMin: number
  rawCritMax: number
  /** 急所率 (0=1/24, 1/8=高急所技, 1.0=確定急所/急所強制) */
  critChance: number
  /** 急所強制エントリ（再混合せず rolls をそのまま使う） */
  isForcedCrit: boolean

  /** おやこあい: 親・子を独立スロットに分割 */
  pbParentRolls?: number[]
  pbParentCritRolls?: number[]
  pbParentRawRolls?: number[]
  pbParentRawCritRolls?: number[]
  pbChildRolls?: number[]
  pbChildCritRolls?: number[]

  /** 変動連続技のヒット数分布 */
  variableHitDist?: { hits: number; prob: number }[]
  /** ばけのかわ等により、このイベントの最初の使用だけ1発目が無効になる */
  firstHitNullified?: boolean
  /** このイベントの最初の使用だけ加算する固定ダメージ（ばけのかわ解除時など） */
  firstHitFixedDamage?: number
}

/** イベント種別ごとの payload */
export type ProgressionEvent =
  | ({ kind: 'attack'; id: string } & AttackPayload)
  /**
   * 痛み分け。両者のHPを平均化する。
   * `attackerHp` は旧「累積時HP」手入力の名残で、計算には使わない（保存済みセッションの
   * 復元互換のためフィールドだけ残している）。累積・シーケンスとも追跡中のHPで平均化する。
   */
  | { kind: 'painSplit'; id: string; attackerHp: number }
  /** 被ダメ（防御側の技を攻守入替で自動計算） */
  | { kind: 'incoming'; id: string; moveName: string | null; crit: boolean }
  /** ダメージを伴わない補助技・積み技ターン。ターン経過だけを時系列へ明示する */
  | { kind: 'setupTurn'; id: string; side: 'attacker' | 'defender'; label?: string }
  /** メガシンカのタイミング。以降の動的な被ダメ計算でメガ後ステータスを使う */
  | { kind: 'megaEvolve'; id: string; side: 'attacker' | 'defender'; megaKey: string }
  /** 定数イベント。label/source は背景プリセット由来の表示用メタ情報 */
  | { kind: 'defenderConst'; id: string; amount: number; label?: string; source?: 'manual' | 'background' | 'pinned' }
  | { kind: 'attackerConst'; id: string; amount: number; label?: string; source?: 'manual' | 'background' | 'pinned' }
  | { kind: 'defenderRecover'; id: string; amount: number; label?: string; source?: 'manual' | 'background' | 'pinned' }
  | { kind: 'attackerRecover'; id: string; amount: number; label?: string; source?: 'manual' | 'background' | 'pinned' }
  /** きのみ再装填（リサイクル等）。直後のHP減少で再びその側のきのみが発動できる */
  | { kind: 'rearmBerry'; id: string; side: 'attacker' | 'defender' }
  /**
   * 宿り木のタネ1ティック。
   * direction='fromAttacker': 攻撃側が植え主 → 防御側-1/8(防御側最大HP)、攻撃側+同量
   * direction='fromDefender': 防御側が植え主 → 攻撃側-1/8(攻撃側最大HP)、防御側+同量
   */
  | {
      kind: 'leechSeed'
      id: string
      direction: 'fromAttacker' | 'fromDefender'
      /** 1ティックの実量。未指定なら被ダメ側の最大HP/8（固定化で実量が入る） */
      amount?: number
      label?: string
      source?: 'manual' | 'pinned'
    }

/** きのみ設定の対象側 */
export type BerrySide = 'attacker' | 'defender'

/**
 * 片側のきのみ（オボン/混乱実）設定。
 * - amount: 回復量（0 = きのみなし）
 * - thresholdPct: 発動しきい値（その側の最大HP%。オボン=50, 混乱実=25）
 * - cudChew: はんすう（発動後、次のターン終了時にもう一度発動）
 * - harvestChance: しゅうかく/ものひろい（各ターン終了時にこの確率で再装填。0 / 0.5 / 1）
 */
export interface BerryConfig {
  amount: number
  thresholdPct: number
  cudChew: boolean
  harvestChance: number
}

export function defaultBerryConfig(): BerryConfig {
  return { amount: 0, thresholdPct: 50, cudChew: false, harvestChance: 0 }
}

/** 入力値を許容範囲へ丸める（amount≥0 / thresholdPct 1〜100 / harvestChance 0〜1） */
export function normalizeBerryConfig(c: BerryConfig): BerryConfig {
  return {
    amount: Math.max(0, Math.floor(c.amount)),
    thresholdPct: Math.max(1, Math.min(100, Math.floor(c.thresholdPct))),
    cudChew: c.cudChew,
    harvestChance: Math.max(0, Math.min(1, c.harvestChance)),
  }
}

export type EventKind = ProgressionEvent['kind']

/** discriminated union を維持しつつ id を除いた入力型 */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never
export type ProgressionEventInput = DistributiveOmit<ProgressionEvent, 'id'>

interface ProgressionStore {
  /** イベント時系列。順序がそのままシミュレーション順 */
  events: ProgressionEvent[]
  /**
   * 常時効果（V3.18.0）。カタログ行から積み上げ、フック層がターン境界へ自動展開する。
   * 配列順は同一 order 内の適用順を兼ねる。
   */
  passiveEffects: PassiveEffect[]
  /** 防御側のきのみ設定（オボン/混乱実） */
  defenderBerry: BerryConfig
  /** 攻撃側のきのみ設定（V3.18.1） */
  attackerBerry: BerryConfig
  /** 開始HP（null = 最大HP）。シーケンス出力時に使用 */
  attackerStartHp: number | null
  defenderStartHp: number | null

  // 攻撃イベント（旧 addEntry）
  addAttack: (payload: AttackPayload) => void
  setAttackUsages: (id: string, usages: number) => void

  // イベント全般
  removeEvent: (id: string) => void
  moveEvent: (id: string, dir: -1 | 1) => void
  /** 既存イベントの直後に挿入（attack の直後に painSplit 等）。targetId=null なら末尾追加 */
  addEventAfter: (targetId: string | null, ev: ProgressionEventInput) => void
  /** 既存イベントを更新（painSplit の attackerHp、incoming の moveName/crit、const の amount 等） */
  updateEvent: (id: string, patch: Partial<ProgressionEvent>) => void

  // 常時効果
  /** 常時効果を追加し、生成した id を返す */
  addPassiveEffect: (e: Omit<PassiveEffect, 'id'>) => string
  updatePassiveEffect: (id: string, patch: Partial<Omit<PassiveEffect, 'id'>>) => void
  removePassiveEffect: (id: string) => void
  /** タブ指定なしで全消去。'damage' は damage/leechSeed、'recover' は recover を消去 */
  clearPassiveEffects: (tab?: PassiveTab) => void
  /**
   * 指定した常時効果を「固定化」する。自動展開されている位置そのままの手動イベントへ
   * 変換し、その常時効果をカタログから取り除く（数値は変わらない）。
   * 追加されたイベントの id を返す。
   */
  pinPassiveEffects: (effectIds: string[], ctx: PassiveExpansionContext) => string[]
  /** すべての常時効果を固定化する */
  pinAllPassiveEffects: (ctx: PassiveExpansionContext) => string[]

  // きのみ（オボン/混乱実）設定
  /** 片側のきのみ設定を部分更新する */
  setBerry: (side: BerrySide, patch: Partial<BerryConfig>) => void
  setAttackerStartHp: (v: number | null) => void
  setDefenderStartHp: (v: number | null) => void

  /** 全消去（常時効果・きのみ設定・開始HPも含む） */
  clear: () => void
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const useProgressionStore = create<ProgressionStore>((set, get) => ({
  events: [],
  passiveEffects: [],
  defenderBerry: defaultBerryConfig(),
  attackerBerry: defaultBerryConfig(),
  attackerStartHp: null,
  defenderStartHp: null,

  addAttack: (payload) => set(s => ({
    events: [...s.events, {
      kind: 'attack',
      id: genId(),
      ...payload,
      usages: payload.usages ?? 1,
    }],
  })),

  setAttackUsages: (id, usages) => set(s => ({
    events: s.events.map(e =>
      e.kind === 'attack' && e.id === id
        ? { ...e, usages: Math.max(1, Math.min(9, Math.floor(usages))) }
        : e
    ),
  })),

  removeEvent: (id) => set(s => ({
    events: s.events.filter(e => e.id !== id),
  })),

  moveEvent: (id, dir) => set(s => {
    const idx = s.events.findIndex(e => e.id === id)
    if (idx < 0) return s
    const target = idx + dir
    if (target < 0 || target >= s.events.length) return s
    const events = [...s.events]
    const [moved] = events.splice(idx, 1)
    events.splice(target, 0, moved)
    return { events }
  }),

  addEventAfter: (targetId, ev) => set(s => {
    const newEv = { ...ev, id: genId() } as ProgressionEvent
    if (targetId === null) {
      return { events: [...s.events, newEv] }
    }
    const idx = s.events.findIndex(e => e.id === targetId)
    if (idx < 0) return { events: [...s.events, newEv] }
    const events = [...s.events]
    events.splice(idx + 1, 0, newEv)
    return { events }
  }),

  updateEvent: (id, patch) => set(s => ({
    events: s.events.map(e => {
      if (e.id !== id) return e
      // kind は変更不可、id は不変
      const { kind: _k, id: _i, ...rest } = patch as Record<string, unknown>
      void _k; void _i
      return { ...e, ...rest } as ProgressionEvent
    }),
  })),

  addPassiveEffect: (e) => {
    const id = genId()
    set(s => ({ passiveEffects: [...s.passiveEffects, { ...e, id }] }))
    return id
  },

  updatePassiveEffect: (id, patch) => set(s => ({
    passiveEffects: s.passiveEffects.map(p => (p.id === id ? { ...p, ...patch, id: p.id } : p)),
  })),

  removePassiveEffect: (id) => set(s => ({
    passiveEffects: s.passiveEffects.filter(p => p.id !== id),
  })),

  clearPassiveEffects: (tab) => set(s => ({
    passiveEffects: tab === undefined
      ? []
      : s.passiveEffects.filter(p => !(tab === 'damage'
          ? (p.kind === 'damage' || p.kind === 'leechSeed')
          : p.kind === 'recover')),
  })),

  pinPassiveEffects: (effectIds, ctx) => {
    const inserted: string[] = []
    set(s => {
      const before = new Set(s.events.map(e => e.id))
      const res = pinPassiveEffectsPure(s.events, s.passiveEffects, effectIds, ctx, genId)
      if (res.removedEffectIds.length === 0) return s
      const removed = new Set(res.removedEffectIds)
      const events = res.events as ProgressionEvent[]
      for (const e of events) if (!before.has(e.id)) inserted.push(e.id)
      return {
        events,
        passiveEffects: s.passiveEffects.filter(p => !removed.has(p.id)),
      }
    })
    return inserted
  },

  pinAllPassiveEffects: (ctx) => get().pinPassiveEffects(get().passiveEffects.map(p => p.id), ctx),

  setBerry: (side, patch) => set(s => side === 'attacker'
    ? { attackerBerry: normalizeBerryConfig({ ...s.attackerBerry, ...patch }) }
    : { defenderBerry: normalizeBerryConfig({ ...s.defenderBerry, ...patch }) }
  ),
  setAttackerStartHp: (v) => set({ attackerStartHp: v === null ? null : Math.max(0, Math.floor(v)) }),
  setDefenderStartHp: (v) => set({ defenderStartHp: v === null ? null : Math.max(0, Math.floor(v)) }),

  clear: () => set({
    events: [],
    passiveEffects: [],
    defenderBerry: defaultBerryConfig(),
    attackerBerry: defaultBerryConfig(),
    attackerStartHp: null, defenderStartHp: null,
  }),
}))

/**
 * 攻撃側に影響するイベント・常時効果があるか（シーケンス出力＝生存率・各ステップHPを表示するか判定用）。
 */
export function hasSequenceImpact(
  s: Pick<ProgressionStore, 'events' | 'attackerStartHp' | 'passiveEffects'> &
     Partial<Pick<ProgressionStore, 'attackerBerry'>>
): boolean {
  if (s.attackerStartHp !== null) return true
  // 攻撃側のきのみは攻撃側HPを動かすためシーケンス出力の対象
  if ((s.attackerBerry?.amount ?? 0) > 0) return true
  // 攻撃側の常時効果・やどりぎ（相手側HPも動く）はシーケンス出力の対象
  if (s.passiveEffects.some(p => p.side === 'attacker' || p.kind === 'leechSeed')) return true
  return s.events.some(e =>
    e.kind === 'incoming' || e.kind === 'attackerConst' ||
    e.kind === 'attackerRecover' || e.kind === 'defenderConst' ||
    e.kind === 'defenderRecover' || e.kind === 'painSplit' ||
    e.kind === 'setupTurn' || e.kind === 'megaEvolve' ||
    // 宿り木は両者のHPを動かすため、攻守シミュレーションの対象
    e.kind === 'leechSeed'
  )
}
