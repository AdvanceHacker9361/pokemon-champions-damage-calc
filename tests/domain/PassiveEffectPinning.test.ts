import { describe, expect, it } from 'vitest'
import {
  pinPassiveEffects,
  pinnedEventLabel,
  collectEffectIds,
  type ProgressionEventLike,
} from '@/domain/calculators/PassiveEffectPinning'
import {
  buildPassiveSchedule,
  turnEndItemsAfter,
  type AutoEventItem,
  type PassiveExpansionContext,
} from '@/domain/calculators/PassiveEffectExpansion'
import { computeTurnRanges, TURN_END_ORDER, type PassiveEffect } from '@/domain/models/PassiveEffect'

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

describe('部分固定化でもターン末の order が保たれる', () => {
  type AnyEv = TestEvent & { pinnedTiming?: string; pinnedOrder?: number; pinnedTurn?: number }

  /** フックの適用順（イベント → その直後の自動項目）をラベル列にする */
  function hookOrder(events: AnyEv[], effects: PassiveEffect[]): string[] {
    const schedule = buildPassiveSchedule(events, effects, CTX)
    const ranges = new Map(computeTurnRanges(events).map(r => [r.eventId, r] as const))
    const lbl = (items: AutoEventItem[] | undefined) => (items ?? []).map(i => i.label)
    const out: string[] = lbl(schedule.start)
    for (const ev of events) {
      if (ev.kind === 'attack') {
        // useBattleSequence と同じく usage ごとに perAttack → そのターンのターン末
        const start = ranges.get(ev.id)!.startTurn
        for (let u = 0; u < Math.max(1, ev.usages ?? 1); u++) {
          out.push('__attack__')
          out.push(...lbl(schedule.perAttackByTurn[start + u]))
          out.push(...lbl(turnEndItemsAfter(schedule, ev.id, start + u)))
        }
        continue
      }
      out.push(ev.kind === 'incoming' ? '__incoming__' : (ev.label ?? '').replace(/^(開始時|T\d+末?) /, ''))
      out.push(...lbl(schedule.perAttackByEventId[ev.id]))
      out.push(...lbl(turnEndItemsAfter(schedule, ev.id)))
    }
    out.push(...schedule.trailing.map(i => i.label))
    return out
  }

  const effects = () => [
    eff('burn', { label: 'やけど', order: TURN_END_ORDER.burn }),
    eff('sand', { label: 'すなあらし', order: TURN_END_ORDER.weather }),
    eff('left', { kind: 'recover', label: 'たべのこし', order: TURN_END_ORDER.itemHeal }),
  ]
  const baseEvents = (): AnyEv[] => [attack('a1', 2), { id: 'in1', kind: 'incoming' }, attack('a2')]

  it('やけど だけ固定化しても、残った すなあらし・たべのこし は固定化やけどより前に適用される', () => {
    idSeq = 0
    const all = effects()
    const before = hookOrder(baseEvents(), all)
    const res = pinPassiveEffects(baseEvents(), all, ['burn'], CTX, genId)
    const remaining = all.filter(e => !res.removedEffectIds.includes(e.id))
    const after = hookOrder(loose(res.events) as AnyEv[], remaining)
    expect(after).toEqual(before)
    expect(before).toEqual([
      '__attack__', 'すなあらし', 'たべのこし', 'やけど',
      '__attack__', '__incoming__', 'すなあらし', 'たべのこし', 'やけど',
      '__attack__', 'すなあらし', 'たべのこし', 'やけど',
    ])
    // 固定化行はメタ情報を持つ
    expect(loose(res.events).find(e => e.kind === 'defenderConst')).toMatchObject({
      pinnedTurn: 1, pinnedOrder: TURN_END_ORDER.burn, pinnedTiming: 'turnEnd',
    })
  })

  it('2 段階の部分固定化（たべのこし → すなあらし）は一括固定化と同じ並びになる', () => {
    idSeq = 0
    const all = effects()
    const step1 = pinPassiveEffects(baseEvents(), all, ['left'], CTX, genId)
    const rest1 = all.filter(e => !step1.removedEffectIds.includes(e.id))
    const step2 = pinPassiveEffects(loose(step1.events), rest1, ['sand'], CTX, genId)
    const rest2 = rest1.filter(e => !step2.removedEffectIds.includes(e.id))
    const step3 = pinPassiveEffects(loose(step2.events), rest2, ['burn'], CTX, genId)

    idSeq = 100
    const once = pinPassiveEffects(baseEvents(), all, ['burn', 'sand', 'left'], CTX, genId)

    const shape = (evs: unknown[]) => loose(evs).map(e =>
      e.kind === 'attack' || e.kind === 'incoming' ? `${e.kind}:${e.usages ?? ''}` : `${e.kind}:${e.label}`)
    expect(shape(step3.events)).toEqual(shape(once.events))
    // 途中段階でもフックの適用順は固定化前と同じ
    expect(hookOrder(loose(step2.events) as AnyEv[], rest2)).toEqual(hookOrder(baseEvents(), all))
    expect(hookOrder(loose(step1.events) as AnyEv[], rest1)).toEqual(hookOrder(baseEvents(), all))
  })

  it('attack の usages 分割を伴う部分固定化でも order が保たれる', () => {
    idSeq = 0
    const all = effects()
    const events = (): AnyEv[] => [attack('a1', 3)]
    const res = pinPassiveEffects(events(), all, ['left'], CTX, genId)
    expect(kinds(res.events).filter(k => k === 'attack')).toHaveLength(3)
    const rest = all.filter(e => !res.removedEffectIds.includes(e.id))
    expect(hookOrder(loose(res.events) as AnyEv[], rest)).toEqual(hookOrder(events(), all))
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
