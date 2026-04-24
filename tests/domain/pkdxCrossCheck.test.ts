/**
 * pkdx v0.4.12 のダメージエンジンに対するクロスチェック。
 *
 * pkdx 側の e2e テスト（damage/e2e_scenarios_test.mbt）および unit テスト
 * の期待値を、このプロジェクトの calculateDamage() に通した結果と比較する。
 *
 * pkdx のテストは Standard stat system (Lv50 / IV31 / EV252 / +10% nature)
 * 既定。このプロジェクトは Champions 系しかないため、両システムで同一実数値
 * になるよう変換した ComputedStats を直接渡して比較する。
 */
import { describe, it, expect } from 'vitest'
import { calculateDamage } from '@/domain/calculators/DamageCalculator'
import type { DamageCalcInput } from '@/domain/calculators/DamageCalculator'
import type { ComputedStats, TypeName, Weather, StatusCondition } from '@/domain/models/Pokemon'
import type { MoveData } from '@/domain/models/Move'
import { createDefaultBattleField } from '@/domain/models/BattleField'

// ─────────────────────────────────────────────────────────────
// pkdx の Standard 既定 (Lv50, IV31, EV252, +10% nature) から実数値を導出
// ─────────────────────────────────────────────────────────────
function pkdxStandardHP(base: number): number {
  return Math.floor((base * 2 + 31 + 63) * 50 / 100) + 60
}
function pkdxStandardAtkOther(base: number, natureNum: number, natureDen: number): number {
  const raw = Math.floor((base * 2 + 31 + 63) * 50 / 100) + 5
  return Math.floor(raw * natureNum / natureDen)
}
function pkdxStandardDefHP(base: number): number {
  return Math.floor((base * 2 + 31 + 0) * 50 / 100) + 60
}
function pkdxStandardDefOther(base: number, natureNum: number, natureDen: number): number {
  const raw = Math.floor((base * 2 + 31 + 0) * 50 / 100) + 5
  return Math.floor(raw * natureNum / natureDen)
}

function mkAtkStats(base: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number }): ComputedStats {
  // pkdx e2e の攻撃側既定: nature=None → +10%
  return {
    hp:  pkdxStandardHP(base.hp),
    atk: pkdxStandardAtkOther(base.atk, 11, 10),
    def: pkdxStandardAtkOther(base.def, 11, 10),
    spa: pkdxStandardAtkOther(base.spa, 11, 10),
    spd: pkdxStandardAtkOther(base.spd, 11, 10),
    spe: pkdxStandardAtkOther(base.spe, 11, 10),
  }
}
function mkDefStats(base: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number }): ComputedStats {
  // pkdx e2e の防御側既定: nature=None → 無補正 (1/1), EV=0
  return {
    hp:  pkdxStandardDefHP(base.hp),
    atk: pkdxStandardDefOther(base.atk, 1, 1),
    def: pkdxStandardDefOther(base.def, 1, 1),
    spa: pkdxStandardDefOther(base.spa, 1, 1),
    spd: pkdxStandardDefOther(base.spd, 1, 1),
    spe: pkdxStandardDefOther(base.spe, 1, 1),
  }
}

function mkMove(
  name: string,
  type: TypeName,
  category: '物理' | '特殊',
  power: number,
  options: { special?: MoveData['special']; contact?: boolean } = {},
): MoveData {
  return {
    name,
    nameEn: name,
    type,
    category,
    power,
    accuracy: 100,
    pp: 16,
    priority: 0,
    flags: { contact: options.contact ?? (category === '物理'), sound: false, bullet: false, pulse: false, punch: false, bite: false, slice: false },
    special: options.special ?? null,
  }
}

