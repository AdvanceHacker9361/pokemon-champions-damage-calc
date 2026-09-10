import { describe, it, expect } from 'vitest'
import { calculateDamage, isProteanLike } from '@/domain/calculators/DamageCalculator'
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

function makeMove(
  name: string,
  type: string,
  category: '物理' | '特殊',
  power: number,
  flags: Partial<Flags> = {},
): MoveData {
  return {
    name,
    nameEn: name,
    type: type as MoveData['type'],
    category,
    power,
    accuracy: 100,
    pp: 16,
    priority: 0,
    flags: { ...NO_FLAGS, ...flags },
    special: null,
  }
}

// 相性 1.0 になるよう「ノーマル単タイプ同士」を基本形にして倍率検証を単純化する
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

const contactMove = makeMove('たいあたり', 'ノーマル', '物理', 100, { contact: true })
const nonContactMove = makeMove('スイフトビーム', 'ノーマル', '特殊', 100)
const soundMove = makeMove('ばくおんぱ', 'ノーマル', '特殊', 100, { sound: true })
const bulletMove = makeMove('タネマシンガン', 'ノーマル', '物理', 100, { bullet: true })
const steelMove = makeMove('アイアンヘッド', 'はがね', '物理', 100)
const waterMove = makeMove('みずでっぽう', 'みず', '特殊', 100)
const fireMove = makeMove('ひのこ', 'ほのお', '特殊', 100)
const electricMove = makeMove('でんきショック', 'でんき', '特殊', 100)
const grassMove = makeMove('はっぱカッター', 'くさ', '物理', 100)
const groundMove = makeMove('じしん', 'じめん', '物理', 100)

function dmg(overrides: Partial<DamageCalcInput> & { move: MoveData }) {
  return calculateDamage({ ...baseInput, ...overrides })
}

