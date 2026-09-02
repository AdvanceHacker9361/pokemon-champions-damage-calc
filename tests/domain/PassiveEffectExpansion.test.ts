import { describe, expect, it } from 'vitest'
import {
  buildPassiveSchedule,
  autoItemToSeqEvent,
  autoItemLabel,
  MAX_TRAILING_TURNS,
  type PassiveExpansionContext,
} from '@/domain/calculators/PassiveEffectExpansion'
import {
  applyRounding,
  resolvePassiveAmount,
  TURN_END_ORDER,
  type PassiveEffect,
  type TurnEventLike,
} from '@/domain/models/PassiveEffect'

const CTX: PassiveExpansionContext = {
  attackerMaxHp: 160,
  defenderMaxHp: 200,
  attackerTypes: ['ドラゴン', 'じめん'],
  defenderTypes: ['はがね'],
}

let seq = 0
function eff(partial: Partial<PassiveEffect>): PassiveEffect {
  seq++
  return {
    id: `eff${seq}`,
    side: 'defender',
    kind: 'damage',
    amount: { type: 'ratio', num: 1, den: 16, rounding: 'floor' },
    timing: 'turnEnd',
    count: 'all',
    startTurn: 1,
    order: TURN_END_ORDER.custom,
    label: 'テスト効果',
    ...partial,
  }
}

function attack(id: string, usages = 1): TurnEventLike {
  return { id, kind: 'attack', usages }
}