function mkInput(opts: {
  attacker: { types: TypeName[]; stats: ComputedStats }
  defender: { types: TypeName[]; stats: ComputedStats }
  move: MoveData
  weather?: Weather
  attackerAbility?: string
  defenderAbility?: string
  attackerStatus?: StatusCondition
  defenderStatus?: StatusCondition
  defenderAbilityActivated?: boolean
  isCritical?: boolean
  isReflect?: boolean
  isLightScreen?: boolean
}): DamageCalcInput {
  const field = createDefaultBattleField()
  field.weather = opts.weather ?? null
  field.isReflect = opts.isReflect ?? false
  field.isLightScreen = opts.isLightScreen ?? false
  return {
    attackerStats: opts.attacker.stats,
    attackerTypes: opts.attacker.types,
    attackerAbility: opts.attackerAbility ?? '',
    attackerItem: null,
    attackerStatus: opts.attackerStatus ?? null,
    attackerRankModifiers: {},
    defenderStats: opts.defender.stats,
    defenderTypes: opts.defender.types,
    defenderAbility: opts.defenderAbility ?? '',
    defenderItem: null,
    defenderStatus: opts.defenderStatus ?? null,
    defenderAbilityActivated: opts.defenderAbilityActivated ?? false,
    move: opts.move,
    field,
    isCritical: opts.isCritical ?? false,
  }
}

// ─────────────────────────────────────────────────────────────
// pkdx v0.4.12 damage/e2e_scenarios_test.mbt の goldens を再現
// ─────────────────────────────────────────────────────────────

describe('pkdx クロスチェック: e2e_scenarios', () => {
  it('ウェザーボール (特殊) in はれ → ほのお化・威力100・damage 114〜135', () => {
    // pkdx: "e2e: weather ball in sun becomes fire type power 100"
    // atk base SpA=130 → 200, def base HP=100 → 175, def base SpD=80 → 100
    // 期待: min=114, max=135
    const atk = mkAtkStats({ hp: 100, atk: 80, def: 80, spa: 130, spd: 80, spe: 80 })
    const dfn = mkDefStats({ hp: 100, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 })
    const move = mkMove('ウェザーボール', 'ノーマル', '特殊', 50, { special: 'weather-ball' })
    const r = calculateDamage(mkInput({
      attacker: { types: ['ノーマル'], stats: atk },
      defender: { types: ['ノーマル'], stats: dfn },
      move,
      weather: 'はれ',
    }))
    expect(atk.spa).toBe(200)
    expect(dfn.hp).toBe(175)
    expect(dfn.spd).toBe(100)
    expect(r.min).toBe(114)
    expect(r.max).toBe(135)
  })

  it('リフレクター: 物理ダメージをほぼ半減', () => {
    // pkdx: "e2e: reflect halves physical damage"
    // atk base Atk=130, def base HP=100, def base Def=100
    const atk = mkAtkStats({ hp: 100, atk: 130, def: 80, spa: 80, spd: 80, spe: 80 })
    const dfn = mkDefStats({ hp: 100, atk: 80, def: 100, spa: 80, spd: 100, spe: 80 })
    const move = mkMove('すてみタックル', 'ノーマル', '物理', 120)
    const rNo = calculateDamage(mkInput({
      attacker: { types: ['ノーマル'], stats: atk },
      defender: { types: ['ノーマル'], stats: dfn },
      move,
    }))
    const rWall = calculateDamage(mkInput({
      attacker: { types: ['ノーマル'], stats: atk },
      defender: { types: ['ノーマル'], stats: dfn },
      move,
      isReflect: true,
    }))
    // リフレクタ有が有り無しの ~半分 (±1)
    expect(rWall.max * 2).toBeLessThanOrEqual(rNo.max + 1)
    expect(rWall.max * 2).toBeGreaterThanOrEqual(rNo.max - 2)
  })

  it('急所はリフレクターを貫通する', () => {
    const atk = mkAtkStats({ hp: 100, atk: 130, def: 80, spa: 80, spd: 80, spe: 80 })
    const dfn = mkDefStats({ hp: 100, atk: 80, def: 100, spa: 80, spd: 100, spe: 80 })
    const move = mkMove('すてみタックル', 'ノーマル', '物理', 120)
    const rWall = calculateDamage(mkInput({
      attacker: { types: ['ノーマル'], stats: atk },
      defender: { types: ['ノーマル'], stats: dfn },
      move,
      isReflect: true,
    }))
    const rWallCrit = calculateDamage(mkInput({
      attacker: { types: ['ノーマル'], stats: atk },
      defender: { types: ['ノーマル'], stats: dfn },
      move,
      isReflect: true,
      isCritical: true,
    }))
    // 急所(1.5) / 壁(0.5) = 3倍
    expect(rWallCrit.max).toBeGreaterThan(rWall.max * 2)
  })

  it('やけど: 攻撃側やけどで物理ダメージが半減', () => {
    // pkdx は damage エンジンでやけど半減を実装していない（payoff側のみ）。
    // このテストはこのプロジェクトの仕様（やけど半減あり）を固定する。
    const atk = mkAtkStats({ hp: 100, atk: 130, def: 80, spa: 80, spd: 80, spe: 80 })
    const dfn = mkDefStats({ hp: 100, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 })
    const move = mkMove('すてみタックル', 'ノーマル', '物理', 120)
    const rNone = calculateDamage(mkInput({
      attacker: { types: ['ノーマル'], stats: atk },
      defender: { types: ['ノーマル'], stats: dfn },
      move,
    }))
    const rBurn = calculateDamage(mkInput({
      attacker: { types: ['ノーマル'], stats: atk },
      defender: { types: ['ノーマル'], stats: dfn },
      move,
      attackerStatus: 'やけど',
    }))
    // やけど時は物理ダメージほぼ半分
    expect(rBurn.max * 2).toBeLessThanOrEqual(rNone.max + 1)
    expect(rBurn.max * 2).toBeGreaterThanOrEqual(rNone.max - 1)
  })
})