describe('レギュレーション M-C 追加特性', () => {
  describe('はどうのぼうご', () => {
    it('接触技のダメージを半減する', () => {
      const base = dmg({ move: contactMove })
      const guarded = dmg({ move: contactMove, defenderAbility: 'はどうのぼうご' })
      expect(guarded.max).toBeLessThan(base.max)
      expect(guarded.max).toBe(Math.floor(base.max / 2))
    })

    it('非接触技には影響しない', () => {
      const base = dmg({ move: nonContactMove })
      const guarded = dmg({ move: nonContactMove, defenderAbility: 'はどうのぼうご' })
      expect(guarded.rolls).toEqual(base.rolls)
    })

    it('かたやぶりで貫通される', () => {
      const base = dmg({ move: contactMove, attackerAbility: 'かたやぶり' })
      const guarded = dmg({
        move: contactMove, attackerAbility: 'かたやぶり', defenderAbility: 'はどうのぼうご',
      })
      expect(guarded.rolls).toEqual(base.rolls)
    })
  })

  describe('パンクロック', () => {
    it('攻撃側は音技の威力が1.3倍になる', () => {
      const base = dmg({ move: soundMove })
      const boosted = dmg({ move: soundMove, attackerAbility: 'パンクロック' })
      expect(boosted.max).toBeGreaterThan(base.max)
    })

    it('攻撃側でも音技以外は変化しない', () => {
      const base = dmg({ move: nonContactMove })
      const boosted = dmg({ move: nonContactMove, attackerAbility: 'パンクロック' })
      expect(boosted.rolls).toEqual(base.rolls)
    })

    it('防御側は音技のダメージを半減する', () => {
      const base = dmg({ move: soundMove })
      const halved = dmg({ move: soundMove, defenderAbility: 'パンクロック' })
      expect(halved.max).toBe(Math.floor(base.max / 2))
    })

    it('防御側でも音技以外は変化しない', () => {
      const base = dmg({ move: nonContactMove })
      const halved = dmg({ move: nonContactMove, defenderAbility: 'パンクロック' })
      expect(halved.rolls).toEqual(base.rolls)
    })

    it('防御側パンクロックはかたやぶりで貫通される', () => {
      const base = dmg({ move: soundMove, attackerAbility: 'かたやぶり' })
      const halved = dmg({
        move: soundMove, attackerAbility: 'かたやぶり', defenderAbility: 'パンクロック',
      })
      expect(halved.rolls).toEqual(base.rolls)
    })
  })

  describe('はがねのせいしん', () => {
    it('はがね技の威力が1.5倍になる', () => {
      const base = dmg({ move: steelMove })
      const boosted = dmg({ move: steelMove, attackerAbility: 'はがねのせいしん' })
      expect(boosted.max).toBeGreaterThan(base.max)
    })

    it('はがね以外の技は変化しない', () => {
      const base = dmg({ move: contactMove })
      const boosted = dmg({ move: contactMove, attackerAbility: 'はがねのせいしん' })
      expect(boosted.rolls).toEqual(base.rolls)
    })
  })

  describe('がんじょうあご', () => {
    const biteMove = makeMove('かみくだく', 'あく', '物理', 80, { contact: true, bite: true })
    const nonBiteMove = makeMove('かみくだく相当(非かみつき)', 'あく', '物理', 80, { contact: true })

    it('かみつく属性技の威力が1.5倍になる（きれあじと同じ倍率）', () => {
      const base = dmg({ move: biteMove })
      const boosted = dmg({ move: biteMove, attackerAbility: 'がんじょうあご' })
      const sliceRef = dmg({
        move: makeMove('切る技', 'あく', '物理', 80, { contact: true, slice: true }),
        attackerAbility: 'きれあじ',
      })
      expect(boosted.max).toBeGreaterThan(base.max)
      expect(boosted.rolls).toEqual(sliceRef.rolls)
    })

    it('かみつく属性でない技は変化しない', () => {
      const base = dmg({ move: nonBiteMove })
      const boosted = dmg({ move: nonBiteMove, attackerAbility: 'がんじょうあご' })
      expect(boosted.rolls).toEqual(base.rolls)
    })
  })

  describe('はりこみ', () => {
    it('発動時は攻撃実数値2倍でダメージが約2倍になる', () => {
      const base = dmg({ move: contactMove })
      const boosted = dmg({
        move: contactMove, attackerAbility: 'はりこみ', attackerAbilityActivated: true,
      })
      expect(boosted.max).toBeGreaterThan(base.max * 1.9)
    })

    it('未発動なら変化しない', () => {
      const base = dmg({ move: contactMove })
      const inactive = dmg({ move: contactMove, attackerAbility: 'はりこみ' })
      expect(inactive.rolls).toEqual(base.rolls)
    })
  })

  describe('くさのけがわ', () => {
    const grassyField = { ...createDefaultBattleField(), terrain: 'グラス' as const }

    it('グラスフィールド中は物理被ダメが軽減される', () => {
      const base = dmg({ move: contactMove, field: grassyField })
      const pelt = dmg({ move: contactMove, field: grassyField, defenderAbility: 'くさのけがわ' })
      expect(pelt.max).toBeLessThan(base.max)
    })

    it('グラスフィールドでなければ変化しない', () => {
      const base = dmg({ move: contactMove })
      const pelt = dmg({ move: contactMove, defenderAbility: 'くさのけがわ' })
      expect(pelt.rolls).toEqual(base.rolls)
    })

    it('特殊技には影響しない', () => {
      const base = dmg({ move: nonContactMove, field: grassyField })
      const pelt = dmg({ move: nonContactMove, field: grassyField, defenderAbility: 'くさのけがわ' })
      expect(pelt.rolls).toEqual(base.rolls)
    })

    it('かたやぶりで貫通される', () => {
      const base = dmg({ move: contactMove, field: grassyField, attackerAbility: 'かたやぶり' })
      const pelt = dmg({
        move: contactMove, field: grassyField,
        attackerAbility: 'かたやぶり', defenderAbility: 'くさのけがわ',
      })
      expect(pelt.rolls).toEqual(base.rolls)
    })
  })

  describe('ファーコート', () => {
    it('物理技の被ダメがほぼ半減する', () => {
      const base = dmg({ move: contactMove })
      const coat = dmg({ move: contactMove, defenderAbility: 'ファーコート' })
      expect(coat.max).toBeLessThan(base.max * 0.55)
    })

    it('特殊技には影響しない', () => {
      const base = dmg({ move: nonContactMove })
      const coat = dmg({ move: nonContactMove, defenderAbility: 'ファーコート' })
      expect(coat.rolls).toEqual(base.rolls)
    })

    it('かたやぶりで貫通される', () => {
      const base = dmg({ move: contactMove, attackerAbility: 'かたやぶり' })
      const coat = dmg({
        move: contactMove, attackerAbility: 'かたやぶり', defenderAbility: 'ファーコート',
      })
      expect(coat.rolls).toEqual(base.rolls)
    })
  })

  describe('リベロ', () => {
    it('isProteanLike が へんげんじざい / リベロ のみ true を返す', () => {
      expect(isProteanLike('へんげんじざい')).toBe(true)
      expect(isProteanLike('リベロ')).toBe(true)
      expect(isProteanLike('てきおうりょく')).toBe(false)
      expect(isProteanLike(null)).toBe(false)
      expect(isProteanLike(undefined)).toBe(false)
    })

    it('攻撃側のSTAB挙動が へんげんじざい と一致する', () => {
      const protean = dmg({
        move: fireMove, attackerAbility: 'へんげんじざい', attackerAbilityActivated: true,
      })
      const libero = dmg({
        move: fireMove, attackerAbility: 'リベロ', attackerAbilityActivated: true,
      })
      const plain = dmg({ move: fireMove })
      expect(libero.rolls).toEqual(protean.rolls)
      // 攻撃側は むし タイプなので通常はSTABが乗らない → 変換によりSTABが乗る
      expect(libero.max).toBeGreaterThan(plain.max)
    })

    it('防御側のタイプ変換挙動が へんげんじざい と一致する', () => {
      const opts = { defenderAbilityActivated: true, defenderProteanType: 'ゴースト' as const }
      const protean = dmg({ move: contactMove, defenderAbility: 'へんげんじざい', ...opts })
      const libero = dmg({ move: contactMove, defenderAbility: 'リベロ', ...opts })
      expect(libero.rolls).toEqual(protean.rolls)
      // ノーマル技 → ゴースト は無効
      expect(libero.max).toBe(0)
    })
  })

  describe('タイプ無効化特性', () => {
    const cases: [string, MoveData][] = [
      ['ちょすい', waterMove],
      ['よびみず', waterMove],
      ['かんそうはだ', waterMove],
      ['ちくでん', electricMove],
      ['ひらいしん', electricMove],
      ['でんきエンジン', electricMove],
      ['もらいび', fireMove],
      ['そうしょく', grassMove],
      ['どしょく', groundMove],
    ]

    for (const [ability, move] of cases) {
      it(`${ability} は該当タイプの技を無効化する`, () => {
        const result = dmg({ move, defenderAbility: ability })
        expect(result.max).toBe(0)
        expect(result.min).toBe(0)
        expect(Array.from(result.rolls)).toEqual(new Array(16).fill(0))
        expect(result.koResult.type).toBe('no-ko')
      })

      it(`${ability} は該当タイプ以外の技を無効化しない`, () => {
        const base = dmg({ move: contactMove })
        const result = dmg({ move: contactMove, defenderAbility: ability })
        expect(result.max).toBe(base.max)
      })
    }

    it('ぼうおん は音技を無効化し、それ以外は無効化しない', () => {
      expect(dmg({ move: soundMove, defenderAbility: 'ぼうおん' }).max).toBe(0)
      expect(dmg({ move: nonContactMove, defenderAbility: 'ぼうおん' }).max)
        .toBe(dmg({ move: nonContactMove }).max)
    })

    it('ぼうだん は弾技を無効化し、それ以外は無効化しない', () => {
      expect(dmg({ move: bulletMove, defenderAbility: 'ぼうだん' }).max).toBe(0)
      expect(dmg({ move: contactMove, defenderAbility: 'ぼうだん' }).max)
        .toBe(dmg({ move: contactMove }).max)
    })

    it('かたやぶりは無効化特性を貫通する', () => {
      const broken = dmg({
        move: waterMove, attackerAbility: 'かたやぶり', defenderAbility: 'ちょすい',
      })
      expect(broken.max).toBeGreaterThan(0)
      expect(broken.max).toBe(dmg({ move: waterMove, attackerAbility: 'かたやぶり' }).max)

      const brokenSound = dmg({
        move: soundMove, attackerAbility: 'かたやぶり', defenderAbility: 'ぼうおん',
      })
      expect(brokenSound.max).toBeGreaterThan(0)
    })

    it('かんそうはだ は ほのお技を1.25倍にする', () => {
      const base = dmg({ move: fireMove })
      const dry = dmg({ move: fireMove, defenderAbility: 'かんそうはだ' })
      expect(dry.max).toBeGreaterThan(base.max)
      expect(dry.max).toBe(Math.floor(base.max * 1.25))
    })

    it('ふゆう の じめん無効化は従来どおり（かたやぶり・接地で解除）', () => {
      expect(dmg({ move: groundMove, defenderAbility: 'ふゆう' }).max).toBe(0)
      expect(dmg({ move: groundMove, defenderAbility: 'ふゆう', attackerAbility: 'かたやぶり' }).max)
        .toBeGreaterThan(0)
      expect(dmg({ move: groundMove, defenderAbility: 'ふゆう', defenderGrounded: true }).max)
        .toBeGreaterThan(0)
      expect(dmg({ move: contactMove, defenderAbility: 'ふゆう' }).max)
        .toBe(dmg({ move: contactMove }).max)
    })
  })
})
