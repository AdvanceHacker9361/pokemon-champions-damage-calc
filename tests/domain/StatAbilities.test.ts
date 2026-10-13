import { describe, it, expect } from 'vitest'
import { calculateDamage, resolveParadoxBoostStat } from '@/domain/calculators/DamageCalculator'
import type { DamageCalcInput } from '@/domain/calculators/DamageCalculator'
import type { ComputedStats } from '@/domain/models/Pokemon'
import type { MoveData } from '@/domain/models/Move'
import { createDefaultBattleField } from '@/domain/models/BattleField'

type Flags = MoveData['flags']

function makeStats(hp: number, atk: number, def: number, spa: number, spd: number, spe: number): ComputedStats {
  return { hp, atk, def, spa, spd, spe }
}

const NO_FLAGS: Flags = {
  contact: false, sound: false, bullet: false, pulse: false,
  punch: false, bite: false, slice: false,
}

function makeMove(name: string, type: string, category: '物理' | '特殊', power: number): MoveData {
  return {
    name, nameEn: name, type: type as MoveData['type'], category, power,
    accuracy: 100, pp: 16, priority: 0, flags: { ...NO_FLAGS }, special: null,
  }
}

// 攻撃側: A=C=180（同値は A 優先）、防御側: B=D=130（同値は B 優先）
const attackerStats = makeStats(175, 180, 120, 180, 120, 130)
const defenderStats = makeStats(190, 120, 130, 120, 130, 100)

const baseInput: Omit<DamageCalcInput, 'move'> = {
  attackerStats,
  attackerTypes: ['むし'],
  attackerAbility: 'ちどりあし',
  attackerItem: null,
  attackerStatus: null,
  attackerRankModifiers: {},
  attackerWeight: 50,
  defenderStats,
  defenderTypes: ['ノーマル'],
  defenderAbility: 'マイペース',
  defenderItem: null,
  defenderStatus: null,
  defenderWeight: 50,
  field: createDefaultBattleField(),
}

const physNormal = makeMove('たいあたり', 'ノーマル', '物理', 100)
const specNormal = makeMove('スイフトビーム', 'ノーマル', '特殊', 100)
const specElectric = makeMove('10まんボルト', 'でんき', '特殊', 100)
const physDragon = makeMove('ドラゴンクロー', 'ドラゴン', '物理', 100)
const physRock = makeMove('ストーンエッジ', 'いわ', '物理', 100)
const physGround = makeMove('じしん', 'じめん', '物理', 100)

function dmg(overrides: Partial<DamageCalcInput> & { move: MoveData }) {
  return calculateDamage({ ...baseInput, ...overrides })
}

/** 攻撃実数値 ×mult 相当を「ステータス直書き」で再現した参照値（floor は resolveAtk と同じ） */
function withAtk(mult: number, stat: 'atk' | 'spa'): ComputedStats {
  return { ...attackerStats, [stat]: Math.floor(attackerStats[stat] * mult) }
}
function withDef(mult: number, stat: 'def' | 'spd'): ComputedStats {
  return { ...defenderStats, [stat]: Math.floor(defenderStats[stat] * mult) }
}

