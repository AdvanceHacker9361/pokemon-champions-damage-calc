export type KoResult =
  | { type: 'guaranteed'; hits: number }
  | { type: 'chance'; hits: number; probability: number }
  | { type: 'no-ko' }

export interface DamageResult {
  /** 16段階乱数ロール（85%〜100%の各値） */
  rolls: [
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
  ]
  min: number
  max: number
  defenderMaxHp: number
  percentMin: number
  percentMax: number
  koResult: KoResult
}

export function calcRollPercent(roll: number, defenderMaxHp: number): number {
  if (defenderMaxHp === 0) return 0
  return Math.round((roll / defenderMaxHp) * 1000) / 10
}
