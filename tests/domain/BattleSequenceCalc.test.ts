import { describe, it, expect } from 'vitest'
import { runBattleSequence } from '@/domain/calculators/BattleSequenceCalc'
import type { SeqEvent } from '@/domain/calculators/BattleSequenceCalc'

describe('BattleSequenceCalc', () => {
  describe('単発攻撃', () => {
    it('確定でKOできる攻撃は defenderKoProb=1', () => {
      const events: SeqEvent[] = [{ kind: 'attack', dmg: [100] }]
      const r = runBattleSequence(events, 150, 100)
      expect(r.defenderKoProb).toBeCloseTo(1, 6)
      expect(r.attackerSurviveProb).toBeCloseTo(1, 6)
    })

    it('乱数の半分でKO（防御側HP=100, ロール半分が100以上）', () => {
      // ロール: 8個が90（届かない）, 8個が110（KO）
      const rolls = [90, 90, 90, 90, 90, 90, 90, 90, 110, 110, 110, 110, 110, 110, 110, 110]
      const r = runBattleSequence([{ kind: 'attack', dmg: rolls }], 150, 100)
      expect(r.defenderKoProb).toBeCloseTo(0.5, 6)
    })
  })

  describe('被ダメ（攻撃側生存）', () => {
    it('攻撃側が確定で瀕死になると生存確率0', () => {
      const events: SeqEvent[] = [{ kind: 'incoming', dmg: [200] }]
      const r = runBattleSequence(events, 150, 100)
      expect(r.attackerSurviveProb).toBeCloseTo(0, 6)
    })

    it('被ダメ後も生存し、次の攻撃でKO', () => {
      // 攻撃側150、被ダメ確定100 → 残50で生存
      // 防御側100、攻撃確定100 → KO
      const events: SeqEvent[] = [
        { kind: 'incoming', dmg: [100] },
        { kind: 'attack', dmg: [100] },
      ]
      const r = runBattleSequence(events, 150, 100)
      expect(r.attackerSurviveProb).toBeCloseTo(1, 6)
      expect(r.defenderKoProb).toBeCloseTo(1, 6)
    })
  })

  describe('痛み分け', () => {
    it('攻撃側HP満タン > 防御側残HP のとき防御側が回復する', () => {
      // 防御側200, 攻撃80確定 → 残120
      // 痛み分け: 攻撃側200, 防御側120 → floor((200+120)/2)=160 → 防御側残160（=40ダメ相当）
      // さらに攻撃80確定 → 残80（累積120ダメ）
      const events: SeqEvent[] = [
        { kind: 'attack', dmg: [80] },
        { kind: 'painSplit' },
        { kind: 'attack', dmg: [80] },
      ]
      const r = runBattleSequence(events, 200, 200)
      // 防御側残HP分布（最終ステップ）
      const lastStep = r.steps[r.steps.length - 1]
      expect(lastStep.defenderHpDist.get(80)).toBeCloseTo(1, 6)
      expect(r.defenderKoProb).toBeCloseTo(0, 6)
    })

    it('攻撃側が被弾後に痛み分けすると回復量が減る', () => {
      // 攻撃側200が被ダメ140 → 残60
      // 防御側200に攻撃80 → 残120
      // 痛み分け: 攻撃側60, 防御側120 → floor((60+120)/2)=90
      //   → 攻撃側90に回復, 防御側90に減少
      const events: SeqEvent[] = [
        { kind: 'incoming', dmg: [140] },
        { kind: 'attack', dmg: [80] },
        { kind: 'painSplit' },
      ]
      const r = runBattleSequence(events, 200, 200)
      const last = r.steps[r.steps.length - 1]
      expect(last.attackerHpDist.get(90)).toBeCloseTo(1, 6)
      expect(last.defenderHpDist.get(90)).toBeCloseTo(1, 6)
    })
  })

  describe('定数ダメージ（火傷など）', () => {
    it('防御側への定数ダメで残HPが削れKOに至る', () => {
      // 防御側100に攻撃95 → 残5、火傷10で撃破
      const events: SeqEvent[] = [
        { kind: 'attack', dmg: [95] },
        { kind: 'defenderConst', amount: 10 },
      ]
      const r = runBattleSequence(events, 150, 100)
      expect(r.defenderKoProb).toBeCloseTo(1, 6)
    })
  })

  describe('シナリオ: 攻撃→痛み分け→被ダメ→攻撃', () => {
    it('攻撃側生存と防御側撃破の同時確率が正しく分離される', () => {
      // 攻撃側100, 防御側100
      // 攻撃確定60 → 防御側残40
      // 痛み分け: 攻100/防40 → 70 → 攻70/防70
      // 被ダメ: 確定80 → 攻70-80=瀕死（faint）
      const events: SeqEvent[] = [
        { kind: 'attack', dmg: [60] },
        { kind: 'painSplit' },
        { kind: 'incoming', dmg: [80] },
      ]
      const r = runBattleSequence(events, 100, 100)
      expect(r.attackerSurviveProb).toBeCloseTo(0, 6)
      // 攻撃側が瀕死になった時点で防御側はまだ生存 → koProb=0
      expect(r.defenderKoProb).toBeCloseTo(0, 6)
    })
  })

  describe('確率分割の整合性', () => {
    it('koProb + faintProb + bothAlive = 1', () => {
      const rolls = Array.from({ length: 16 }, (_, i) => 50 + i * 4) // 50..110
      const inc = Array.from({ length: 16 }, (_, i) => 40 + i * 6)   // 40..130
      const events: SeqEvent[] = [
        { kind: 'attack', dmg: rolls },
        { kind: 'incoming', dmg: inc },
        { kind: 'attack', dmg: rolls },
      ]
      const r = runBattleSequence(events, 120, 100)
      const total = r.defenderKoProb + (1 - r.attackerSurviveProb) + r.bothAliveProb
      expect(total).toBeCloseTo(1, 6)
    })
  })
})
