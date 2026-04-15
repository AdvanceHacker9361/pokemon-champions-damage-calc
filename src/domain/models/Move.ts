import type { TypeName, MoveCategory } from '@/domain/models/Pokemon'

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
}
