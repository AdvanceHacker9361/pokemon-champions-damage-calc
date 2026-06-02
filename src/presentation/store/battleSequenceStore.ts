import { create } from 'zustand'

export type SeqStepKind =
  | 'attack'           // 攻撃側の技 → 防御側へダメージ
  | 'incoming'         // 防御側の技 → 攻撃側へダメージ（被ダメ、攻守入替で自動計算）
  | 'painSplit'        // 痛み分け
  | 'defenderConst'    // 防御側への定数ダメージ（火傷・砂など）
  | 'attackerConst'    // 攻撃側への定数ダメージ
  | 'defenderRecover'  // 防御側の定数回復
  | 'attackerRecover'  // 攻撃側の定数回復（残飯など）

export interface SeqStep {
  id: string
  kind: SeqStepKind
  /** attack: 攻撃側の技名 / incoming: 防御側の技名 */
  moveName?: string | null
  /** attack/incoming: 急所で計算するか */
  crit?: boolean
  /** const/recover: 1回あたりのHP量 */
  amount?: number
}

interface BattleSequenceStore {
  enabled: boolean
  steps: SeqStep[]
  /** 攻撃側の開始HP（null = 最大HP） */
  attackerStartHp: number | null
  /** 防御側の開始HP（null = 最大HP） */
  defenderStartHp: number | null

  setEnabled: (v: boolean) => void
  addStep: (step: Omit<SeqStep, 'id'>) => void
  removeStep: (id: string) => void
  updateStep: (id: string, patch: Partial<Omit<SeqStep, 'id'>>) => void
  moveStep: (id: string, dir: -1 | 1) => void
  clear: () => void
  setAttackerStartHp: (v: number | null) => void
  setDefenderStartHp: (v: number | null) => void
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const useBattleSequenceStore = create<BattleSequenceStore>(set => ({
  enabled: false,
  steps: [],
  attackerStartHp: null,
  defenderStartHp: null,

  setEnabled: (v) => set({ enabled: v }),
  addStep: (step) => set(s => ({
    steps: [...s.steps, { ...step, id: genId() }],
  })),
  removeStep: (id) => set(s => ({ steps: s.steps.filter(st => st.id !== id) })),
  updateStep: (id, patch) => set(s => ({
    steps: s.steps.map(st => st.id === id ? { ...st, ...patch } : st),
  })),
  moveStep: (id, dir) => set(s => {
    const idx = s.steps.findIndex(st => st.id === id)
    if (idx < 0) return s
    const target = idx + dir
    if (target < 0 || target >= s.steps.length) return s
    const steps = [...s.steps]
    const [moved] = steps.splice(idx, 1)
    steps.splice(target, 0, moved)
    return { steps }
  }),
  clear: () => set({ steps: [], attackerStartHp: null, defenderStartHp: null }),
  setAttackerStartHp: (v) => set({ attackerStartHp: v === null ? null : Math.max(0, Math.floor(v)) }),
  setDefenderStartHp: (v) => set({ defenderStartHp: v === null ? null : Math.max(0, Math.floor(v)) }),
}))
