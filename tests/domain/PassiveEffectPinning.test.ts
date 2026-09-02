import { describe, expect, it } from 'vitest'
import {
  pinPassiveEffects,
  pinnedEventLabel,
  collectEffectIds,
  type ProgressionEventLike,
} from '@/domain/calculators/PassiveEffectPinning'
import {
  buildPassiveSchedule,
  type PassiveExpansionContext,
} from '@/domain/calculators/PassiveEffectExpansion'
import { TURN_END_ORDER, type PassiveEffect } from '@/domain/models/PassiveEffect'

const CTX: PassiveExpansionContext = {
  attackerMaxHp: 160,
  defenderMaxHp: 200,
  attackerTypes: ['ドラゴン', 'じめん'],
  defenderTypes: ['はがね'],
}

let idSeq = 0
function genId(): string {
  idSeq++
  return `new${idSeq}`
}

function eff(id: string, partial: Partial<PassiveEffect> = {}): PassiveEffect {
  return {
    id,
    side: 'defender',
    kind: 'damage',
    amount: { type: 'ratio', num: 1, den: 16, rounding: 'floor' },
    timing: 'turnEnd',
    count: 'all',
    startTurn: 1,
    order: TURN_END_ORDER.weather,
    label: 'すなあらし',
    ...partial,
  }
}

/** 攻撃イベントの最小形（AttackPayload 由来のフィールドも一部持たせて複製規則を検証する） */
type TestEvent = ProgressionEventLike & { hadMultiscale?: boolean }

function attack(id: string, usages = 1, extra: Partial<TestEvent> = {}): TestEvent {
  return { id, kind: 'attack', usages, label: '与ダメ', ...extra }
}

const kinds = (evs: { kind: string }[]) => evs.map(e => e.kind)
const ids = (evs: { id: string }[]) => evs.map(e => e.id)
/** 結果イベントを検査しやすい緩い形へ（union の絞り込みをテスト側で省くため） */
const loose = (evs: unknown[]) => evs as TestEvent[]