describe('未実装だった特性（V3.20.0）', () => {
  describe('こおりのりんぷん', () => {
    it('特殊技のダメージを半減する', () => {
      const base = dmg({ move: specNormal })
      const scaled = dmg({ move: specNormal, defenderAbility: 'こおりのりんぷん' })
      expect(scaled.max).toBe(Math.floor(base.max / 2))
    })
    it('物理技には影響しない', () => {
      const base = dmg({ move: physNormal })
      const scaled = dmg({ move: physNormal, defenderAbility: 'こおりのりんぷん' })
      expect(scaled.rolls).toEqual(base.rolls)
    })
    it('かたやぶりで貫通される', () => {
      const base = dmg({ move: specNormal, attackerAbility: 'かたやぶり' })
      const scaled = dmg({ move: specNormal, attackerAbility: 'かたやぶり', defenderAbility: 'こおりのりんぷん' })
      expect(scaled.rolls).toEqual(base.rolls)
    })
  })

  describe('タイプ別の攻撃実数値強化', () => {
    it('トランジスタ: でんき技の特攻 1.3倍（Gen 9）', () => {
      const boosted = dmg({ move: specElectric, attackerAbility: 'トランジスタ' })
      const ref = dmg({ move: specElectric, attackerStats: withAtk(1.3, 'spa') })
      expect(boosted.rolls).toEqual(ref.rolls)
    })
    it('トランジスタ: でんき以外は変化なし', () => {
      const base = dmg({ move: specNormal })
      const boosted = dmg({ move: specNormal, attackerAbility: 'トランジスタ' })
      expect(boosted.rolls).toEqual(base.rolls)
    })
    it('りゅうのあぎと: ドラゴン技の攻撃 1.5倍', () => {
      const boosted = dmg({ move: physDragon, attackerAbility: 'りゅうのあぎと' })
      const ref = dmg({ move: physDragon, attackerStats: withAtk(1.5, 'atk') })
      expect(boosted.rolls).toEqual(ref.rolls)
    })
    it('いわはこび: いわ技の攻撃 1.5倍', () => {
      const boosted = dmg({ move: physRock, attackerAbility: 'いわはこび' })
      const ref = dmg({ move: physRock, attackerStats: withAtk(1.5, 'atk') })
      expect(boosted.rolls).toEqual(ref.rolls)
    })
  })

  describe('こだいかっせい / クォークチャージ', () => {
    const sunny = { ...createDefaultBattleField(), weather: 'はれ' as const }
    const electric = { ...createDefaultBattleField(), terrain: 'エレキ' as const }

    it('最も高いステータスはランク補正前の実数値で判定し、同値は A > B > C > D > S', () => {
      expect(resolveParadoxBoostStat(attackerStats)).toBe('atk')
      expect(resolveParadoxBoostStat(defenderStats)).toBe('def')
      expect(resolveParadoxBoostStat(makeStats(100, 100, 100, 150, 100, 100))).toBe('spa')
      expect(resolveParadoxBoostStat(makeStats(100, 100, 100, 100, 100, 200))).toBe('spe')
    })
    it('こだいかっせい: 晴れで最大ステータス（A）が 1.3倍、C の技には乗らない', () => {
      const phys = dmg({ move: physNormal, attackerAbility: 'こだいかっせい', field: sunny })
      expect(phys.rolls).toEqual(dmg({ move: physNormal, attackerStats: withAtk(1.3, 'atk'), field: sunny }).rolls)
      const spec = dmg({ move: specNormal, attackerAbility: 'こだいかっせい', field: sunny })
      expect(spec.rolls).toEqual(dmg({ move: specNormal, field: sunny }).rolls)
    })
    it('こだいかっせい: 天候なしでは未発動、ブーストエナジー or 手動トグルで発動', () => {
      const base = dmg({ move: physNormal })
      expect(dmg({ move: physNormal, attackerAbility: 'こだいかっせい' }).rolls).toEqual(base.rolls)
      const ref = dmg({ move: physNormal, attackerStats: withAtk(1.3, 'atk') })
      expect(dmg({ move: physNormal, attackerAbility: 'こだいかっせい', attackerItem: 'ブーストエナジー' }).rolls).toEqual(ref.rolls)
      expect(dmg({ move: physNormal, attackerAbility: 'こだいかっせい', attackerAbilityActivated: true }).rolls).toEqual(ref.rolls)
    })
    it('クォークチャージ: エレキフィールドで発動、晴れでは未発動', () => {
      const ref = dmg({ move: physNormal, attackerStats: withAtk(1.3, 'atk'), field: electric })
      expect(dmg({ move: physNormal, attackerAbility: 'クォークチャージ', field: electric }).rolls).toEqual(ref.rolls)
      expect(dmg({ move: physNormal, attackerAbility: 'クォークチャージ', field: sunny }).rolls)
        .toEqual(dmg({ move: physNormal, field: sunny }).rolls)
    })
    it('ランク補正前の実数値（RawStats）で判定: ランクで A が最大でも素の C が最大なら C を強化', () => {
      const raw = makeStats(175, 120, 120, 180, 120, 130)
      const spec = dmg({ move: specNormal, attackerAbility: 'こだいかっせい', attackerAbilityActivated: true, attackerRawStats: raw })
      expect(spec.rolls).toEqual(dmg({ move: specNormal, attackerStats: withAtk(1.3, 'spa') }).rolls)
      const phys = dmg({ move: physNormal, attackerAbility: 'こだいかっせい', attackerAbilityActivated: true, attackerRawStats: raw })
      expect(phys.rolls).toEqual(dmg({ move: physNormal }).rolls)
    })
    it('最大ステータスが S のときはダメージに影響しない', () => {
      const raw = makeStats(175, 100, 100, 100, 100, 200)
      const out = dmg({ move: physNormal, attackerAbility: 'こだいかっせい', attackerAbilityActivated: true, attackerRawStats: raw })
      expect(out.rolls).toEqual(dmg({ move: physNormal }).rolls)
    })
    it('防御側のこだいかっせい: 最大ステータス（B）が 1.3倍、特殊技には乗らない', () => {
      const phys = dmg({ move: physNormal, defenderAbility: 'こだいかっせい', field: sunny })
      expect(phys.rolls).toEqual(dmg({ move: physNormal, defenderStats: withDef(1.3, 'def'), field: sunny }).rolls)
      const spec = dmg({ move: specNormal, defenderAbility: 'こだいかっせい', field: sunny })
      expect(spec.rolls).toEqual(dmg({ move: specNormal, field: sunny }).rolls)
    })
  })

  describe('わざわい系', () => {
    it('わざわいのつるぎ（攻撃側）: 相手の防御 0.75倍', () => {
      const out = dmg({ move: physNormal, attackerAbility: 'わざわいのつるぎ' })
      expect(out.rolls).toEqual(dmg({ move: physNormal, defenderStats: withDef(0.75, 'def') }).rolls)
      // 特防参照の技には影響しない
      expect(dmg({ move: specNormal, attackerAbility: 'わざわいのつるぎ' }).rolls).toEqual(dmg({ move: specNormal }).rolls)
    })
    it('わざわいのたま（攻撃側）: 相手の特防 0.75倍', () => {
      const out = dmg({ move: specNormal, attackerAbility: 'わざわいのたま' })
      expect(out.rolls).toEqual(dmg({ move: specNormal, defenderStats: withDef(0.75, 'spd') }).rolls)
    })
    it('わざわいのおふだ（防御側）: 相手の攻撃 0.75倍', () => {
      const out = dmg({ move: physNormal, defenderAbility: 'わざわいのおふだ' })
      expect(out.rolls).toEqual(dmg({ move: physNormal, attackerStats: withAtk(0.75, 'atk') }).rolls)
    })
    it('わざわいのうつわ（防御側）: 相手の特攻 0.75倍', () => {
      const out = dmg({ move: specNormal, defenderAbility: 'わざわいのうつわ' })
      expect(out.rolls).toEqual(dmg({ move: specNormal, attackerStats: withAtk(0.75, 'spa') }).rolls)
    })
    it('同じわざわい特性同士は打ち消し合う', () => {
      const out = dmg({ move: physNormal, attackerAbility: 'わざわいのつるぎ', defenderAbility: 'わざわいのつるぎ' })
      expect(out.rolls).toEqual(dmg({ move: physNormal }).rolls)
    })
    it('かたやぶりでも貫通されない（防御側のおふだはそのまま効く）', () => {
      const out = dmg({ move: physNormal, attackerAbility: 'かたやぶり', defenderAbility: 'わざわいのおふだ' })
      expect(out.rolls).toEqual(dmg({ move: physNormal, attackerAbility: 'かたやぶり', attackerStats: withAtk(0.75, 'atk') }).rolls)
    })
  })
})

