import type { TypeName, MoveCategory, StatKey } from '@/domain/models/Pokemon'

/**
 * 連続技の回数データ
 * - fixed: 常に count 回ヒット（ダブルキック=2、すいりゅうれんだ=3 等）
 * - variable: 2〜5回ランダム（P(2)=1/3, P(3)=1/3, P(4)=1/6, P(5)=1/6）
 */
export type MultiHitData =
  | { type: 'fixed'; count: number }
  | { type: 'variable' }

export type SpecialMoveTag =
  | 'foul-play'     // イカサマ: 相手のAを使用
  | 'body-press'    // ボディプレス: 自分のBで攻撃
  | 'photon-geyser' // フォトンゲイザー: max(A,C)で判定
  | 'psyshock'      // サイコショック/サイコブレイク: 特殊技だが相手のBで計算
  | 'gyro-ball'     // ジャイロボール: 威力 = min(150, floor(25 * defSpe / atkSpe))
  | 'grass-knot'    // くさむすび/けたぐり: 体重依存威力
  | 'low-kick'
  | 'hex'           // たたりめ: 状態異常時威力2倍
  | 'facade'        // からげんき: 状態異常時威力140
  | 'stealth-rock'  // ステルスロック: タイプ相性依存定数ダメージ
  | 'freeze-dry'    // フリーズドライ: みず タイプに対して2倍有効
  | 'weather-ball'  // ウェザーボール: 天候でタイプと威力が変化
  | 'knock-off'     // はたきおとす: 相手が持ち物を持っている場合威力1.5倍
  | 'stored-power'  // アシストパワー: ランク上昇分で威力増加
  | 'reversal'      // きしかいせい: HPが少ないほど威力増加
  | 'heavy-slam'    // ヘビーボンバー: 攻撃側/防御側の体重比で威力変化

export interface MoveFlags {
  contact: boolean
  sound: boolean
  bullet: boolean
  pulse: boolean
  punch: boolean
  bite: boolean
  slice: boolean
  recoil?: boolean
}

export interface MoveData {
  name: string
  nameEn: string
  type: TypeName
  category: MoveCategory
  power: number | null
  accuracy: number | null
  pp: 8 | 12 | 16 | 20
  priority: number
  flags: MoveFlags
  special: SpecialMoveTag | null
  /** 連続技データ（null = 単発技） */
  multiHit?: MultiHitData | null
  /** 可変威力の選択肢（おはかまいり等） */
  powerOptions?: number[]
  /** 使用後の自ステータス低下（りゅうせいぐん=spa-2 等） */
  selfStatDrop?: { stat: StatKey; stages: number }
}
