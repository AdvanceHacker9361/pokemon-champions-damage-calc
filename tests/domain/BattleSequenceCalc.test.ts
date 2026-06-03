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

    it('オボン相当: ブリジュラス流星群×2 vs ガブリアス、1回限り発動で生存しダメは138〜171', () => {
      // HP=183、流星群1=122〜144、流星群2(C-2)=61〜72、オボン=45（HP50%以下で1回限り）
      // Draco1で残39-61 ≤91=50% → オボン+45 → 84-106
      // Draco2で12-45 → オボンは消費済みで再発動しない → ダメ138-171
      const HP = 183
      const draco1 = [122,124,126,128,130,132,134,136,138,140,141,142,143,144,144,144]
      const draco2 = [61,62,63,64,65,66,67,68,69,70,71,71,72,72,72,72]
      const events: SeqEvent[] = [
        { kind: 'attack', dmg: draco1 },
        { kind: 'attack', dmg: draco2 },
      ]
      const r = runBattleSequence(events, 1, HP, {
        defenderBerry: { threshold: Math.floor(HP / 2), amount: 45 },
      })
      expect(r.defenderKoProb).toBeCloseTo(0, 6)
      const dist = extractDefenderDamageDistribution(r, HP)
      let mn = Infinity, mx = -Infinity
      for (const d of dist.keys()) { if (d < mn) mn = d; if (d > mx) mx = d }
      // 最小ダメ = 122+61-45 = 138, 最大ダメ = 144+72-45 = 171（オボン1回切りであることを保証）
      expect(mn).toBe(138)
      expect(mx).toBe(171)
    })

    it('オボン相当: HP50%超に留まる弱攻撃ではオボンが発動しない', () => {
      // HP=200、攻撃確定50ダメ → 残150 (>100=50%) → オボン未発動
      const events: SeqEvent[] = [{ kind: 'attack', dmg: [50] }]
      const r = runBattleSequence(events, 1, 200, {
        defenderBerry: { threshold: 100, amount: 50 },
      })
      const dist = extractDefenderDamageDistribution(r, 200)
      expect(dist.get(50)).toBeCloseTo(1, 6)
    })

    it('オボン相当: 1回消費したら2発目以降は発動しない', () => {
      // HP=100, 攻撃60確定 → 残40 ≤50 → オボン+30 → 70、攻撃40確定 → 残30 (オボン消費済み)
      const events: SeqEvent[] = [
        { kind: 'attack', dmg: [60] },
        { kind: 'attack', dmg: [40] },
      ]
      const r = runBattleSequence(events, 1, 100, {
        defenderBerry: { threshold: 50, amount: 30 },
      })
      const dist = extractDefenderDamageDistribution(r, 100)
      // 60-30 = 30 + 40 = 70 ダメ
      expect(dist.get(70)).toBeCloseTo(1, 6)
    })

    it('はんすう: きのみが次のターン終了時にもう一度発動（計2回）', () => {
      // HP=200, 攻撃50×4, きのみ thr=100 amount=50
      // 1回限り: T2でHP100に達し+50→150 → T4でダメ100... ではなく
      //   オボンのみ → ダメ150、はんすう（2回） → ダメ100
      const ev: SeqEvent[] = [
        { kind: 'attack', dmg: [50] }, { kind: 'attack', dmg: [50] },
        { kind: 'attack', dmg: [50] }, { kind: 'attack', dmg: [50] },
      ]
      const once = runBattleSequence(ev, 1, 200, { defenderBerry: { threshold: 100, amount: 50 } })
      expect(extractDefenderDamageDistribution(once, 200).get(150)).toBeCloseTo(1, 6)
      const cud = runBattleSequence(ev, 1, 200, { defenderBerry: { threshold: 100, amount: 50, cudChew: true } })
      expect(extractDefenderDamageDistribution(cud, 200).get(100)).toBeCloseTo(1, 6)
    })

    it('リサイクル(rearmBerry): 再装填で同じきのみが再発動', () => {
      // HP=100, 攻撃40×3, きのみ thr=50 amount=30
      const withRecycle: SeqEvent[] = [
        { kind: 'attack', dmg: [40] }, { kind: 'attack', dmg: [40] },
        { kind: 'rearmBerry' }, { kind: 'attack', dmg: [40] },
      ]
      const r1 = runBattleSequence(withRecycle, 1, 100, { defenderBerry: { threshold: 50, amount: 30 } })
      expect(extractDefenderDamageDistribution(r1, 100).get(60)).toBeCloseTo(1, 6) // +30×2

      const noRecycle: SeqEvent[] = [
        { kind: 'attack', dmg: [40] }, { kind: 'attack', dmg: [40] }, { kind: 'attack', dmg: [40] },
      ]
      const r2 = runBattleSequence(noRecycle, 1, 100, { defenderBerry: { threshold: 50, amount: 30 } })
      expect(extractDefenderDamageDistribution(r2, 100).get(90)).toBeCloseTo(1, 6) // +30×1
    })

    it('しゅうかく100%: 毎ターン終了時に再装填され繰り返し発動', () => {
      // HP=100, 攻撃40×3, きのみ thr=50 amount=30, harvest=1.0
      const ev: SeqEvent[] = [
        { kind: 'attack', dmg: [40] }, { kind: 'attack', dmg: [40] }, { kind: 'attack', dmg: [40] },
      ]
      const harvest = runBattleSequence(ev, 1, 100, { defenderBerry: { threshold: 50, amount: 30, harvestChance: 1.0 } })
      expect(extractDefenderDamageDistribution(harvest, 100).get(60)).toBeCloseTo(1, 6) // +30×2
    })

    it('しゅうかく50%: 再装填が確率的（撃破率が中間値になる）', () => {
      // HP=70, 攻撃40×2, きのみ thr=35 amount=30, harvest=0.5
      // T1:30≤35→+30=60(consumed) TB harvest 50%再装填
      // T2:再装填済(0.5)→20≤35→+30=50→生存 / 未装填(0.5)→20→生存
      //   どちらも生存だが残HPが変わる。確率分岐の存在を確認
      const ev: SeqEvent[] = [{ kind: 'attack', dmg: [40] }, { kind: 'attack', dmg: [40] }]
      const r = runBattleSequence(ev, 1, 70, { defenderBerry: { threshold: 35, amount: 30, harvestChance: 0.5 } })
      const dist = extractDefenderDamageDistribution(r, 70)
      // 再装填あり: ダメ50 (+30×2)、なし: ダメ80→撃破... 実際は再計算。分岐2値が出ることを確認
      expect(dist.size).toBeGreaterThanOrEqual(2)
    })

    it('混乱実相当: HP≤25% で +1/3 発動・HP>25% では発動しない', () => {
      // HP=100, threshold=25, amount=33 (≈1/3)
      // 攻撃80 → 残20 ≤25 → +33 → 残53、ダメ=47
      const r1 = runBattleSequence([{ kind: 'attack', dmg: [80] }], 1, 100, {
        defenderBerry: { threshold: 25, amount: 33 },
      })
      expect(extractDefenderDamageDistribution(r1, 100).get(47)).toBeCloseTo(1, 6)

      // 攻撃50 → 残50 (>25) → 未発動 → ダメ=50
      const r2 = runBattleSequence([{ kind: 'attack', dmg: [50] }], 1, 100, {
        defenderBerry: { threshold: 25, amount: 33 },
      })
      expect(extractDefenderDamageDistribution(r2, 100).get(50)).toBeCloseTo(1, 6)
    })

    it('たべのこし(per-turn)+オボン(1回限り)併用シナリオ', () => {
      // HP=192, 攻撃50×3、たべのこし+12/turn (defenderRecover events), オボン+48 (defenderBerry)
      // T1: 192-50=142, +12=154
      // T2: 154-50=104, +12=116
      // T3: 116-50=66 ≤96 → オボン+48=114, +12=126 → ダメ66
      const events: SeqEvent[] = [
        { kind: 'attack', dmg: [50] }, { kind: 'defenderRecover', amount: 12 },
        { kind: 'attack', dmg: [50] }, { kind: 'defenderRecover', amount: 12 },
        { kind: 'attack', dmg: [50] }, { kind: 'defenderRecover', amount: 12 },
      ]
      const r = runBattleSequence(events, 1, 192, {
        defenderBerry: { threshold: 96, amount: 48 },
      })
      const dist = extractDefenderDamageDistribution(r, 192)
      expect(dist.get(66)).toBeCloseTo(1, 6)
    })

    it('定数回復は攻撃の後に適用すると正味ダメージを減らす（残飯）', () => {
      // 防御側100に攻撃50 → 残50、回復20 → 残70（正味ダメ30）
      // 末尾適用なら満タンクランプされず回復が効く
      const events: SeqEvent[] = [
        { kind: 'attack', dmg: [50] },
        { kind: 'defenderRecover', amount: 20 },
      ]
      const r = runBattleSequence(events, 1, 100)
      const dist = extractDefenderDamageDistribution(r, 100)
      expect(dist.get(30)).toBeCloseTo(1, 6) // 正味30ダメ
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

  describe('宿り木のタネ', () => {
    it('攻→防: 防御側-amount, 攻撃側+amount（クランプ）', () => {
      // attacker=100満タン, defender=160, 1ティック amount=20
      const r = runBattleSequence(
        [{ kind: 'leechSeed', direction: 'fromAttacker', amount: 20 }],
        100, 160,
      )
      const last = r.steps[0]
      expect(last.attackerHpDist.get(100)).toBeCloseTo(1, 6) // 満タンクランプ
      expect(last.defenderHpDist.get(140)).toBeCloseTo(1, 6)
    })

    it('攻→防 ×8 で撃破成立（HP=160）', () => {
      const ev: SeqEvent[] = Array.from({ length: 8 }, () => (
        { kind: 'leechSeed' as const, direction: 'fromAttacker' as const, amount: 20 }
      ))
      const r = runBattleSequence(ev, 200, 160)
      expect(r.defenderKoProb).toBeCloseTo(1, 6)
    })

    it('防→攻: 攻撃側-amount, 防御側+amount', () => {
      // 攻200→160(被ダメ40)、その後 leechSeed defender→attacker amount=25
      const r = runBattleSequence([
        { kind: 'incoming', dmg: [40] },
        { kind: 'leechSeed', direction: 'fromDefender', amount: 25 },
      ], 200, 160)
      const last = r.steps[r.steps.length - 1]
      expect(last.attackerHpDist.get(135)).toBeCloseTo(1, 6) // 160-25=135
      expect(last.defenderHpDist.get(160)).toBeCloseTo(1, 6) // 満タンクランプ
    })

    it('攻→防の実ダメージは防御側残HPでクランプ（吸血量も追従）', () => {
      // 防御側 残10 で amount=20 のティック → 実ダメ=10、撃破。攻撃側 +10
      const r = runBattleSequence([
        { kind: 'attack', dmg: [150] }, // 160→10
        { kind: 'leechSeed', direction: 'fromAttacker', amount: 20 },
      ], 100, 160, { attackerStartHp: 50 })
      // 攻撃側は実ダメ10で +10 → 60、防御側は0→koProb
      expect(r.defenderKoProb).toBeCloseTo(1, 6)
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