describe('buildPassiveSchedule', () => {
  it('ターン末項目はターンを含む最後のイベントに紐づく（attack usages 3 + incoming）', () => {
    const events: TurnEventLike[] = [attack('a1', 3), { id: 'in1', kind: 'incoming' }]
    const s = buildPassiveSchedule(events, [eff({})], CTX)

    expect(s.totalTurns).toBe(3)
    // T1/T2 は attack、T3 は後続の incoming が所有する
    expect(s.turnEndOwner).toEqual({ 1: 'a1', 2: 'a1', 3: 'in1' })
    expect(s.afterEvent['a1'].map(i => i.turn)).toEqual([1, 2])
    expect(s.afterEvent['in1'].map(i => i.turn)).toEqual([3])
    // 200/16 = 12.5 → 切り捨て 12
    expect(s.afterEvent['a1'][0].amount).toBe(12)
  })

  it('後続イベントが無ければ attack が自分の全ターンを所有する', () => {
    const s = buildPassiveSchedule([attack('a1', 2)], [eff({})], CTX)
    expect(s.turnEndOwner).toEqual({ 1: 'a1', 2: 'a1' })
    expect(s.afterEvent['a1']).toHaveLength(2)
    expect(s.trailing).toHaveLength(0)
  })

  it('start は count 回だけ先頭に置かれる（count "all" は1回扱い）', () => {
    const s = buildPassiveSchedule(
      [attack('a1')],
      [
        eff({ timing: 'start', count: 2, amount: { type: 'fixed', value: 7 } }),
        eff({ timing: 'start', count: 'all', amount: { type: 'fixed', value: 3 } }),
      ],
      CTX,
    )
    expect(s.start.map(i => i.amount)).toEqual([7, 7, 3])
    expect(s.start.every(i => i.turn === 0)).toBe(true)
  })

  it('同一ターン末は order 昇順 → 同 order は配列順で並ぶ', () => {
    const s = buildPassiveSchedule(
      [attack('a1')],
      [
        eff({ label: 'やけど', order: TURN_END_ORDER.burn }),
        eff({ label: '天候', order: TURN_END_ORDER.weather }),
        eff({ label: 'たべのこし', kind: 'recover', order: TURN_END_ORDER.itemHeal }),
        eff({ label: '天候2', order: TURN_END_ORDER.weather }),
      ],
      CTX,
    )
    expect(s.turnEnd[1].map(i => i.label)).toEqual(['天候', '天候2', 'たべのこし', 'やけど'])
  })

  it('startTurn 以降のターンにだけ適用される', () => {
    const s = buildPassiveSchedule([attack('a1', 4)], [eff({ startTurn: 3 })], CTX)
    expect(Object.keys(s.turnEnd).map(Number).sort((a, b) => a - b)).toEqual([3, 4])
  })

  it('count "all" は既存ターン数まで、数値 count は末尾ターンへ延長される', () => {
    const all = buildPassiveSchedule([attack('a1', 2)], [eff({ count: 'all' })], CTX)
    expect(all.trailing).toHaveLength(0)
    expect(Object.keys(all.turnEnd)).toHaveLength(2)

    const five = buildPassiveSchedule([attack('a1', 2)], [eff({ count: 5 })], CTX)
    expect(five.afterEvent['a1']).toHaveLength(2)
    // T3〜T5 はタイムラインに無いターンなので trailing へ
    expect(five.trailing.map(i => i.turn)).toEqual([3, 4, 5])
  })

  it('trailing ターンは MAX_TRAILING_TURNS で頭打ちになる', () => {
    const s = buildPassiveSchedule([attack('a1')], [eff({ count: 999 })], CTX)
    expect(s.trailing).toHaveLength(MAX_TRAILING_TURNS)
    expect(s.trailing[s.trailing.length - 1].turn).toBe(1 + MAX_TRAILING_TURNS)
  })

  it('攻撃が無い時系列では "all" のターン末は展開されない', () => {
    const s = buildPassiveSchedule([{ id: 'c1', kind: 'defenderConst' }], [eff({ count: 'all' })], CTX)
    expect(s.totalTurns).toBe(0)
    expect(s.trailing).toHaveLength(0)
    expect(Object.keys(s.afterEvent)).toHaveLength(0)
  })

  it('perAttack（攻撃側）は attack の usage ごとに1回ずつ適用される', () => {
    const lifeOrb = eff({
      side: 'attacker', timing: 'perAttack', count: 'all', label: 'いのちのたま',
      amount: { type: 'ratio', num: 1, den: 10, rounding: 'floor' },
    })
    const s = buildPassiveSchedule([attack('a1', 3)], [lifeOrb], CTX)
    expect(Object.keys(s.perAttackByTurn).map(Number)).toEqual([1, 2, 3])
    // 攻撃側 HP 160 の 1/10
    expect(s.perAttackByTurn[1][0].amount).toBe(16)
    // 集約ビューは perAttack → そのターン末 の順（ここではターン末項目なし）
    expect(s.afterEvent['a1']).toHaveLength(3)
  })

  it('perAttack（攻撃側）は count で打ち切られ、startTurn より前は適用されない', () => {
    const s = buildPassiveSchedule(
      [attack('a1', 4)],
      [eff({ side: 'attacker', timing: 'perAttack', count: 2, startTurn: 2 })],
      CTX,
    )
    expect(Object.keys(s.perAttackByTurn).map(Number)).toEqual([2, 3])
  })

  it('perAttack（防御側）は incoming イベントごとに適用される', () => {
    const events: TurnEventLike[] = [
      attack('a1'),
      { id: 'in1', kind: 'incoming' },
      attack('a2'),
      { id: 'in2', kind: 'incoming' },
    ]
    const s = buildPassiveSchedule(events, [eff({ timing: 'perAttack', count: 'all' })], CTX)
    expect(Object.keys(s.perAttackByEventId).sort()).toEqual(['in1', 'in2'])
    expect(s.perAttackByEventId['in1'][0].turn).toBe(1)
    expect(s.perAttackByEventId['in2'][0].turn).toBe(2)
  })

  it('perAttack と ターン末が同じイベントに来るとき perAttack が先に並ぶ', () => {
    const events: TurnEventLike[] = [attack('a1'), { id: 'in1', kind: 'incoming' }]
    const s = buildPassiveSchedule(
      events,
      [
        eff({ label: 'ターン末', order: TURN_END_ORDER.weather }),
        eff({ label: '被弾ごと', timing: 'perAttack', count: 'all' }),
      ],
      CTX,
    )
    expect(s.afterEvent['in1'].map(i => i.label)).toEqual(['被弾ごと', 'ターン末'])
  })

  it('もうどくは効果ごとに k を数え上げる（k/16 累進）', () => {
    const s = buildPassiveSchedule(
      [attack('a1', 3)],
      [eff({ amount: { type: 'toxic' }, order: TURN_END_ORDER.poison })],
      CTX,
    )
    // 200 * k/16 = 12 / 25 / 37
    expect(s.afterEvent['a1'].map(i => i.amount)).toEqual([12, 25, 37])
  })

  it('ステルスロックは対象タイプのいわ相性で量が変わる', () => {
    const rock = eff({ timing: 'start', count: 1, amount: { type: 'stealthRock' } })
    const flyingFire = buildPassiveSchedule([attack('a1')], [rock], {
      ...CTX, defenderTypes: ['ひこう', 'ほのお'],
    })
    // 4倍 → 200 * 4 / 8 = 100
    expect(flyingFire.start[0].amount).toBe(100)

    const steel = buildPassiveSchedule([attack('a1')], [rock], CTX)
    // はがねは 0.5 倍 → 200 * 0.5 / 8 = 12.5 → 12
    expect(steel.start[0].amount).toBe(12)
  })

  it('やどりぎは side（被ダメ側）から SeqEvent の direction を決める', () => {
    const s = buildPassiveSchedule(
      [attack('a1')],
      [
        eff({ kind: 'leechSeed', side: 'defender', label: 'やどりぎ', amount: { type: 'ratio', num: 1, den: 8, rounding: 'floor' } }),
        eff({ kind: 'leechSeed', side: 'attacker', label: 'やどりぎ', amount: { type: 'ratio', num: 1, den: 8, rounding: 'floor' } }),
      ],
      CTX,
    )
    const [toDefender, toAttacker] = s.turnEnd[1]
    expect(autoItemToSeqEvent(toDefender)).toEqual({
      kind: 'leechSeed', direction: 'fromAttacker', amount: 25,
    })
    expect(autoItemToSeqEvent(toAttacker)).toEqual({
      kind: 'leechSeed', direction: 'fromDefender', amount: 20,
    })
  })

  it('ダメージ/回復は側に応じた SeqEvent へ変換される', () => {
    const s = buildPassiveSchedule(
      [attack('a1')],
      [
        eff({ kind: 'damage', side: 'defender', amount: { type: 'fixed', value: 9 } }),
        eff({ kind: 'damage', side: 'attacker', amount: { type: 'fixed', value: 8 } }),
        eff({ kind: 'recover', side: 'defender', amount: { type: 'fixed', value: 7 } }),
        eff({ kind: 'recover', side: 'attacker', amount: { type: 'fixed', value: 6 } }),
      ],
      CTX,
    )
    expect(s.turnEnd[1].map(autoItemToSeqEvent)).toEqual([
      { kind: 'defenderConst', amount: 9 },
      { kind: 'attackerConst', amount: 8 },
      { kind: 'defenderRecover', amount: 7 },
      { kind: 'attackerRecover', amount: 6 },
    ])
  })

  it('自動項目のラベルにターンと増減が入る', () => {
    const s = buildPassiveSchedule([attack('a1', 2)], [eff({ label: 'すなあらし' })], CTX)
    expect(autoItemLabel(s.turnEnd[2][0])).toBe('T2末 すなあらし 防−12')
  })
})

