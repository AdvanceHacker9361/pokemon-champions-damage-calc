import { describe, it, expect } from 'vitest'
import { calculateDamage } from '@/domain/calculators/DamageCalculator'
import { resolveWeatherAwareMovePower, resolveWeatherAwareMoveType } from '@/domain/calculators/MoveResolution'
import type { DamageCalcInput } from '@/domain/calculators/DamageCalculator'
import type { ComputedStats } from '@/domain/models/Pokemon'
import type { MoveData } from '@/domain/models/Move'
import { createDefaultBattleField } from '@/domain/models/BattleField'

function makeStats(hp: number, atk: number, def: number, spa: number, spd: number, spe: number): ComputedStats {
  return { hp, atk, def, spa, spd, spe }
}

function makePhysicalMove(name: string, type: string, power: number): MoveData {
  return {
    name,
    nameEn: name,
    type: type as MoveData['type'],
    category: '物理',
    power,
    accuracy: 100,
    pp: 16,
    priority: 0,
    flags: { contact: true, sound: false, bullet: false, pulse: false, punch: false, bite: false, slice: false },
    special: null,
  }
}

function makeSpecialMove(name: string, type: string, power: number): MoveData {
  return {
    name,
    nameEn: name,
    type: type as MoveData['type'],
    category: '特殊',
    power,
    accuracy: 100,
    pp: 16,
    priority: 0,
    flags: { contact: false, sound: false, bullet: false, pulse: false, punch: false, bite: false, slice: false },
    special: null,
  }
}

// テスト用の基本入力（ガブリアスのスペック相当）
const garchompStats = makeStats(184, 200, 125, 101, 111, 154) // いじっぱりAS想定
const gengárStats = makeStats(155, 79, 75, 222, 121, 200)    // メガゲンガーCS想定

const baseInput: Omit<DamageCalcInput, 'move'> = {
  attackerStats: garchompStats,
  attackerTypes: ['ドラゴン', 'じめん'],
  attackerAbility: 'すながくれ',
  attackerItem: null,
  attackerStatus: null,
  attackerRankModifiers: {},
  attackerWeight: 95,
  defenderStats: gengárStats,
  defenderTypes: ['ゴースト', 'どく'],
  defenderAbility: 'シャドータッグ',
  defenderItem: null,
  defenderStatus: null,
  defenderWeight: 40.5,
  field: createDefaultBattleField(),
}