// ─────────────────────────────────────────────────────────────
// 既知の damage 基本式チェック（pkdx の formula と同一であることを確認）
// ─────────────────────────────────────────────────────────────

describe('pkdx クロスチェック: basic formula', () => {
  it('ノーマル vs ノーマル タイプ一致なし・補正なし: 85ロール = floor(damage_base * 0.85)', () => {
    // 単純な環境でベースダメージと乱数ロールの生成方法を確認
    // atk SpA 200, def HP 175, def SpD 100, ノーマル技 威力50 特殊
    //   inner = 22 * 50 * 200 / 100 = 2200
    //   damage_base = 2200/50 + 2 = 46
    //   r=85: floor(46 * 85/100) = floor(39.1) = 39
    //   r=100: 46 * 100/100 = 46
    const atk = mkAtkStats({ hp: 100, atk: 80, def: 80, spa: 130, spd: 80, spe: 80 })
    const dfn = mkDefStats({ hp: 100, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 })
    const move = mkMove('かまいたち', 'むし', '特殊', 50) // むしタイプ = 攻撃側ノーマルにSTAB無し, vs ノーマル = 1x
    const r = calculateDamage(mkInput({
      attacker: { types: ['ノーマル'], stats: atk },
      defender: { types: ['ノーマル'], stats: dfn },
      move,
    }))
    expect(atk.spa).toBe(200)
    expect(dfn.spd).toBe(100)
    expect(r.min).toBe(39)
    expect(r.max).toBe(46)
  })

  it('タイプ一致 (STAB 1.5倍): 46 → pokeRound(46*1.5) = 69', () => {
    const atk = mkAtkStats({ hp: 100, atk: 80, def: 80, spa: 130, spd: 80, spe: 80 })
    const dfn = mkDefStats({ hp: 100, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 })
    const move = mkMove('エアスラッシュ', 'ひこう', '特殊', 50)
    // 攻撃側ひこう=STAB, ひこう vs ノーマル=1x
    // r=100: damage_base=46, STAB後 = pokeRound(46*1.5) = 69
    const r = calculateDamage(mkInput({
      attacker: { types: ['ひこう'], stats: atk },
      defender: { types: ['ノーマル'], stats: dfn },
      move,
    }))
    expect(r.max).toBe(69)
  })

  it('タイプ相性 2倍: ほのお vs くさ', () => {
    const atk = mkAtkStats({ hp: 100, atk: 80, def: 80, spa: 130, spd: 80, spe: 80 })
    const dfn = mkDefStats({ hp: 100, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 })
    const move = mkMove('ほのおのパンチ', 'ほのお', '特殊', 50)  // 攻撃側ノーマル: STAB無し
    const r = calculateDamage(mkInput({
      attacker: { types: ['ノーマル'], stats: atk },
      defender: { types: ['くさ'], stats: dfn },
      move,
    }))
    // くさの base SpD=80 → spd=100 と同じ算出
    // damage_base=46 → typeEff=2x → 92
    expect(r.max).toBe(92)
  })

  it('急所 1.5倍', () => {
    const atk = mkAtkStats({ hp: 100, atk: 80, def: 80, spa: 130, spd: 80, spe: 80 })
    const dfn = mkDefStats({ hp: 100, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 })
    const move = mkMove('かまいたち', 'むし', '特殊', 50)
    const rCrit = calculateDamage(mkInput({
      attacker: { types: ['ノーマル'], stats: atk },
      defender: { types: ['ノーマル'], stats: dfn },
      move,
      isCritical: true,
    }))
    // damage_base=46, crit=1.5 → pokeRound(46*1.5)=69
    expect(rCrit.max).toBe(69)
  })
})

