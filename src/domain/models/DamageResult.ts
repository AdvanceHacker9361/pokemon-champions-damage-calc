export type KoResult =
  | { type: 'guaranteed'; hits: number }
  | { type: 'chance'; hits: number; probability: number }
  | { type: 'no-ko' }

export interface DamageResult {
  /** Champions仕様: 16段階乱数ロール（85%〜100%の各値） */
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
  /**
   * 実際に計算へ使用した「基本威力」。
   * けたぐり・ヘビーボンバー・ジャイロボール・アシストパワー・からげんき・ウェザーボール等、
   * 計算時に決まる威力を UI へ伝えるためのフィールド。
   * じゅうでん / メトロノーム / Gのちから の倍率は含まない。
   */
  basePower: number
}

export function calcRollPercent(roll: number, defenderMaxHp: number): number {
  if (defenderMaxHp === 0) return 0
  return Math.round((roll / defenderMaxHp) * 1000) / 10
}