describe('フィールド補正の接地判定（V3.20.0）', () => {
  const electric = { ...createDefaultBattleField(), terrain: 'エレキ' as const }
  const misty = { ...createDefaultBattleField(), terrain: 'ミスト' as const }
  const grassy = { ...createDefaultBattleField(), terrain: 'グラス' as const }

  it('エレキフィールドの 1.3倍は接地した使用者のみ（ひこう/ふゆう/ふうせんは対象外）', () => {
    const noTerrain = dmg({ move: specElectric })
    const grounded = dmg({ move: specElectric, field: electric })
    expect(grounded.max).toBeGreaterThan(noTerrain.max)
    expect(dmg({ move: specElectric, field: electric, attackerTypes: ['ひこう'] }).rolls).toEqual(noTerrain.rolls)
    expect(dmg({ move: specElectric, field: electric, attackerAbility: 'ふゆう' }).rolls).toEqual(noTerrain.rolls)
    expect(dmg({ move: specElectric, field: electric, attackerItem: 'ふうせん' }).rolls).toEqual(noTerrain.rolls)
  })
  it('じゅうりょく中はひこうタイプの使用者も接地扱いで強化される', () => {
    const grounded = dmg({ move: specElectric, field: electric })
    const flyingInGravity = dmg({ move: specElectric, field: { ...electric, isGravity: true }, attackerTypes: ['ひこう'] })
    expect(flyingInGravity.rolls).toEqual(grounded.rolls)
  })
  it('ミストフィールドのドラゴン半減は接地した受け手のみ', () => {
    const noTerrain = dmg({ move: physDragon })
    expect(dmg({ move: physDragon, field: misty }).max).toBe(Math.floor(noTerrain.max / 2))
    expect(dmg({ move: physDragon, field: misty, defenderTypes: ['ひこう'] }).rolls).toEqual(noTerrain.rolls)
    expect(dmg({ move: physDragon, field: misty, defenderAbility: 'ふゆう' }).rolls).toEqual(noTerrain.rolls)
    // うちおとす（接地トグル）で再び半減対象になる
    expect(dmg({ move: physDragon, field: misty, defenderTypes: ['ひこう'], defenderGrounded: true }).max)
      .toBe(Math.floor(noTerrain.max / 2))
  })
  it('グラスフィールドのじしん半減は接地した受け手のみ', () => {
    const noTerrain = dmg({ move: physGround })
    expect(dmg({ move: physGround, field: grassy }).max).toBe(Math.floor(noTerrain.max / 2))
    expect(dmg({ move: physGround, field: grassy, defenderItem: 'ふうせん', defenderTypes: ['ノーマル'] }).max).toBe(0)
    // ふうせん所持はじめん技自体が無効（0）なので、半減判定は くろいてっきゅう で接地させて確認
    const forced = dmg({ move: physGround, field: grassy, defenderItem: 'くろいてっきゅう' })
    expect(forced.max).toBe(Math.floor(noTerrain.max / 2))
  })
})
