import { describe, expect, it } from 'vitest'
import {
  deriveImpliedPassiveEffects,
  impliedEffectId,
  isImpliedEffect,
  mergePassiveEffects,
  type ImpliedSideState,
} from '@/domain/calculators/ImpliedPassiveEffects'
import { findPassivePreset, TURN_END_ORDER, type PassiveEffect } from '@/domain/models/PassiveEffect'
import { buildPassiveSchedule } from '@/domain/calculators/PassiveEffectExpansion'
import { collectEffectIds, pinPassiveEffects } from '@/domain/calculators/PassiveEffectPinning'

const NONE: ImpliedSideState = { item: null, status: null, ability: 'なし', types: ['ノーマル'] }

function side(partial: Partial<ImpliedSideState>): ImpliedSideState {
  return { ...NONE, ...partial }
}

function derive(attacker: Partial<ImpliedSideState> = {}, defender: Partial<ImpliedSideState> = {}) {
  return deriveImpliedPassiveEffects({ attacker: side(attacker), defender: side(defender) })
}

/** プリセットの数値（amount / timing / order / kind / label）と一致するか */
function expectMatchesPreset(eff: PassiveEffect, presetKey: string) {
  const preset = findPassivePreset(presetKey)!
  expect(preset).toBeDefined()
  expect(eff).toMatchObject({
    presetKey,
    kind: preset.kind,
    amount: preset.amount,
    timing: preset.timing,
    order: preset.order,
    label: preset.short,
    count: 'all',
    startTurn: 1,
  })
}

describe('deriveImpliedPassiveEffects', () => {
  it('何も持たず状態異常なしなら何も導出しない', () => {
    expect(derive()).toEqual([])
  })

  it('いのちのたま → lifeOrb（その側・攻撃ごと・持ち物由来）', () => {
    const [eff, ...rest] = derive({ item: 'いのちのたま' })
    expect(rest).toHaveLength(0)
    expectMatchesPreset(eff, 'lifeOrb')
    expect(eff).toMatchObject({ side: 'attacker', origin: 'item', id: 'implied:attacker:lifeOrb' })

    const [def] = derive({}, { item: 'いのちのたま' })
    expect(def).toMatchObject({ side: 'defender', presetKey: 'lifeOrb', id: 'implied:defender:lifeOrb' })
  })

  it('たべのこし → leftovers（1/16 回復・ターン末）', () => {
    const [eff] = derive({}, { item: 'たべのこし' })
    expectMatchesPreset(eff, 'leftovers')
    expect(eff).toMatchObject({ side: 'defender', kind: 'recover', origin: 'item' })
  })

  it('くろいヘドロ: どくタイプは 1/16 回復、それ以外は 1/8 ダメージ（どちらも持ち物回復の順序）', () => {
    const [heal] = derive({}, { item: 'くろいヘドロ', types: ['どく', 'あく'] })
    expectMatchesPreset(heal, 'blackSludge')
    expect(heal).toMatchObject({
      kind: 'recover', amount: { type: 'ratio', num: 1, den: 16 }, order: TURN_END_ORDER.itemHeal,
    })

    const [dmg] = derive({}, { item: 'くろいヘドロ', types: ['みず'] })
    expectMatchesPreset(dmg, 'blackSludgeDamage')
    expect(dmg).toMatchObject({
      kind: 'damage', amount: { type: 'ratio', num: 1, den: 8 }, order: TURN_END_ORDER.itemHeal,
    })
  })

  it('やけど / どく / もうどく → burn / poison / toxic（状態異常由来）', () => {
    const [burn] = derive({}, { status: 'やけど' })
    expectMatchesPreset(burn, 'burn')
    expect(burn.origin).toBe('status')

    const [poison] = derive({}, { status: 'どく' })
    expectMatchesPreset(poison, 'poison')

    const [toxic] = derive({ status: 'もうどく' })
    expectMatchesPreset(toxic, 'toxic')
    expect(toxic).toMatchObject({ side: 'attacker', amount: { type: 'toxic' } })
  })

  it('まひ / ねむり / その他の持ち物からは何も導出しない', () => {
    expect(derive({ status: 'まひ' }, { status: 'ねむり' })).toEqual([])
    expect(derive({ item: 'こだわりハチマキ' }, { item: 'オボンのみ' })).toEqual([])
  })

  it('マジックガード: 反動・状態異常ダメ・くろいヘドロのダメージを導出しない（回復は導出する）', () => {
    expect(derive({ item: 'いのちのたま', status: 'やけど', ability: 'マジックガード' })).toEqual([])
    expect(derive({ item: 'くろいヘドロ', status: 'もうどく', ability: 'マジックガード' })).toEqual([])
    expect(derive({}, { status: 'どく', ability: 'マジックガード' })).toEqual([])
    const kept = derive({ item: 'たべのこし', status: 'どく', ability: 'マジックガード' })
    expect(kept.map(e => e.presetKey)).toEqual(['leftovers'])
  })

  it('ポイズンヒール + どく/もうどく → poisonHeal（1/8 回復）に置き換え。やけどはそのまま', () => {
    for (const status of ['どく', 'もうどく'] as const) {
      const effs = derive({}, { status, ability: 'ポイズンヒール' })
      expect(effs).toHaveLength(1)
      expectMatchesPreset(effs[0], 'poisonHeal')
      expect(effs[0]).toMatchObject({ kind: 'recover', origin: 'status' })
    }
    expect(derive({}, { status: 'やけど', ability: 'ポイズンヒール' }).map(e => e.presetKey)).toEqual(['burn'])
  })

  it('持ち物と状態異常を両方導出し、id は決定的（攻撃側 → 防御側、持ち物 → 状態異常の順）', () => {
    const input = {
      attacker: side({ item: 'いのちのたま', status: 'やけど' }),
      defender: side({ item: 'たべのこし', status: 'もうどく' }),
    }
    const a = deriveImpliedPassiveEffects(input)
    const b = deriveImpliedPassiveEffects(input)
    expect(a.map(e => e.id)).toEqual([
      'implied:attacker:lifeOrb',
      'implied:attacker:burn',
      'implied:defender:leftovers',
      'implied:defender:toxic',
    ])
    expect(b).toEqual(a)
    expect(impliedEffectId('defender', 'burn')).toBe('implied:defender:burn')
    expect(a.every(isImpliedEffect)).toBe(true)
  })

  it('くろいヘドロ(非どく) + どく は別キーのため両方導出される', () => {
    const keys = derive({}, { item: 'くろいヘドロ', status: 'どく', types: ['みず'] }).map(e => e.presetKey)
    expect(keys).toEqual(['blackSludgeDamage', 'poison'])
  })
})

