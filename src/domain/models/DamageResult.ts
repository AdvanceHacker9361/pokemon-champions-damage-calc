export type KoResult =
  | { type: 'guaranteed'; hits: number }
  | { type: 'chance'; hits: number; probability: number }
  | { type: 'no-ko' }

export interface DamageResult {
  /** Champions仕様: 15段階乱数ロール（86%〜100%の各値、85%は出現しない） */
  rolls: [
    number, number, number, number, number,
    number, number, number, number, number,
    number, number, number, number, number,
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
