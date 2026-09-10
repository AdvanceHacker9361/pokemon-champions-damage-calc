import { describe, expect, it } from 'vitest'
import { executeDamageCalculation, type PokemonBattleState } from '@/application/usecases/CalculateDamageUseCase'
import { createDefaultBattleField } from '@/domain/models/BattleField'
import { MoveRepository } from '@/data/repositories/MoveRepository'
import { createSpDistribution } from '@/domain/models/StatPoints'
import {
  resolveGlaiveRushDoubling,
  glaiveRushScaleOf,
  GLAIVE_RUSH_MOVE_NAME,
  type GlaiveRushInitialState,
  type GlaiveRushScaleMap,
} from '@/domain/calculators/GlaiveRushState'
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

describe('resolveGlaiveRushDoubling（状態の開始・終了・倍率）', () => {
  const A = (id: string, moveName?: string, defenderGlaiveRush?: boolean) =>
    ({ id, kind: 'attack' as const, moveName, defenderGlaiveRush })
  const I = (id: string, moveName: string | null) =>
    ({ id, kind: 'incoming' as const, moveName })

  /** id → [factor, doubled] の組で読みやすく検証する */
  function scale(map: GlaiveRushScaleMap, id: string): [number, boolean] {
    const s = glaiveRushScaleOf(map, id)
    return [s.factor, s.doubled]
  }

  function resolve(
    events: Parameters<typeof resolveGlaiveRushDoubling>[0],
    init: GlaiveRushInitialState = {},
  ) {
    return resolveGlaiveRushDoubling(events, init)
  }

  it('攻撃側のきょけんとつげき後、次の被ダメだけが2倍になる', () => {
    const d = resolve([
      A('a1', GLAIVE_RUSH_MOVE_NAME),
      I('i1', 'じしん'),
      A('a2', 'じしん'),
      I('i2', 'じしん'),
    ])
    expect(scale(d, 'i1')).toEqual([2, true])
    expect(scale(d, 'i2')).toEqual([1, false])
  })

  it('攻撃側の被ダメ2倍は攻撃側が次に動くまで継続する（複数回被弾）', () => {
    const d = resolve([
      A('a1', GLAIVE_RUSH_MOVE_NAME),
      I('i1', 'じしん'),
      I('i2', 'じしん'),
      A('a2', 'じしん'),
      I('i3', 'じしん'),
    ])
    expect(scale(d, 'i1')).toEqual([2, true])
    expect(scale(d, 'i2')).toEqual([2, true])
    expect(scale(d, 'i3')).toEqual([1, false])
  })

  it('防御側のきょけんとつげき後、防御側が次に動くまでの与ダメが2倍になる', () => {
    const d = resolve([
      I('i1', GLAIVE_RUSH_MOVE_NAME),
      A('a1', 'じしん'),
      A('a2', 'じしん'),
      I('i2', 'じしん'),
      A('a3', 'じしん'),
    ])
    expect(scale(d, 'a1')).toEqual([2, true])
    expect(scale(d, 'a2')).toEqual([2, true])
    expect(scale(d, 'a3')).toEqual([1, false])
  })

  it('連続で きょけんとつげき を使うと状態は途切れず更新される', () => {
    const d = resolve([
      A('a1', GLAIVE_RUSH_MOVE_NAME),
      I('i1', 'じしん'),
      A('a2', GLAIVE_RUSH_MOVE_NAME),
      I('i2', 'じしん'),
    ])
    expect(scale(d, 'i1')).toEqual([2, true])
    expect(scale(d, 'i2')).toEqual([2, true])
  })

  it('織り込み済みエントリ（defenderGlaiveRush）は状態が有効なら等倍のまま2倍扱い', () => {
    const d = resolve([
      I('i1', GLAIVE_RUSH_MOVE_NAME),
      A('a1', 'じしん', true),
      A('a2', 'じしん'),
    ])
    expect(scale(d, 'a1')).toEqual([1, true])
    expect(scale(d, 'a2')).toEqual([2, true])
  })

  it('織り込み済みエントリは、防御側が既に動いていれば0.5倍で等倍へ戻す', () => {
    const d = resolve([
      I('i1', GLAIVE_RUSH_MOVE_NAME),
      I('i2', 'じしん'),
      A('a1', 'じしん', true),
    ])
    expect(scale(d, 'a1')).toEqual([0.5, false])
  })

  it('防御側トグル（初期状態）は最初の incoming まで有効', () => {
    const d = resolve([
      A('a1', 'じしん', true),
      I('i1', 'じしん'),
      A('a2', 'じしん', true),
    ], { initialDefenderVulnerable: true })
    // トグルON中に加算した1発目は織り込み済みのまま
    expect(scale(d, 'a1')).toEqual([1, true])
    // 防御側が動いた後は 0.5 倍で等倍へ戻る
    expect(scale(d, 'a2')).toEqual([0.5, false])
  })

  it('防御側トグルなしで織り込み済みでもないエントリは補正されない', () => {
    const d = resolve([A('a1', 'じしん')])
    expect(scale(d, 'a1')).toEqual([1, false])
  })

  it('攻撃側トグル（初期状態）は最初の攻撃イベントまで有効', () => {
    const d = resolve([
      I('i1', 'じしん'),
      A('a1', 'じしん'),
      I('i2', 'じしん'),
    ], { initialAttackerVulnerable: true })
    expect(scale(d, 'i1')).toEqual([2, true])
    expect(scale(d, 'i2')).toEqual([1, false])
  })

  it('補助技ターン（setupTurn）もその側の状態を終了させる', () => {
    const attackerSide = resolve([
      A('a1', GLAIVE_RUSH_MOVE_NAME),
      { id: 's1', kind: 'setupTurn', side: 'attacker' },
      I('i1', 'じしん'),
    ])
    expect(scale(attackerSide, 'i1')).toEqual([1, false])

    const defenderSide = resolve([
      I('i1', GLAIVE_RUSH_MOVE_NAME),
      { id: 's1', kind: 'setupTurn', side: 'defender' },
      A('a1', 'じしん'),
    ])
    expect(scale(defenderSide, 'a1')).toEqual([1, false])
  })

  it('定数ダメ・痛み分け等は「技を使った」に当たらないため状態が継続する', () => {
    const d = resolve([
      A('a1', GLAIVE_RUSH_MOVE_NAME),
      { id: 'c1', kind: 'defenderConst' },
      { id: 'p1', kind: 'painSplit' },
      I('i1', 'じしん'),
    ])
    expect(scale(d, 'i1')).toEqual([2, true])
  })
})