describe('mergePassiveEffects', () => {
  const manualLifeOrb: PassiveEffect = {
    id: 'm1', side: 'attacker', kind: 'damage',
    amount: { type: 'ratio', num: 1, den: 10, rounding: 'floor' },
    timing: 'perAttack', count: 'all', startTurn: 1, order: TURN_END_ORDER.custom,
    presetKey: 'lifeOrb', label: 'いのちのたま',
  }

  it('導出が無ければ手動リストをそのまま返す', () => {
    expect(mergePassiveEffects([manualLifeOrb], [])).toEqual([manualLifeOrb])
  })

  it('(presetKey, side) が手動と同じ導出効果は捨てる（二重計上しない）', () => {
    const implied = derive({ item: 'いのちのたま', status: 'やけど' })
    const merged = mergePassiveEffects([manualLifeOrb], implied)
    expect(merged.map(e => e.id)).toEqual(['m1', 'implied:attacker:burn'])
  })

  it('同じプリセットでも side が違えば残す', () => {
    const implied = derive({}, { item: 'いのちのたま' })
    const merged = mergePassiveEffects([manualLifeOrb], implied)
    expect(merged.map(e => e.id)).toEqual(['m1', 'implied:defender:lifeOrb'])
  })

  it('カスタム（presetKey なし）の手動効果は重複判定に使わない', () => {
    const custom: PassiveEffect = { ...manualLifeOrb, id: 'c1', presetKey: undefined, label: 'カスタム 1/10' }
    const implied = derive({ item: 'いのちのたま' })
    expect(mergePassiveEffects([custom], implied).map(e => e.id)).toEqual(['c1', 'implied:attacker:lifeOrb'])
  })
})

describe('導出効果の展開・固定化', () => {
  const ctx = { attackerMaxHp: 100, defenderMaxHp: 200, attackerTypes: [], defenderTypes: [] }
  const events = [{ id: 'a1', kind: 'attack', usages: 2 }]

  it('展開項目に origin が引き継がれる', () => {
    const schedule = buildPassiveSchedule(events, derive({ item: 'いのちのたま' }), ctx)
    expect(schedule.perAttackByTurn[1]).toEqual([
      expect.objectContaining({ label: 'いのちのたま', amount: 10, origin: 'item', side: 'attacker' }),
    ])
    expect(schedule.perAttackByTurn[2]).toHaveLength(1)
  })

  it('collectEffectIds / pinPassiveEffects は導出効果を対象にしない', () => {
    const implied = derive({ item: 'いのちのたま' })
    const schedule = buildPassiveSchedule(events, implied, ctx)
    expect(collectEffectIds(schedule.afterEvent.a1)).toEqual([])

    let n = 0
    const res = pinPassiveEffects(events, implied, implied.map(e => e.id), ctx, () => `g${++n}`)
    expect(res.removedEffectIds).toEqual([])
    expect(res.events).toEqual(events)
  })
})