describe('pinPassiveEffects', () => {
  it('start 項目は先頭へ、ターン末項目はそのターンを持つ最後のイベント直後へ置かれる', () => {
    idSeq = 0
    const events = [attack('a1'), { id: 'in1', kind: 'incoming' }]
    const effects = [
      eff('rock', { timing: 'start', count: 1, amount: { type: 'stealthRock' }, label: 'ステロ' }),
      eff('sand'),
    ]
    const res = pinPassiveEffects(events, effects, ['rock', 'sand'], CTX, genId)

    // T1 は attack と incoming の両方が含む → 所有者は最後の incoming
    expect(kinds(res.events)).toEqual(['defenderConst', 'attack', 'incoming', 'defenderConst'])
    expect(ids(res.events)).toEqual(['new1', 'a1', 'in1', 'new2'])
    expect(res.removedEffectIds).toEqual(['rock', 'sand'])

    // はがねは いわ 0.5 倍 → floor(200 * 0.5 / 8) = 12 / すなあらし floor(200/16) = 12
    expect(res.events[0]).toMatchObject({
      kind: 'defenderConst', amount: 12, label: '開始時 ステロ', source: 'pinned',
    })
    expect(res.events[3]).toMatchObject({
      kind: 'defenderConst', amount: 12, label: 'T1末 すなあらし', source: 'pinned',
    })
  })

  it('防御側 perAttack は incoming の直後、攻撃側 perAttack は attack の直後へ置かれる', () => {
    idSeq = 0
    const events = [attack('a1'), { id: 'in1', kind: 'incoming' }]
    const effects = [
      eff('orb', {
        side: 'attacker', timing: 'perAttack', count: 'all',
        amount: { type: 'ratio', num: 1, den: 10, rounding: 'floor' },
        label: 'いのちのたま', order: TURN_END_ORDER.custom,
      }),
      eff('rocky', {
        side: 'defender', timing: 'perAttack', count: 'all',
        amount: { type: 'ratio', num: 1, den: 8, rounding: 'floor' },
        label: 'ゴツゴツメット', order: TURN_END_ORDER.custom,
      }),
    ]
    const res = pinPassiveEffects(events, effects, ['orb', 'rocky'], CTX, genId)

    expect(kinds(res.events)).toEqual(['attack', 'attackerConst', 'incoming', 'defenderConst'])
    // 攻撃側 160/10 = 16 / 防御側 200/8 = 25
    expect(res.events[1]).toMatchObject({ amount: 16, label: 'T1 いのちのたま' })
    expect(res.events[3]).toMatchObject({ amount: 25, label: 'T1 ゴツゴツメット' })
  })

  it('trailing（既存ターンを超えた分）は末尾へ置かれる', () => {
    idSeq = 0
    const events = [attack('a1')]
    // 3 ターン分のもうどく（時系列は 1 ターンしかない → 2 件が trailing）
    const effects = [eff('tox', { count: 3, amount: { type: 'toxic' }, label: 'もうどく', order: TURN_END_ORDER.poison })]
    const res = pinPassiveEffects(events, effects, ['tox'], CTX, genId)

    expect(kinds(res.events)).toEqual(['attack', 'defenderConst', 'defenderConst', 'defenderConst'])
    // k/16 累進: 12 / 25 / 37
    expect(loose(res.events).slice(1).map(e => e.amount)).toEqual([12, 25, 37])
    expect(loose(res.events).slice(1).map(e => e.label)).toEqual([
      'T1末 もうどく', 'T2末 もうどく', 'T3末 もうどく',
    ])
  })

  it('usages=3 の attack は分割され、各 usage の直後へ項目が挟まる', () => {
    idSeq = 0
    const events = [attack('a1', 3, { firstHitNullified: true, firstHitFixedDamage: 7, hadMultiscale: true })]
    const res = pinPassiveEffects(events, [eff('sand')], ['sand'], CTX, genId)

    expect(kinds(res.events)).toEqual([
      'attack', 'defenderConst', 'attack', 'defenderConst', 'attack', 'defenderConst',
    ])
    // 1つ目は元の id を保ち usages=1 に、2つ目以降は新 id
    const copies = loose(res.events).filter(e => e.kind === 'attack')
    expect(ids(copies)).toEqual(['a1', 'new2', 'new4'])
    expect(copies.map(e => e.usages)).toEqual([1, 1, 1])

    // コピー1は「最初の使用だけ」のフィールドを保持、コピー2以降は落とす
    expect(copies[0]).toMatchObject({ firstHitNullified: true, firstHitFixedDamage: 7, hadMultiscale: true })
    expect(copies[1].firstHitNullified).toBe(false)
    expect('firstHitFixedDamage' in copies[1]).toBe(false)
    expect(copies[1].hadMultiscale).toBe(true)
    expect(copies[2].firstHitNullified).toBe(false)
    expect('firstHitFixedDamage' in copies[2]).toBe(false)
  })

  it('最後の usage にしか項目が無ければ分割しない', () => {
    idSeq = 0
    const events = [attack('a1', 3)]
    // T3 のみ（startTurn=3）
    const res = pinPassiveEffects(events, [eff('sand', { startTurn: 3 })], ['sand'], CTX, genId)

    expect(kinds(res.events)).toEqual(['attack', 'defenderConst'])
    expect(res.events[0]).toMatchObject({ id: 'a1', usages: 3 })
    expect(res.events[1]).toMatchObject({ label: 'T3末 すなあらし' })
  })

  it('やどりぎは実量つきの leechSeed イベントになる（side = 被ダメ側）', () => {
    idSeq = 0
    const events = [attack('a1')]
    const effects = [eff('leech', {
      kind: 'leechSeed', side: 'defender', count: 1,
      amount: { type: 'ratio', num: 1, den: 8, rounding: 'floor' },
      label: 'やどりぎ', order: TURN_END_ORDER.leechSeed,
    })]
    const res = pinPassiveEffects(events, effects, ['leech'], CTX, genId)

    expect(res.events[1]).toMatchObject({
      kind: 'leechSeed', direction: 'fromAttacker', amount: 25,
      label: 'T1末 やどりぎ', source: 'pinned',
    })
  })

  it('固定化対象でない常時効果はイベント化されず、リストにも残る', () => {
    idSeq = 0
    const events = [attack('a1', 2)]
    const effects = [eff('sand'), eff('burn', { label: 'やけど', order: TURN_END_ORDER.burn })]
    const res = pinPassiveEffects(events, effects, ['sand'], CTX, genId)

    expect(res.removedEffectIds).toEqual(['sand'])
    expect(loose(res.events).filter(e => e.kind === 'defenderConst').map(e => e.label))
      .toEqual(['T1末 すなあらし', 'T2末 すなあらし'])
  })

  it('存在しない id や count=0 の効果は、イベントを増やさずに取り除かれる', () => {
    idSeq = 0
    const events = [attack('a1')]
    const zero = eff('zero', { count: 0 })
    const res = pinPassiveEffects(events, [zero], ['zero', 'missing'], CTX, genId)

    expect(res.removedEffectIds).toEqual(['zero'])
    expect(kinds(res.events)).toEqual(['attack'])

    const none = pinPassiveEffects(events, [zero], ['missing'], CTX, genId)
    expect(none.removedEffectIds).toEqual([])
    expect(kinds(none.events)).toEqual(['attack'])
  })

  it('固定化後のイベント列は、フックが自動適用する順序と一致する', () => {
    idSeq = 0
    const events = [attack('a1', 2), { id: 'in1', kind: 'incoming' }]
    const effects = [
      eff('rock', { timing: 'start', count: 1, amount: { type: 'fixed', value: 5 }, label: 'ステロ' }),
      eff('sand'),
      eff('left', { kind: 'recover', label: 'たべのこし', order: TURN_END_ORDER.itemHeal }),
    ]
    const schedule = buildPassiveSchedule(events, effects, CTX)
    const res = pinPassiveEffects(events, effects, effects.map(e => e.id), CTX, genId)

    // schedule のフック適用順（start → attack usage ごと → incoming 直後 → trailing）
    const expected = [
      ...schedule.start.map(i => i.label),
      '__attack__',
      ...(schedule.turnEnd[1] ?? []).map(i => i.label),
      '__attack__',
      // T2 は incoming が所有するので attack の後には来ない
      '__incoming__',
      ...(schedule.turnEnd[2] ?? []).map(i => i.label),
    ]
    const actual = loose(res.events).map(e =>
      e.kind === 'attack' ? '__attack__'
        : e.kind === 'incoming' ? '__incoming__'
          : (e.label ?? '').replace(/^(開始時|T\d+末?) /, '')
    )
    expect(actual).toEqual(expected)
  })
})

describe('pinnedEventLabel / collectEffectIds', () => {
  it('タイミングごとのラベル書式', () => {
    const base = { side: 'defender' as const, kind: 'damage' as const, amount: 12, effectId: 'e1' }
    expect(pinnedEventLabel({ ...base, turn: 0, timing: 'start', label: 'ステロ' })).toBe('開始時 ステロ')
    expect(pinnedEventLabel({ ...base, turn: 2, timing: 'turnEnd', label: 'すなあらし' })).toBe('T2末 すなあらし')
    expect(pinnedEventLabel({ ...base, turn: 3, timing: 'perAttack', label: 'いのちのたま' })).toBe('T3 いのちのたま')
  })

  it('重複を除いて出現順に effectId を集める', () => {
    const item = (effectId: string) => ({
      turn: 1, side: 'defender' as const, kind: 'damage' as const,
      label: 'x', amount: 1, effectId, timing: 'turnEnd' as const,
    })
    expect(collectEffectIds([item('b'), item('a'), item('b')])).toEqual(['b', 'a'])
  })
})