describe('DamageCalculator', () => {
  describe('技表示用のタイプ・威力解決', () => {
    it('ウェザーボールの表示タイプと表示威力は天候に追随する', () => {
      const base = {
        moveType: 'ノーマル' as const,
        moveSpecial: 'weather-ball' as const,
        attackerAbility: '',
        defenderAbility: '',
      }

      expect(resolveWeatherAwareMoveType({ ...base, weather: null })).toBe('ノーマル')
      expect(resolveWeatherAwareMovePower({ movePower: 50, moveSpecial: 'weather-ball', weather: null })).toBe(50)

      expect(resolveWeatherAwareMoveType({ ...base, weather: 'はれ' })).toBe('ほのお')
      expect(resolveWeatherAwareMoveType({ ...base, weather: 'あめ' })).toBe('みず')
      expect(resolveWeatherAwareMoveType({ ...base, weather: 'すなあらし' })).toBe('いわ')
      expect(resolveWeatherAwareMoveType({ ...base, weather: 'ゆき' })).toBe('こおり')
      expect(resolveWeatherAwareMovePower({ movePower: 50, moveSpecial: 'weather-ball', weather: 'はれ' })).toBe(100)
    })

    it('メガソーラーはウェザーボール表示でも晴れ扱いになる', () => {
      expect(resolveWeatherAwareMoveType({
        moveType: 'ノーマル',
        moveSpecial: 'weather-ball',
        weather: null,
        attackerAbility: 'メガソーラー',
      })).toBe('ほのお')
      expect(resolveWeatherAwareMovePower({
        movePower: 50,
        moveSpecial: 'weather-ball',
        weather: null,
        defenderAbility: 'メガソーラー',
      })).toBe(100)
    })
  })

  describe('基本ダメージ計算', () => {
    it('物理技が正のダメージを返す', () => {
      const move = makePhysicalMove('じしん', 'じめん', 100)
      const result = calculateDamage({ ...baseInput, move })
      expect(result.min).toBeGreaterThan(0)
      expect(result.max).toBeGreaterThanOrEqual(result.min)
    })

    it('特殊技が正のダメージを返す', () => {
      const move = makeSpecialMove('りゅうせいぐん', 'ドラゴン', 130)
      const result = calculateDamage({ ...baseInput, move })
      expect(result.min).toBeGreaterThan(0)
    })

    it('Champions仕様: 16段階の乱数ロールを返す（85〜100）', () => {
      const move = makePhysicalMove('じしん', 'じめん', 100)
      const result = calculateDamage({ ...baseInput, move })
      expect(result.rolls).toHaveLength(16)
      // ロールは昇順
      for (let i = 1; i < 16; i++) {
        expect(result.rolls[i]).toBeGreaterThanOrEqual(result.rolls[i - 1])
      }
    })

    it('defenderMaxHp が防御側HPと一致', () => {
      const move = makePhysicalMove('じしん', 'じめん', 100)
      const result = calculateDamage({ ...baseInput, move })
      expect(result.defenderMaxHp).toBe(gengárStats.hp)
    })
  })

  // ── Champions仕様の乱数16段階 検証テスト ──────────────────────────────
  // 最新パッチで 15段階（86〜100）→ 16段階（85〜100）に修正
  describe('Champions乱数仕様 検証', () => {
    it('検証1: ガブリアス ドラゴンクロー → ラウドボーン (STAB一致、16段階ロール)', () => {
      // 攻撃側: ガブリアス A=182 (無補正32振り)
      // 防御側: ラウドボーン B=120 (無補正無振り)
      // 技: ドラゴンクロー 威力80 タイプ一致
      // 期待: [69,70,70,72,72,73,75,75,76,76,78,78,79,79,81,82]
      const attacker = makeStats(184, 182, 125, 101, 111, 154)
      const defender = makeStats(185, 70, 120, 70, 70, 70)
      const move = makePhysicalMove('ドラゴンクロー', 'ドラゴン', 80)
      const result = calculateDamage({
        ...baseInput,
        attackerStats: attacker,
        attackerTypes: ['ドラゴン', 'じめん'],
        defenderStats: defender,
        defenderTypes: ['ノーマル'],
        move,
      })
      expect(Array.from(result.rolls)).toEqual([69, 70, 70, 72, 72, 73, 75, 75, 76, 76, 78, 78, 79, 79, 81, 82])
      expect(result.rolls).toHaveLength(16)
      expect(result.min).toBe(69)
      expect(result.max).toBe(82)
    })

    it('検証2: ボスゴドラ すてみタックル → ランクルス (タイプ不一致、乱数前値=100)', () => {
      // 攻撃側: ボスゴドラ A=158 (いじっぱり14振り相当)
      // 防御側: ランクルス B=85 (無補正無振り)
      // 技: すてみタックル 威力120 タイプ不一致
      // 乱数前の値=100 → 期待: [85,86,87,...,100]（16段階）
      const attacker = makeStats(180, 158, 100, 60, 80, 100)
      const defender = makeStats(160, 60, 85, 160, 120, 70)
      const move: import('@/domain/models/Move').MoveData = {
        name: 'すてみタックル', nameEn: 'Double-Edge',
        type: 'ノーマル', category: '物理', power: 120, accuracy: 100,
        pp: 16, priority: 0,
        flags: { contact: true, sound: false, bullet: false, pulse: false, punch: false, bite: false, slice: false },
        special: null,
      }
      const result = calculateDamage({
        ...baseInput,
        attackerStats: attacker,
        attackerTypes: ['はがね', 'いわ'],
        defenderStats: defender,
        defenderTypes: ['エスパー'],
        move,
      })
      expect(Array.from(result.rolls)).toEqual([85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100])
      expect(result.rolls).toHaveLength(16)
      expect(result.min).toBe(85)
      expect(result.max).toBe(100)
    })
  })

  describe('タイプ無効', () => {
    it('無効タイプには0ダメージを返す', () => {
      // ゴーストに対してノーマル技は無効
      const move = makePhysicalMove('たいあたり', 'ノーマル', 40)
      const result = calculateDamage({ ...baseInput, move })
      expect(result.min).toBe(0)
      expect(result.max).toBe(0)
    })
  })

  describe('接地（うちおとす）とふゆう', () => {
    it('ひこうタイプはじめん技を無効化（0ダメージ）', () => {
      const move = makeSpecialMove('じしん', 'じめん', 100)
      const result = calculateDamage({
        ...baseInput,
        defenderTypes: ['でんき', 'ひこう'],
        defenderAbility: 'ちくでん',
        move,
      })
      expect(result.max).toBe(0)
    })

    it('接地中はひこうタイプにもじめん技が当たる（でんきの2倍弱点が乗る）', () => {
      const move = makeSpecialMove('じしん', 'じめん', 100)
      const result = calculateDamage({
        ...baseInput,
        defenderTypes: ['でんき', 'ひこう'],
        defenderAbility: 'ちくでん',
        defenderGrounded: true,
        move,
      })
      expect(result.min).toBeGreaterThan(0)
    })

    it('ふゆうはじめん技を無効化（0ダメージ）', () => {
      const move = makeSpecialMove('じしん', 'じめん', 100)
      const result = calculateDamage({
        ...baseInput,
        defenderTypes: ['でんき', 'ゴースト'],
        defenderAbility: 'ふゆう',
        move,
      })
      expect(result.max).toBe(0)
    })

    it('うなぎのぼりはじめん技を無効化（0ダメージ）', () => {
      const move = makeSpecialMove('じしん', 'じめん', 100)
      const result = calculateDamage({
        ...baseInput,
        defenderTypes: ['でんき'],
        defenderAbility: 'うなぎのぼり',
        move,
      })
      expect(result.max).toBe(0)
    })

    it('接地中はふゆうでもじめん技が当たる', () => {
      const move = makeSpecialMove('じしん', 'じめん', 100)
      const result = calculateDamage({
        ...baseInput,
        defenderTypes: ['でんき', 'ゴースト'],
        defenderAbility: 'ふゆう',
        defenderGrounded: true,
        move,
      })
      expect(result.min).toBeGreaterThan(0)
    })

    it('かたやぶり系はふゆうを無視してじめん技が当たる', () => {
      const move = makeSpecialMove('じしん', 'じめん', 100)
      const result = calculateDamage({
        ...baseInput,
        attackerAbility: 'かたやぶり',
        defenderTypes: ['でんき', 'ゴースト'],
        defenderAbility: 'ふゆう',
        move,
      })
      expect(result.min).toBeGreaterThan(0)
    })

    it('じゅうりょく（場）でひこうタイプにもじめん技が当たる', () => {
      const move = makeSpecialMove('じしん', 'じめん', 100)
      const result = calculateDamage({
        ...baseInput,
        defenderTypes: ['でんき', 'ひこう'],
        defenderAbility: 'ちくでん',
        field: { ...createDefaultBattleField(), isGravity: true },
        move,
      })
      expect(result.min).toBeGreaterThan(0)
    })

    it('じゅうりょく（場）でふゆうでもじめん技が当たる', () => {
      const move = makeSpecialMove('じしん', 'じめん', 100)
      const result = calculateDamage({
        ...baseInput,
        defenderTypes: ['でんき', 'ゴースト'],
        defenderAbility: 'ふゆう',
        field: { ...createDefaultBattleField(), isGravity: true },
        move,
      })
      expect(result.min).toBeGreaterThan(0)
    })

    it('Gのちからはじゅうりょく中に威力1.5倍になる', () => {
      const gravApple: MoveData = {
        ...makePhysicalMove('Gのちから', 'くさ', 80),
        special: 'grav-apple',
      }
      const normal = calculateDamage({
        ...baseInput,
        defenderTypes: ['みず', 'じめん'],
        defenderAbility: 'げきりゅう',
        move: gravApple,
      })
      const withGravity = calculateDamage({
        ...baseInput,
        defenderTypes: ['みず', 'じめん'],
        defenderAbility: 'げきりゅう',
        field: { ...createDefaultBattleField(), isGravity: true },
        move: gravApple,
      })
      // 威力80→120相当（1.5倍）なので明確に増える
      expect(withGravity.max).toBeGreaterThan(normal.max)
    })

    it('接地はじめん技以外には影響しない（ひこうのでんき弱点は維持）', () => {
      const move = makeSpecialMove('１０まんボルト', 'でんき', 90)
      const grounded = calculateDamage({
        ...baseInput,
        defenderTypes: ['でんき', 'ひこう'],
        defenderAbility: 'ちくでん',
        defenderGrounded: true,
        move,
      })
      const notGrounded = calculateDamage({
        ...baseInput,
        defenderTypes: ['でんき', 'ひこう'],
        defenderAbility: 'ちくでん',
        move,
      })
      expect(grounded.max).toBe(notGrounded.max)
    })
  })

  describe('STAB補正', () => {
    it('タイプ一致技は威力1.5倍相当になる', () => {
      const stabMove = makePhysicalMove('じしん', 'じめん', 100)  // ガブリアスのSTAB
      const noStabMove = makePhysicalMove('ストーンエッジ', 'いわ', 100) // 非STAB

      const stabResult = calculateDamage({ ...baseInput, move: stabMove })
      const noStabResult = calculateDamage({ ...baseInput, move: noStabMove })

      // STABありの方がダメージが高い
      expect(stabResult.max).toBeGreaterThan(noStabResult.max)
    })
  })

  describe('天候補正', () => {
    it('はれでほのお技が1.5倍になる', () => {
      const move = makeSpecialMove('かえんほうしゃ', 'ほのお', 90)
      const normalResult = calculateDamage({
        ...baseInput,
        attackerTypes: ['ほのお'],
        move,
        field: createDefaultBattleField(),
      })
      const sunResult = calculateDamage({
        ...baseInput,
        attackerTypes: ['ほのお'],
        move,
        field: { ...createDefaultBattleField(), weather: 'はれ' },
      })
      expect(sunResult.max).toBeGreaterThan(normalResult.max)
    })

    it('あめでみず技が1.5倍になる', () => {
      const move = makeSpecialMove('なみのり', 'みず', 90)
      const normalResult = calculateDamage({
        ...baseInput,
        attackerTypes: ['みず'],
        move,
        field: createDefaultBattleField(),
      })
      const rainResult = calculateDamage({
        ...baseInput,
        attackerTypes: ['みず'],
        move,
        field: { ...createDefaultBattleField(), weather: 'あめ' },
      })
      expect(rainResult.max).toBeGreaterThan(normalResult.max)
    })

    it('ウェザーボールはメガソーラーを晴れとして扱う', () => {
      const move: MoveData = {
        ...makeSpecialMove('ウェザーボール', 'ノーマル', 50),
        special: 'weather-ball',
      }
      const sunnyResult = calculateDamage({
        ...baseInput,
        attackerTypes: ['ノーマル'],
        move,
        field: { ...createDefaultBattleField(), weather: 'はれ' },
      })
      const megaSolarResult = calculateDamage({
        ...baseInput,
        attackerTypes: ['ノーマル'],
        attackerAbility: 'メガソーラー',
        move,
        field: createDefaultBattleField(),
      })
      const normalResult = calculateDamage({
        ...baseInput,
        attackerTypes: ['ノーマル'],
        move,
        field: createDefaultBattleField(),
      })

      expect(Array.from(megaSolarResult.rolls)).toEqual(Array.from(sunnyResult.rolls))
      expect(megaSolarResult.min).toBe(sunnyResult.min)
      expect(megaSolarResult.max).toBe(sunnyResult.max)
      expect(megaSolarResult.max).toBeGreaterThan(normalResult.max)
    })

    it('防御側のメガソーラーでもウェザーボールは晴れ扱いになる', () => {
      const move: MoveData = {
        ...makeSpecialMove('ウェザーボール', 'ノーマル', 50),
        special: 'weather-ball',
      }
      const sunnyResult = calculateDamage({
        ...baseInput,
        attackerTypes: ['ノーマル'],
        move,
        field: { ...createDefaultBattleField(), weather: 'はれ' },
      })
      const defenderMegaSolarResult = calculateDamage({
        ...baseInput,
        attackerTypes: ['ノーマル'],
        defenderAbility: 'メガソーラー',
        move,
        field: createDefaultBattleField(),
      })

      expect(Array.from(defenderMegaSolarResult.rolls)).toEqual(Array.from(sunnyResult.rolls))
    })
  })

  describe('やけど補正', () => {
    it('やけど状態で物理技が0.5倍になる', () => {
      const move = makePhysicalMove('じしん', 'じめん', 100)
      const normalResult = calculateDamage({ ...baseInput, move })
      const burnResult = calculateDamage({ ...baseInput, move, attackerStatus: 'やけど' })
      expect(burnResult.max).toBeLessThan(normalResult.max)
    })

    it('やけど状態で特殊技は影響なし', () => {
      const move = makeSpecialMove('りゅうせいぐん', 'ドラゴン', 130)
      const normalResult = calculateDamage({ ...baseInput, move })
      const burnResult = calculateDamage({ ...baseInput, move, attackerStatus: 'やけど' })
      expect(burnResult.max).toBe(normalResult.max)
    })
  })

  describe('壁補正', () => {
    it('リフレクター下で物理技が0.5倍になる', () => {
      const move = makePhysicalMove('じしん', 'じめん', 100)
      const normalResult = calculateDamage({ ...baseInput, move })
      const wallResult = calculateDamage({
        ...baseInput, move,
        field: { ...createDefaultBattleField(), isReflect: true },
      })
      expect(wallResult.max).toBeLessThan(normalResult.max)
    })

    it('ひかりのかべ下で特殊技が0.5倍になる', () => {
      const move = makeSpecialMove('りゅうせいぐん', 'ドラゴン', 130)
      const normalResult = calculateDamage({ ...baseInput, move })
      const wallResult = calculateDamage({
        ...baseInput, move,
        field: { ...createDefaultBattleField(), isLightScreen: true },
      })
      expect(wallResult.max).toBeLessThan(normalResult.max)
    })
  })

  describe('いのちのたま', () => {
    it('いのちのたまでダメージが約1.3倍になる', () => {
      const move = makePhysicalMove('じしん', 'じめん', 100)
      const normalResult = calculateDamage({ ...baseInput, move })
      const loResult = calculateDamage({ ...baseInput, move, attackerItem: 'いのちのたま' })
      // floor(max * 1.3) >= max * 1.29
      expect(loResult.max).toBeGreaterThan(normalResult.max)
      expect(loResult.max).toBeLessThanOrEqual(Math.ceil(normalResult.max * 1.3))
    })
  })

  describe('追加持ち物補正', () => {
    it('ちからのハチマキで物理技ダメージが上がる', () => {
      const move = makePhysicalMove('ストーンエッジ', 'いわ', 100)
      const normalResult = calculateDamage({ ...baseInput, move })
      const itemResult = calculateDamage({ ...baseInput, move, attackerItem: 'ちからのハチマキ' })
      expect(itemResult.max).toBeGreaterThan(normalResult.max)
    })

    it('ものしりメガネで特殊技ダメージが上がる', () => {
      const move = makeSpecialMove('りゅうせいぐん', 'ドラゴン', 130)
      const normalResult = calculateDamage({ ...baseInput, move })
      const itemResult = calculateDamage({ ...baseInput, move, attackerItem: 'ものしりメガネ' })
      expect(itemResult.max).toBeGreaterThan(normalResult.max)
    })

    it('パンチグローブでパンチ技ダメージが上がる', () => {
      const move: MoveData = {
        ...makePhysicalMove('ほのおのパンチ', 'ほのお', 75),
        flags: { contact: true, sound: false, bullet: false, pulse: false, punch: true, bite: false, slice: false },
      }
      const normalResult = calculateDamage({ ...baseInput, move })
      const itemResult = calculateDamage({ ...baseInput, move, attackerItem: 'パンチグローブ' })
      expect(itemResult.max).toBeGreaterThan(normalResult.max)
    })

    it('しんかのきせきで防御側の被ダメージが下がる', () => {
      const move = makePhysicalMove('じしん', 'じめん', 100)
      const normalResult = calculateDamage({ ...baseInput, move })
      const itemResult = calculateDamage({ ...baseInput, move, defenderItem: 'しんかのきせき' })
      expect(itemResult.max).toBeLessThan(normalResult.max)
    })

    it('ふうせんで接地していない防御側へのじめん技を無効化する', () => {
      const move = makePhysicalMove('じしん', 'じめん', 100)
      const result = calculateDamage({ ...baseInput, move, defenderItem: 'ふうせん' })
      expect(result.max).toBe(0)
    })

    it('ふうせんは接地中ならじめん技を無効化しない', () => {
      const move = makePhysicalMove('じしん', 'じめん', 100)
      const result = calculateDamage({
        ...baseInput,
        move,
        defenderItem: 'ふうせん',
        defenderGrounded: true,
      })
      expect(result.min).toBeGreaterThan(0)
    })

    it('プレートとジュエルが対応タイプのダメージを上げる', () => {
      const move = makePhysicalMove('ストーンエッジ', 'いわ', 100)
      const normalResult = calculateDamage({ ...baseInput, move })
      const plateResult = calculateDamage({ ...baseInput, move, attackerItem: 'がんせきプレート' })
      const gemResult = calculateDamage({ ...baseInput, move, attackerItem: 'いわのジュエル' })
      expect(plateResult.max).toBeGreaterThan(normalResult.max)
      expect(gemResult.max).toBeGreaterThan(plateResult.max)
    })

    it('メトロノームは指定倍率で技威力を上げる', () => {
      const move = makePhysicalMove('ストーンエッジ', 'いわ', 100)
      const normalResult = calculateDamage({ ...baseInput, move })
      const boostedResult = calculateDamage({
        ...baseInput,
        move,
        attackerItem: 'メトロノーム',
        attackerMetronomeMultiplier: 2,
      })
      const doubledPowerResult = calculateDamage({
        ...baseInput,
        move: { ...move, power: 200 },
      })

      expect(boostedResult.max).toBeGreaterThan(normalResult.max)
      expect(Array.from(boostedResult.rolls)).toEqual(Array.from(doubledPowerResult.rolls))
    })

    it('メトロノーム以外の持ち物では倍率指定を無視する', () => {
      const move = makePhysicalMove('ストーンエッジ', 'いわ', 100)
      const normalResult = calculateDamage({ ...baseInput, move })
      const ignoredResult = calculateDamage({
        ...baseInput,
        move,
        attackerItem: null,
        attackerMetronomeMultiplier: 2,
      })

      expect(Array.from(ignoredResult.rolls)).toEqual(Array.from(normalResult.rolls))
    })
  })

  describe('追加特性補正', () => {
    it('ほのおのたてがみでほのお技ダメージが上がる', () => {
      const move = makeSpecialMove('かえんほうしゃ', 'ほのお', 90)
      const normalResult = calculateDamage({ ...baseInput, move })
      const abilityResult = calculateDamage({
        ...baseInput,
        move,
        attackerAbility: 'ほのおのたてがみ',
      })

      expect(abilityResult.max).toBeGreaterThan(normalResult.max)
    })

    it('ほのおのたてがみは非ほのお技には影響しない', () => {
      const move = makeSpecialMove('ハイパーボイス', 'ノーマル', 90)
      const normalResult = calculateDamage({ ...baseInput, move })
      const abilityResult = calculateDamage({
        ...baseInput,
        move,
        attackerAbility: 'ほのおのたてがみ',
      })

      expect(Array.from(abilityResult.rolls)).toEqual(Array.from(normalResult.rolls))
    })

    it('たいねつでほのお技ダメージを半減する', () => {
      const move = makeSpecialMove('かえんほうしゃ', 'ほのお', 90)
      const normalResult = calculateDamage({ ...baseInput, move })
      const heatproofResult = calculateDamage({
        ...baseInput,
        move,
        defenderAbility: 'たいねつ',
      })

      expect(heatproofResult.max).toBeLessThan(normalResult.max)
      expect(heatproofResult.min).toBeLessThan(normalResult.min)
    })

    it('たいねつは非ほのお技には影響しない', () => {
      const move = makeSpecialMove('ハイパーボイス', 'ノーマル', 90)
      const normalResult = calculateDamage({ ...baseInput, move })
      const heatproofResult = calculateDamage({
        ...baseInput,
        move,
        defenderAbility: 'たいねつ',
      })

      expect(Array.from(heatproofResult.rolls)).toEqual(Array.from(normalResult.rolls))
    })

    it('シェルアーマーは急所ダメージを無効化する', () => {
      const move = makePhysicalMove('じしん', 'じめん', 100)
      const normalResult = calculateDamage({ ...baseInput, move })
      const criticalResult = calculateDamage({ ...baseInput, move, isCritical: true })
      const shellArmorResult = calculateDamage({
        ...baseInput,
        move,
        defenderAbility: 'シェルアーマー',
        isCritical: true,
      })

      expect(criticalResult.max).toBeGreaterThan(normalResult.max)
      expect(Array.from(shellArmorResult.rolls)).toEqual(Array.from(normalResult.rolls))
    })
  })

  describe('パーセント表示', () => {
    it('percentMax が max / defenderMaxHp * 100 と一致', () => {
      const move = makePhysicalMove('じしん', 'じめん', 100)
      const result = calculateDamage({ ...baseInput, move })
      const expected = (result.max / result.defenderMaxHp) * 100
      expect(result.percentMax).toBeCloseTo(expected, 1)
    })
  })

  describe('半減実の skipHalfBerry', () => {
    // ヤチェのみ（こおり半減）を持つドラゴンタイプに対し、こおり技は効果抜群（×2）
    // → 半減実発動で 0.5 倍されるはず
    const move = makeSpecialMove('れいとうビーム', 'こおり', 90)
    const dragon = makeStats(185, 100, 100, 100, 100, 100)
    const dragonInput = {
      ...baseInput,
      defenderStats: dragon,
      defenderTypes: ['ドラゴン' as const],
      defenderItem: 'ヤチェのみ',
      move,
    }

    it('1発目: ヤチェのみで半減ダメージとなる', () => {
      const noBerry = calculateDamage({ ...dragonInput, defenderItem: null })
      const withBerry = calculateDamage(dragonInput)
      // 半減実が発動している（≒ 0.5 倍）
      expect(withBerry.max).toBeLessThan(noBerry.max)
      expect(withBerry.max).toBeLessThanOrEqual(Math.ceil(noBerry.max * 0.55))
      expect(withBerry.max).toBeGreaterThanOrEqual(Math.floor(noBerry.max * 0.45))
    })

    it('2発目以降（skipHalfBerry=true）: 半減せず素ダメージとなる', () => {
      const noBerry = calculateDamage({ ...dragonInput, defenderItem: null })
      const skipped = calculateDamage({ ...dragonInput, skipHalfBerry: true })
      // 半減実なし時とほぼ同一（pokeRound 誤差を許容）
      expect(skipped.max).toBe(noBerry.max)
      expect(skipped.min).toBe(noBerry.min)
    })

    it('skipHalfBerry を渡しても、半減実を持っていない場合は無影響', () => {
      const noItem = calculateDamage({ ...dragonInput, defenderItem: null })
      const skipped = calculateDamage({ ...dragonInput, defenderItem: null, skipHalfBerry: true })
      expect(skipped.max).toBe(noItem.max)
    })

    it('ホズのみ（ノーマル半減）は等倍でも skipHalfBerry で無効化される', () => {
      const normalMove = makeSpecialMove('はかいこうせん', 'ノーマル', 150)
      const target = makeStats(185, 100, 100, 100, 100, 100)
      const target2 = {
        ...baseInput,
        defenderStats: target,
        defenderTypes: ['ほのお' as const],  // ノーマルは等倍
        defenderItem: 'ホズのみ',
        move: normalMove,
      }
      const withBerry = calculateDamage(target2)
      const skipped = calculateDamage({ ...target2, skipHalfBerry: true })
      const noItem = calculateDamage({ ...target2, defenderItem: null })
      // ホズのみ発動時は等倍タイプでも 0.5 倍される
      expect(withBerry.max).toBeLessThan(noItem.max)
      // skipHalfBerry で半減を回避
      expect(skipped.max).toBe(noItem.max)
    })
  })
})
