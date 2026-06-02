import { describe, it, expect } from 'vitest'
import {
  calcKoProbability,
  calcVariableHitsSingleUsageDist,
  calcCombinedKoProbability,
  calcCombinedDamageDistribution,
  applyPainSplitToDmgDist,
  VARIABLE_MULTI_HIT_DIST,
} from '@/domain/calculators/KoProbabilityCalc'

describe('KoProbabilityCalc', () => {
  describe('確定1発KO', () => {
    it('全ロールが防御側HPを超える場合', () => {
      const rolls = Array(16).fill(100) as number[]
      const result = calcKoProbability(rolls, 100)
      expect(result.type).toBe('guaranteed')
      if (result.type === 'guaranteed') {
        expect(result.hits).toBe(1)
      }
    })

    it('最小ロールもHPを超える場合', () => {
      const rolls = Array.from({ length: 16 }, (_, i) => 101 + i) as number[]
      const result = calcKoProbability(rolls, 100)
      expect(result.type).toBe('guaranteed')
      if (result.type === 'guaranteed') {
        expect(result.hits).toBe(1)
      }
    })
  })

  describe('確定2発KO', () => {
    it('2回で確実に倒せる場合', () => {
      // 各ロール50, HP=100 → 50+50=100 ≥ 100 → 確定2発
      const rolls = Array(16).fill(50) as number[]
      const result = calcKoProbability(rolls, 100)
      expect(result.type).toBe('guaranteed')
      if (result.type === 'guaranteed') {
        expect(result.hits).toBe(2)
      }
    })

    it('1発では届かないが2発で必ず倒せる場合', () => {
      // 各ロール70, HP=100 → 1発:70<100(NG), 2発:140≥100(OK) → 確定2発
      const rolls = Array(16).fill(70) as number[]
      const result = calcKoProbability(rolls, 100)
      expect(result.type).toBe('guaranteed')
      if (result.type === 'guaranteed') {
        expect(result.hits).toBe(2)
      }
    })
  })

  describe('乱数KO', () => {
    it('最大累積ダメージはHP以上だが最小は届かない (乱数2発)', () => {
      // HP=100, ロール: 8個が40 (2発:80<100), 8個が55 (2発:110≥100)
      // minTotal(hits=2) = 40*2=80 < 100 → 確定ではない
      // maxTotal(hits=2) = 55*2=110 ≥ 100 → 乱数2発
      // P(55+55=110≥100) = (8/16)*(8/16) = 0.25
      const rolls = [
        40, 40, 40, 40, 40, 40, 40, 40,
        55, 55, 55, 55, 55, 55, 55, 55,
      ] as number[]
      const result = calcKoProbability(rolls, 100)
      expect(result.type).toBe('chance')
      if (result.type === 'chance') {
        expect(result.hits).toBe(2)
        expect(result.probability).toBeCloseTo(0.25, 5)
      }
    })
  })

  describe('確定3発KO', () => {
    it('3回で確実に倒せる場合', () => {
      // 各ロール34, HP=100 → 34+34+34=102 ≥ 100 → 確定3発
      const rolls = Array(16).fill(34) as number[]
      const result = calcKoProbability(rolls, 100)
      expect(result.type).toBe('guaranteed')
      if (result.type === 'guaranteed') {
        expect(result.hits).toBe(3)
      }
    })
  })

  describe('倒せない', () => {
    it('maxHits内に倒せない場合', () => {
      // ダメージ=1, HP=100, maxHits=4 → 4発で4ダメージ < 100 → 倒せない
      const rolls = Array(16).fill(1) as number[]
      const result = calcKoProbability(rolls, 100, 4)
      expect(result.type).toBe('no-ko')
    })
  })

  describe('ゼロダメージ', () => {
    it('無効技は倒せない', () => {
      const rolls = Array(16).fill(0) as number[]
      const result = calcKoProbability(rolls, 100)
      expect(result.type).toBe('no-ko')
    })
  })

  describe('変動連続技を総合累積へ加算（1使用分のヒット数加重分布）', () => {
    it('スケイルショット 1使用分の分布が 2〜5発の加重平均と一致する', () => {
      // 1発あたり一様ロール 10 のみ（簡略化のため 1要素ロール配列）
      const rolls = [10]
      const dist = calcVariableHitsSingleUsageDist(rolls, VARIABLE_MULTI_HIT_DIST, rolls)
      // 2発=20 (P=1/3), 3発=30 (P=1/3), 4発=40 (P=1/6), 5発=50 (P=1/6)
      expect(dist.size).toBe(4)
      expect(dist.get(20)).toBeCloseTo(1 / 3, 6)
      expect(dist.get(30)).toBeCloseTo(1 / 3, 6)
      expect(dist.get(40)).toBeCloseTo(1 / 6, 6)
      expect(dist.get(50)).toBeCloseTo(1 / 6, 6)
    })

    it('5発相当のダメージ1回分が常に5発当たる前提より KO 確率が低くなる', () => {
      // 防御側 HP=50。1発10ダメ。5発当たる前提なら 50 で確定KO
      const rolls = [10]
      // 旧バグ実装相当: usages=5 で 5スロット → P(KO) = 1.0（常に5発当たる前提）
      const buggy = calcCombinedKoProbability([rolls, rolls, rolls, rolls, rolls], 50)
      expect(buggy).toBe(1.0)
      // 新実装: 1使用分の加重分布で 1スロット → P(KO) = P(5発) = 1/6
      const dist = calcVariableHitsSingleUsageDist(rolls, VARIABLE_MULTI_HIT_DIST, rolls)
      const proper = calcCombinedKoProbability([dist], 50)
      expect(proper).toBeCloseTo(1 / 6, 6)
    })

    it('複数スロット（他技 + 変動連続技）の畳み込みが正しい', () => {
      // 他技: ロール [40] (固定 40 ダメ)
      // 変動連続技: 1発10ダメ → 1使用分の分布
      // 合算: 40 + (20|30|40|50) = 60 (1/3), 70 (1/3), 80 (1/6), 90 (1/6)
      // 防御側 HP=75 → KO は damage>=75 → 80 (1/6) + 90 (1/6) = 2/6 = 1/3
      const other = [40]
      const variableDist = calcVariableHitsSingleUsageDist([10], VARIABLE_MULTI_HIT_DIST, [10])
      const prob = calcCombinedKoProbability([other, variableDist], 75)
      expect(prob).toBeCloseTo(1 / 3, 6)
    })
  })

  describe('痛み分け（applyPainSplitToDmgDist）', () => {
    it('単一ダメージ点: 残HPと攻撃側HPの平均で新残HPを算出', () => {
      // HP=100, 累積50ダメ → 残50
      // 攻撃側HP=100 → newRemain=floor((100+50)/2)=75 → newDmg=100-75=25
      const dist = new Map<number, number>([[50, 1.0]])
      const out = applyPainSplitToDmgDist(dist, 100, 100)
      expect(out.size).toBe(1)
      expect(out.get(25)).toBeCloseTo(1.0, 6)
    })

    it('攻撃側HP<残HP のとき防御側は追加ダメージを受ける', () => {
      // HP=100, 累積20ダメ → 残80
      // 攻撃側HP=10 → newRemain=floor((10+80)/2)=45 → newDmg=55
      const dist = new Map<number, number>([[20, 1.0]])
      const out = applyPainSplitToDmgDist(dist, 100, 10)
      expect(out.get(55)).toBeCloseTo(1.0, 6)
    })

    it('複数ダメージ点の分布を保ったまま変換', () => {
      // HP=100, {80: 0.5, 60: 0.5}, 攻撃側HP=10
      // 残20→floor(15)=15→dmg85, 残40→floor(25)=25→dmg75
      const dist = new Map<number, number>([[80, 0.5], [60, 0.5]])
      const out = applyPainSplitToDmgDist(dist, 100, 10)
      expect(out.get(85)).toBeCloseTo(0.5, 6)
      expect(out.get(75)).toBeCloseTo(0.5, 6)
    })

    it('newRemain は防御側最大HPで上限クランプされる', () => {
      // HP=100, 累積0ダメ → 残100。攻撃側HP=200 → floor((200+100)/2)=150 だが上限100でクランプ → newDmg=0
      const dist = new Map<number, number>([[0, 1.0]])
      const out = applyPainSplitToDmgDist(dist, 100, 200)
      expect(out.get(0)).toBeCloseTo(1.0, 6)
    })

    it('既に瀕死 (dmg≥defenderMaxHp) のキーは残HP=0として扱われる', () => {
      // HP=100, 累積120ダメ → 残HP=max(0, -20)=0
      // 攻撃側HP=80 → newRemain=floor((80+0)/2)=40 → newDmg=60
      const dist = new Map<number, number>([[120, 1.0]])
      const out = applyPainSplitToDmgDist(dist, 100, 80)
      expect(out.get(60)).toBeCloseTo(1.0, 6)
    })

    it('2セグメント分割DPで「攻撃→痛み分け→攻撃」が機能する', () => {
      // 防御側 HP=200、攻撃側 HP=200
      // セグ1: 確定80ダメ → 残120 (dmg=80)
      // 痛み分け: floor((200+120)/2)=160 → 累積40ダメ
      // セグ2: 確定80ダメ → 残80 (累積120ダメ)
      const seg1 = calcCombinedDamageDistribution([[80]], 0)
      const afterSplit = applyPainSplitToDmgDist(seg1, 200, 200)
      const seg2 = calcCombinedDamageDistribution([[80]], afterSplit)
      expect(seg2.size).toBe(1)
      expect(seg2.get(120)).toBeCloseTo(1.0, 6)
    })

    it('初期分布として Map を受け取る calcCombinedDamageDistribution', () => {
      // {30: 0.5, 50: 0.5} + 一様ロール[10, 20]
      // 30+10=40 0.25, 30+20=50 0.25, 50+10=60 0.25, 50+20=70 0.25
      const init = new Map<number, number>([[30, 0.5], [50, 0.5]])
      const out = calcCombinedDamageDistribution([[10, 20]], init)
      expect(out.get(40)).toBeCloseTo(0.25, 6)
      expect(out.get(50)).toBeCloseTo(0.25, 6)
      expect(out.get(60)).toBeCloseTo(0.25, 6)
      expect(out.get(70)).toBeCloseTo(0.25, 6)
    })
  })
})