// ─────────────────────────────────────────────────────────────
// エレキフィールドの適用順を検証（pkdx と一致すべき）
// ─────────────────────────────────────────────────────────────
describe('pkdx クロスチェック: エレキフィールド適用順', () => {
  function makeField(terrain: 'エレキ' | null) {
    const f = createDefaultBattleField()
    f.terrain = terrain
    return f
  }
  function run(isField: boolean) {
    const atk = mkAtkStats({ hp: 100, atk: 80, def: 80, spa: 130, spd: 80, spe: 80 })
    const dfn = mkDefStats({ hp: 100, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 })
    const move = mkMove('10まんボルト', 'でんき', '特殊', 50)
    return calculateDamage({
      attackerStats: atk, attackerTypes: ['ノーマル'], attackerAbility: '', attackerItem: null,
      attackerStatus: null, attackerRankModifiers: {},
      defenderStats: dfn, defenderTypes: ['ノーマル'], defenderAbility: '', defenderItem: null,
      defenderStatus: null, defenderAbilityActivated: false,
      move, field: makeField(isField ? 'エレキ' : null), isCritical: false,
    })
  }
  it('エレキフィールド中のでんき技は全ロールで pkdx と同じダメージを返す', () => {
    // pkdx の算出（terrain を base に先適用・5325/4096 で round5）
    //   damage_base = 46 → round5(46, 5325) = 60
    //   各ロール: floor(60 * r / 100)
    const expectedPkdx = [
      51, 51, 52, 52, 53, 54, 54, 55, 55, 56, 57, 57, 58, 58, 59, 60,
    ]
    const r = run(true)
    for (let i = 0; i < 16; i++) {
      expect(r.rolls[i]).toBe(expectedPkdx[i])
    }
  })
})

// ─────────────────────────────────────────────────────────────
// いろめがね（Tinted Lens）× こうかはいまひとつ
// pkdx: dmg * 2 (整数、round5 なし)
// ─────────────────────────────────────────────────────────────
describe('pkdx クロスチェック: いろめがね', () => {
  it('こうかはいまひとつ時に2倍', () => {
    const atk = mkAtkStats({ hp: 100, atk: 80, def: 80, spa: 130, spd: 80, spe: 80 })
    const dfn = mkDefStats({ hp: 100, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 })
    const move = mkMove('かまいたち', 'むし', '特殊', 50)  // むし vs かくとう = 0.5x
    const rNo = calculateDamage(mkInput({
      attacker: { types: ['ノーマル'], stats: atk },
      defender: { types: ['かくとう'], stats: dfn },
      move,
    }))
    const rTint = calculateDamage(mkInput({
      attacker: { types: ['ノーマル'], stats: atk },
      defender: { types: ['かくとう'], stats: dfn },
      move,
      attackerAbility: 'いろめがね',
    }))
    // いろめがねで 1/2 → 1/1 相当、ほぼ2倍
    expect(rTint.max).toBe(rNo.max * 2)
  })
})