describe('resolvePassiveAmount の丸め', () => {
  const base = { targetMaxHp: 101, targetTypes: [] as never[] }

  it('切り捨て / 四捨五入 / 切り上げ / 五捨五超入', () => {
    const half = (rounding: 'floor' | 'round' | 'ceil' | 'roundHalfDown') =>
      resolvePassiveAmount({ type: 'ratio', num: 1, den: 2, rounding }, base)
    // 101/2 = 50.5
    expect(half('floor')).toBe(50)
    expect(half('round')).toBe(51)
    expect(half('ceil')).toBe(51)
    // 五捨五超入: ちょうど .5 は切り捨て
    expect(half('roundHalfDown')).toBe(50)
    // .5 超は切り上げ
    expect(applyRounding(50.51, 'roundHalfDown')).toBe(51)
    expect(applyRounding(50.5, 'roundHalfDown')).toBe(50)
  })

  it('割合は最低1になる', () => {
    expect(resolvePassiveAmount(
      { type: 'ratio', num: 1, den: 16, rounding: 'floor' },
      { targetMaxHp: 8, targetTypes: [] },
    )).toBe(1)
  })

  it('もうどくは 15/16 で頭打ち', () => {
    const at = (k: number) => resolvePassiveAmount({ type: 'toxic' }, { targetMaxHp: 160, targetTypes: [], toxicCounter: k })
    expect(at(1)).toBe(10)
    expect(at(2)).toBe(20)
    expect(at(15)).toBe(150)
    expect(at(20)).toBe(150)
  })
})
