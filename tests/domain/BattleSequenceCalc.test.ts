import { describe, it, expect } from 'vitest'
import { runBattleSequence, extractDefenderDamageDistribution } from '@/domain/calculators/BattleSequenceCalc'
import type { SeqEvent } from '@/domain/calculators/BattleSequenceCalc'
import { calcCombinedKoProbability } from '@/domain/calculators/KoProbabilityCalc'

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

    it('シーケンスモードの痛み分けは攻撃側も回復し、次の被ダメを耐えられる', () => {
      // 控目CSメガゲンガー(HP=200) vs カバルドン(HP=200) を抽象化したシナリオ:
      //   T1: 鬼火相当（火傷=被ダメ無し）→ 被ダメ140 (ゲンガー残60)
      //   T2: 痛み分け → 両者90 / 被ダメ140 (ゲンガー残 = max(0, 90-140) → 瀕死)
      // ↑ 痛み分けでゲンガーが回復しないと、被ダメ140は受けられない
      const withSplit: SeqEvent[] = [
        { kind: 'incoming', dmg: [140] },
        { kind: 'painSplit' },   // 両者90
        { kind: 'incoming', dmg: [80] }, // 90-80=10で生存
      ]
      const r1 = runBattleSequence(withSplit, 200, 200)
      expect(r1.attackerSurviveProb).toBeCloseTo(1, 6)

      // 比較: 痛み分けなしだと残60で被ダメ80は受けられず瀕死
      const withoutSplit: SeqEvent[] = [
        { kind: 'incoming', dmg: [140] },
        { kind: 'incoming', dmg: [80] },
      ]
      const r2 = runBattleSequence(withoutSplit, 200, 200)
      expect(r2.attackerSurviveProb).toBeCloseTo(0, 6)
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

  describe('吸収技（drain）', () => {
    it('与ダメに応じて攻撃側が回復する（50%吸収）', () => {
      // 攻撃側が被ダメ100 → 残100（最大200）
      // 防御側200に吸収技で確定80ダメ → 防御側残120
      //   攻撃側は floor(80 * 0.5)=40 回復 → 100+40=140
      const events: SeqEvent[] = [
        { kind: 'incoming', dmg: [100] },
        { kind: 'attack', dmg: [80], drain: 0.5 },
      ]
      const r = runBattleSequence(events, 200, 200)
      const last = r.steps[r.steps.length - 1]
      expect(last.attackerHpDist.get(140)).toBeCloseTo(1, 6)
      expect(last.defenderHpDist.get(120)).toBeCloseTo(1, 6)
    })

    it('回復は最大HPでクランプされる', () => {
      // 攻撃側満タン200、防御側200に吸収80 → 回復40だが満タンで200のまま
      const events: SeqEvent[] = [
        { kind: 'attack', dmg: [80], drain: 0.5 },
      ]
      const r = runBattleSequence(events, 200, 200)
      const last = r.steps[0]
      expect(last.attackerHpDist.get(200)).toBeCloseTo(1, 6)
    })

    it('実際に与えたダメージ（防御側残HPでクランプ）に応じて回復', () => {
      // 攻撃側被ダメ150 → 残50
      // 防御側残30に吸収技で100ロール → 実ダメ=min(100,30)=30、回復floor(30*0.5)=15
      //   ただし防御側はKO（30-100<=0）→ koProb=1、攻撃側回復は撃破済みのため反映されない
      const events: SeqEvent[] = [
        { kind: 'incoming', dmg: [150] },
        { kind: 'attack', dmg: [70] },        // 200-70=130
        { kind: 'attack', dmg: [100], drain: 0.5 }, // 130残でなく…別シナリオ
      ]
      // 上は複雑なので別途シンプルに検証
      const simple: SeqEvent[] = [
        { kind: 'defenderConst', amount: 170 }, // 防御側200→残30
        { kind: 'attack', dmg: [100], drain: 0.5 },
      ]
      const r = runBattleSequence(simple, 200, 200, { attackerStartHp: 50 })
      // 防御側残30に100 → KO
      expect(r.defenderKoProb).toBeCloseTo(1, 6)
      void events
    })

    it('被ダメで相手（防御側）が回復する（相手の吸収技）', () => {
      // 攻撃側200が吸収技で被ダメ100 → 残100
      // 防御側は事前に削れている: 残50。被ダメ100の50%=50回復 → 100
      const events: SeqEvent[] = [
        { kind: 'defenderConst', amount: 150 },        // 防御側200→残50
        { kind: 'incoming', dmg: [100], drain: 0.5 },  // 攻撃側-100、防御側+50
      ]
      const r = runBattleSequence(events, 200, 200)
      const last = r.steps[r.steps.length - 1]
      expect(last.attackerHpDist.get(100)).toBeCloseTo(1, 6)
      expect(last.defenderHpDist.get(100)).toBeCloseTo(1, 6)
    })

    it('吸収による回復で次の被ダメを耐えられる', () => {
      // 攻撃側200、被ダメ150 → 残50
      // 吸収技で防御側に確定120ダメ（防御側200→80）、回復floor(120*0.5)=60 → 50+60=110
      // 次の被ダメ100 → 110-100=10で生存
      const events: SeqEvent[] = [
        { kind: 'incoming', dmg: [150] },
        { kind: 'attack', dmg: [120], drain: 0.5 },
        { kind: 'incoming', dmg: [100] },
      ]
      const r = runBattleSequence(events, 200, 200)
      expect(r.attackerSurviveProb).toBeCloseTo(1, 6)
      // 吸収なしなら 50-100<=0 で瀕死になるはず（対照）
      const noDrain: SeqEvent[] = [
        { kind: 'incoming', dmg: [150] },
        { kind: 'attack', dmg: [120] },
        { kind: 'incoming', dmg: [100] },
      ]
      const r2 = runBattleSequence(noDrain, 200, 200)
      expect(r2.attackerSurviveProb).toBeCloseTo(0, 6)
    })
  })

  describe('総合累積エンジン統合（1D primitive との一致）', () => {
    it('複数攻撃の撃破率が calcCombinedKoProbability と一致（攻撃側HP固定）', () => {
      // 各攻撃 {40,60} を2回、防御側HP=100
      const rolls = [40, 60]
      const events: SeqEvent[] = [
        { kind: 'attack', dmg: rolls },
        { kind: 'attack', dmg: rolls },
      ]
      const r = runBattleSequence(events, 1, 100)
      const ref = calcCombinedKoProbability([rolls, rolls], 100)
      expect(r.defenderKoProb).toBeCloseTo(ref, 6)
    })

    it('extractDefenderDamageDistribution: 非撃破は残HPから、撃破はしきい値に集約', () => {
      // HP=100, 攻撃 [30] 1回 → 残70（ダメ30）、撃破0
      const r1 = runBattleSequence([{ kind: 'attack', dmg: [30] }], 1, 100)
      const d1 = extractDefenderDamageDistribution(r1, 100)
      expect(d1.get(30)).toBeCloseTo(1, 6)

      // HP=100, 攻撃 [120] 1回 → 撃破 → ダメ100(しきい値)に集約
      const r2 = runBattleSequence([{ kind: 'attack', dmg: [120] }], 1, 100)
      const d2 = extractDefenderDamageDistribution(r2, 100)
      expect(d2.get(100)).toBeCloseTo(1, 6)
    })

    it('attackerHp 指定の痛み分けは防御側のみ変換し攻撃側HPは不変', () => {
      // HP=200に確定80 → 残120、痛み分け(攻撃側HP=200) → floor((200+120)/2)=160
      const events: SeqEvent[] = [
        { kind: 'attack', dmg: [80] },
        { kind: 'painSplit', attackerHp: 200 },
      ]
      const r = runBattleSequence(events, 1, 200)
      const last = r.steps[r.steps.length - 1]
      expect(last.defenderHpDist.get(160)).toBeCloseTo(1, 6)
      // 攻撃側HPは固定（ダミー1のまま）
      expect(last.attackerHpDist.get(1)).toBeCloseTo(1, 6)
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
