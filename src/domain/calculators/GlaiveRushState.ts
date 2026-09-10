/**
 * きょけんとつげき（Glaive Rush）使用後の状態を、イベント時系列から解決する純粋関数。
 *
 * ゲーム仕様（Gen 9 / Showdown `glaiverush` volatile）:
 * - 使用者が命中させた直後から「次に使用者が動くまで」、使用者が受ける攻撃の
 *   最終ダメージが2倍になり、かつ使用者への攻撃は必中になる。
 * - 状態は使用者が次に技を使った時点で終了する。
 *
 * 時系列（`progressionStore.events`）では次のように対応づける:
 * - 攻撃側が動く   = `attack` イベント / `setupTurn(side='attacker')`
 * - 防御側が動く   = `incoming` イベント / `setupTurn(side='defender')`
 *
 * 与ダメイベントは「加算した時点の防御側トグル状態」で既に2倍が織り込まれていることが
 * あるため、倍率は 2 倍・等倍・0.5 倍（織り込み済みだが状態が終了している）の3値になる。
 *
 * `useBattleSequence` / `useAccumulatedDamage` / UI（バッジ・エクスポート）はすべて
 * この関数の結果を共有し、同じ時系列に対して必ず同じ倍率になるようにする。
 */

export const GLAIVE_RUSH_MOVE_NAME = 'きょけんとつげき'

/**
 * 判定に必要な最小限のイベント形状（`ProgressionEvent` がそのまま満たす）。
 */
export interface GlaiveRushTimelineEvent {
  readonly id: string
  readonly kind: string
  /** attack / incoming の技名 */
  readonly moveName?: string | null
  /** setupTurn / megaEvolve 等の対象側 */
  readonly side?: 'attacker' | 'defender'
  /** 加算時点で既に「被ダメ2倍」が織り込まれたロールを保持している attack */
  readonly defenderGlaiveRush?: boolean
}

/** 保存済みロールに対する補正 */
export interface GlaiveRushScale {
  /**
   * 保存済みロールに掛ける倍率。
   * - 2   : 状態が有効で、ロールは等倍のまま保存されている
   * - 1   : 補正不要（状態なし／織り込み済みかつ状態も有効）
   * - 0.5 : 織り込み済み（2倍のロール）だが、その時点では状態が終了している
   */
  factor: 2 | 1 | 0.5
  /** 実効的に「被ダメ2倍」状態か（バッジ・ラベル・必中表示用） */
  doubled: boolean
}

export type GlaiveRushScaleMap = ReadonlyMap<string, GlaiveRushScale>

/** 補正なし（状態に関係しないイベント用の既定値） */
export const NO_GLAIVE_RUSH_SCALE: GlaiveRushScale = { factor: 1, doubled: false }

/** 時系列の初期状態（各パネルの手動トグル） */
export interface GlaiveRushInitialState {
  /** 攻撃側パネルのトグル。最初の `attack` / 攻撃側 `setupTurn` まで有効 */
  initialAttackerVulnerable?: boolean
  /** 防御側パネルのトグル。最初の `incoming` / 防御側 `setupTurn` まで有効 */
  initialDefenderVulnerable?: boolean
}

/**
 * イベント id → そのイベントのダメージ補正。
 *
 * @param events 時系列（並び順がそのまま適用順）
 * @param init   手動トグルによる初期状態
 */
export function resolveGlaiveRushDoubling(
  events: readonly GlaiveRushTimelineEvent[],
  init: GlaiveRushInitialState = {},
): Map<string, GlaiveRushScale> {
  const scales = new Map<string, GlaiveRushScale>()

  // 攻撃側が きょけんとつげき を使った直後の状態（= 攻撃側への被ダメが2倍）
  let attackerVulnerable = init.initialAttackerVulnerable === true
  // 防御側が きょけんとつげき を使った直後の状態（= 与ダメが2倍）
  let defenderVulnerable = init.initialDefenderVulnerable === true

  for (const ev of events) {
    switch (ev.kind) {
      case 'attack': {
        // 加算時に防御側トグルが ON だったエントリは既に2倍済み。
        // 状態が続いていれば補正不要、終わっていれば 0.5 倍で戻す（値は必ず 2d なので厳密）
        const baked = ev.defenderGlaiveRush === true
        const factor: GlaiveRushScale['factor'] = baked
          ? (defenderVulnerable ? 1 : 0.5)
          : (defenderVulnerable ? 2 : 1)
        scales.set(ev.id, { factor, doubled: defenderVulnerable })
        // 攻撃側が動いた → 直前までの状態は終了。この技自体が きょけんとつげき なら再付与
        attackerVulnerable = ev.moveName === GLAIVE_RUSH_MOVE_NAME
        break
      }
      case 'incoming': {
        scales.set(ev.id, attackerVulnerable ? { factor: 2, doubled: true } : NO_GLAIVE_RUSH_SCALE)
        // 防御側が動いた → 直前までの状態は終了。この技自体が きょけんとつげき なら再付与
        defenderVulnerable = ev.moveName === GLAIVE_RUSH_MOVE_NAME
        break
      }
      case 'setupTurn': {
        // 補助技も「技を使った」に含まれるため、その側の状態を終了させる
        if (ev.side === 'attacker') attackerVulnerable = false
        else if (ev.side === 'defender') defenderVulnerable = false
        break
      }
      default:
        // 定数ダメ・回復・痛み分け・メガシンカ等は「技を使った」に当たらないため状態は継続
        break
    }
  }

  return scales
}

/** イベント id の補正を取り出す（未登録なら補正なし） */
export function glaiveRushScaleOf(scales: GlaiveRushScaleMap, id: string): GlaiveRushScale {
  return scales.get(id) ?? NO_GLAIVE_RUSH_SCALE
}
