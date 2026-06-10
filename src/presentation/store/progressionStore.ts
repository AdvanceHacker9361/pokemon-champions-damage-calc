import { create } from 'zustand'

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
}

/** イベント種別ごとの payload */
export type ProgressionEvent =
  | ({ kind: 'attack'; id: string } & AttackPayload)
  /** 痛み分け（防御側のみ平均化、攻撃側HPは入力値） */
  | { kind: 'painSplit'; id: string; attackerHp: number }
  /** 被ダメ（防御側の技を攻守入替で自動計算） */
  | { kind: 'incoming'; id: string; moveName: string | null; crit: boolean }
  /** 定数イベント */
  | { kind: 'defenderConst'; id: string; amount: number }
  | { kind: 'attackerConst'; id: string; amount: number }
  | { kind: 'defenderRecover'; id: string; amount: number }
  | { kind: 'attackerRecover'; id: string; amount: number }
  /** きのみ再装填（リサイクル等）。直後の与ダメで再びきのみが発動できる */
  | { kind: 'rearmBerry'; id: string }
  /**
   * 宿り木のタネ1ティック。
   * direction='fromAttacker': 攻撃側が植え主 → 防御側-1/8(防御側最大HP)、攻撃側+同量
   * direction='fromDefender': 防御側が植え主 → 攻撃側-1/8(攻撃側最大HP)、防御側+同量
   */
  | { kind: 'leechSeed'; id: string; direction: 'fromAttacker' | 'fromDefender' }

export type EventKind = ProgressionEvent['kind']

/** discriminated union を維持しつつ id を除いた入力型 */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never
export type ProgressionEventInput = DistributiveOmit<ProgressionEvent, 'id'>

interface ProgressionStore {
  /** イベント時系列。順序がそのままシミュレーション順 */
  events: ProgressionEvent[]
  /** 背景効果オフセット（イベントとは独立） */
  constDmg: number
  /** 定数回復: 各与ダメ攻撃の直後に毎回適用（たべのこし/黒ヘド等） */
  constRec: number
  /** オボン/混乱実回復: 防御側HPがしきい値以下になった時点で1回限り適用 */
  constRecBerry: number
  /** オボン/混乱実の発動しきい値（HP%。オボン=50, 混乱実=25） */
  constRecBerryThresholdPct: number
  /** はんすう: きのみ発動後、次のターン終了時にもう一度発動 */
  berryCudChew: boolean
  /** しゅうかく/ものひろい: 各ターン終了時にこの確率で再装填（0=なし, 0.5, 1=晴れ/ものひろい） */
  berryHarvestChance: number
  poisonTurns: number
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

  // 背景効果
  setConstDmg: (v: number) => void
  setConstRec: (v: number) => void
  setConstRecBerry: (v: number) => void
  setConstRecBerryThresholdPct: (v: number) => void
  setBerryCudChew: (v: boolean) => void
  setBerryHarvestChance: (v: number) => void
  setPoisonTurns: (n: number) => void
  setAttackerStartHp: (v: number | null) => void
  setDefenderStartHp: (v: number | null) => void

  /** 全消去（背景効果・開始HPも含む） */
  clear: () => void
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const useProgressionStore = create<ProgressionStore>(set => ({
  events: [],
  constDmg: 0,
  constRec: 0,
  constRecBerry: 0,
  constRecBerryThresholdPct: 50,
  berryCudChew: false,
  berryHarvestChance: 0,
  poisonTurns: 0,
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

  setConstDmg: (v) => set({ constDmg: Math.max(0, Math.floor(v)) }),
  setConstRec: (v) => set({ constRec: Math.max(0, Math.floor(v)) }),
  setConstRecBerry: (v) => set({ constRecBerry: Math.max(0, Math.floor(v)) }),
  setConstRecBerryThresholdPct: (v) => set({ constRecBerryThresholdPct: Math.max(1, Math.min(100, Math.floor(v))) }),
  setBerryCudChew: (v) => set({ berryCudChew: v }),
  setBerryHarvestChance: (v) => set({ berryHarvestChance: Math.max(0, Math.min(1, v)) }),
  setPoisonTurns: (n) => set({ poisonTurns: Math.max(0, Math.min(10, Math.floor(n))) }),
  setAttackerStartHp: (v) => set({ attackerStartHp: v === null ? null : Math.max(0, Math.floor(v)) }),
  setDefenderStartHp: (v) => set({ defenderStartHp: v === null ? null : Math.max(0, Math.floor(v)) }),

  clear: () => set({
    events: [],
    constDmg: 0, constRec: 0, constRecBerry: 0, constRecBerryThresholdPct: 50,
    berryCudChew: false, berryHarvestChance: 0, poisonTurns: 0,
    attackerStartHp: null, defenderStartHp: null,
  }),
}))

/** 攻撃側に影響するイベントがあるか（シーケンス出力＝生存率・各ステップHPを表示するか判定用） */
export function hasSequenceImpact(s: Pick<ProgressionStore, 'events' | 'attackerStartHp'>): boolean {
  if (s.attackerStartHp !== null) return true
  return s.events.some(e =>
    e.kind === 'incoming' || e.kind === 'attackerConst' ||
    e.kind === 'attackerRecover' || e.kind === 'painSplit'
  )
}
