/**
 * 仕様書記載のテストベクタ（Pokemon Champions）
 * これらの値はゲーム内計算と一致することを確認済み
 */

export const STAT_TEST_CASES = [
  // { pokemonName, stat, base, sp, nature, natureModifier, expected }
  // ガブリアス いじっぱり (A↑ C↓)
  { label: 'ガブリアス HP (sp=2)',      base: 108, sp: 2,  natureModifier: 1.0, isHP: true,  expected: 184 },
  { label: 'ガブリアス A (sp=32, いじっぱり)', base: 130, sp: 32, natureModifier: 1.1, isHP: false, expected: 200 },
  { label: 'ガブリアス S (sp=32, いじっぱり)', base: 102, sp: 32, natureModifier: 1.0, isHP: false, expected: 154 },
  // メガゲンガー おくびょう (S↑ A↓)
  { label: 'メガゲンガー C (sp=32, おくびょう)', base: 170, sp: 32, natureModifier: 1.0, isHP: false, expected: 222 },
  { label: 'メガゲンガー S (sp=32, おくびょう)', base: 130, sp: 32, natureModifier: 1.1, isHP: false, expected: 200 },
] as const

export const SP_VALIDATION_TEST_CASES = [
  { label: '合計66は有効',   hp:11, atk:11, def:11, spa:11, spd:11, spe:11, valid: true },
  { label: '合計67は無効',   hp:12, atk:11, def:11, spa:11, spd:11, spe:11, valid: false },
  { label: '単体32は有効',   hp:32, atk:0,  def:0,  spa:0,  spd:0,  spe:0,  valid: true },
  { label: '単体33は無効',   hp:33, atk:0,  def:0,  spa:0,  spd:0,  spe:0,  valid: false },
  { label: '負の値は無効',   hp:-1, atk:0,  def:0,  spa:0,  spd:0,  spe:0,  valid: false },
  { label: '全0は有効',      hp:0,  atk:0,  def:0,  spa:0,  spd:0,  spe:0,  valid: true },
] as const
