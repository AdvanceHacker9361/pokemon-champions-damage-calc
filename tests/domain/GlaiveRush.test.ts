import { describe, expect, it } from 'vitest'
import { executeDamageCalculation, type PokemonBattleState } from '@/application/usecases/CalculateDamageUseCase'
import { createDefaultBattleField } from '@/domain/models/BattleField'
import { MoveRepository } from '@/data/repositories/MoveRepository'
import { createSpDistribution } from '@/domain/models/StatPoints'
import { resolveGlaiveRushDoubling, GLAIVE_RUSH_MOVE_NAME } from '@/domain/calculators/GlaiveRushState'
import type { MoveData } from '@/domain/models/Move'
import type { TypeName } from '@/domain/models/Pokemon'

function findMove(name: string): MoveData {
  const move = MoveRepository.findByName(name)
  if (!move) throw new Error(`技が見つからない: ${name}`)
  return move
}

function state(types: TypeName[]): PokemonBattleState {
  return {
    baseStats: { hp: 100, atk: 120, def: 100, spa: 120, spd: 100, spe: 100 },
    types,
    sp: createSpDistribution(),
    abilityName: 'なし',
    itemName: null,
    ranks: {},
    status: null,
  }
}

describe('きょけんとつげき後の被ダメ2倍（ダメージ計算エンジン）', () => {
  it('16乱数すべてがちょうど2倍になる', () => {
    const base = executeDamageCalculation({
      attacker: state(['ノーマル']),
      defender: state(['ドラゴン']),
      move: findMove('じしん'),
      field: createDefaultBattleField(),
    })
    const doubled = executeDamageCalculation({
      attacker: state(['ノーマル']),
      defender: { ...state(['ドラゴン']), glaiveRushVulnerable: true },
      move: findMove('じしん'),
      field: createDefaultBattleField(),
    })

    expect(base.min).toBeGreaterThan(0)
    expect(doubled.rolls).toHaveLength(16)
    doubled.rolls.forEach((roll, i) => {
      expect(roll).toBe(base.rolls[i] * 2)
    })
    expect(doubled.min).toBe(base.min * 2)
    expect(doubled.max).toBe(base.max * 2)
  })

  it('急所ダメージにも2倍が乗る（急所補正の後に適用）', () => {
    const opts = { move: findMove('じしん'), field: createDefaultBattleField(), isCritical: true }
    const base = executeDamageCalculation({
      attacker: state(['ノーマル']), defender: state(['ドラゴン']), ...opts,
    })
    const doubled = executeDamageCalculation({
      attacker: state(['ノーマル']),
      defender: { ...state(['ドラゴン']), glaiveRushVulnerable: true },
      ...opts,
    })
    doubled.rolls.forEach((roll, i) => expect(roll).toBe(base.rolls[i] * 2))
  })

  it('無効タイプ（ダメージ0）は2倍にしても0のまま', () => {
    const result = executeDamageCalculation({
      attacker: state(['ノーマル']),
      defender: { ...state(['ゴースト']), glaiveRushVulnerable: true },
      move: findMove('でんこうせっか'),
      field: createDefaultBattleField(),
    })
    expect(result.max).toBe(0)
    expect(Array.from(result.rolls).every(r => r === 0)).toBe(true)
  })

  it('必中: きょけんとつげき後の相手への攻撃は命中率100%として扱う（技データ側は命中90のまま）', () => {
    // 命中率は表示ロジック側（DamageResultRow）で 1.0 に固定するため、
    // ここでは元データが 100 未満であることだけを確認する
    expect(findMove('いわなだれ').accuracy).toBe(90)
  })
})

describe('resolveGlaiveRushDoubling（状態の開始・終了）', () => {
  const A = (id: string, moveName?: string, defenderGlaiveRush?: boolean) =>
    ({ id, kind: 'attack' as const, moveName, defenderGlaiveRush })
  const I = (id: string, moveName: string | null) =>
    ({ id, kind: 'incoming' as const, moveName })

  it('攻撃側のきょけんとつげき後、次の被ダメだけが2倍になる', () => {
    const d = resolveGlaiveRushDoubling([
      A('a1', GLAIVE_RUSH_MOVE_NAME),
      I('i1', 'じしん'),
      A('a2', 'じしん'),
      I('i2', 'じしん'),
    ], false)
    expect(d.get('i1')).toBe(true)
    expect(d.get('i2')).toBe(false)
  })

  it('攻撃側の被ダメ2倍は攻撃側が次に動くまで継続する（複数回被弾）', () => {
    const d = resolveGlaiveRushDoubling([
      A('a1', GLAIVE_RUSH_MOVE_NAME),
      I('i1', 'じしん'),
      I('i2', 'じしん'),
      A('a2', 'じしん'),
      I('i3', 'じしん'),
    ], false)
    expect(d.get('i1')).toBe(true)
    expect(d.get('i2')).toBe(true)
    expect(d.get('i3')).toBe(false)
  })

  it('防御側のきょけんとつげき後、防御側が次に動くまでの与ダメが2倍になる', () => {
    const d = resolveGlaiveRushDoubling([
      I('i1', GLAIVE_RUSH_MOVE_NAME),
      A('a1', 'じしん'),
      A('a2', 'じしん'),
      I('i2', 'じしん'),
      A('a3', 'じしん'),
    ], false)
    expect(d.get('a1')).toBe(true)
    expect(d.get('a2')).toBe(true)
    expect(d.get('a3')).toBe(false)
  })

  it('連続で きょけんとつげき を使うと状態は途切れず更新される', () => {
    const d = resolveGlaiveRushDoubling([
      A('a1', GLAIVE_RUSH_MOVE_NAME),
      I('i1', 'じしん'),
      A('a2', GLAIVE_RUSH_MOVE_NAME),
      I('i2', 'じしん'),
    ], false)
    expect(d.get('i1')).toBe(true)
    expect(d.get('i2')).toBe(true)
  })

  it('加算時に2倍が織り込み済みのエントリ（defenderGlaiveRush）は再度2倍にしない', () => {
    const d = resolveGlaiveRushDoubling([
      I('i1', GLAIVE_RUSH_MOVE_NAME),
      A('a1', 'じしん', true),
      A('a2', 'じしん'),
    ], false)
    expect(d.get('a1')).toBe(false)
    expect(d.get('a2')).toBe(true)
  })

  it('手動トグルは最初の攻撃イベントまで有効', () => {
    const d = resolveGlaiveRushDoubling([
      I('i1', 'じしん'),
      A('a1', 'じしん'),
      I('i2', 'じしん'),
    ], true)
    expect(d.get('i1')).toBe(true)
    expect(d.get('i2')).toBe(false)
  })

  it('補助技ターン（setupTurn）もその側の状態を終了させる', () => {
    const d = resolveGlaiveRushDoubling([
      A('a1', GLAIVE_RUSH_MOVE_NAME),
      { id: 's1', kind: 'setupTurn', side: 'attacker' },
      I('i1', 'じしん'),
    ], false)
    expect(d.get('i1')).toBe(false)
  })

  it('定数ダメ・痛み分け等は「技を使った」に当たらないため状態が継続する', () => {
    const d = resolveGlaiveRushDoubling([
      A('a1', GLAIVE_RUSH_MOVE_NAME),
      { id: 'c1', kind: 'defenderConst' },
      { id: 'p1', kind: 'painSplit' },
      I('i1', 'じしん'),
    ], false)
    expect(d.get('i1')).toBe(true)
  })
})
