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
 * `useBattleSequence` と `useAccumulatedDamage` の双方がこの関数を使い、
 * 同じ時系列に対して必ず同じ2倍判定になるようにする。
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

/**
 * イベント id → そのイベントのダメージを2倍にするか。
 *
 * @param events                     時系列（並び順がそのまま適用順）
 * @param initialAttackerVulnerable  手動トグル（攻撃側パネルの「きょけんとつげき後」）。
 *                                   最初の `attack` イベントまで有効。
 */
export function resolveGlaiveRushDoubling(
  events: readonly GlaiveRushTimelineEvent[],
  initialAttackerVulnerable: boolean,
): Map<string, boolean> {
  const doubling = new Map<string, boolean>()

  // 攻撃側が きょけんとつげき を使った直後の状態（= 攻撃側への被ダメが2倍）
  let attackerVulnerable = initialAttackerVulnerable
  // 防御側が きょけんとつげき を使った直後の状態（= 与ダメが2倍）
  let defenderVulnerable = false

  for (const ev of events) {
    switch (ev.kind) {
      case 'attack': {
        // 加算時に防御側トグルが ON だったエントリは既に2倍済みなので再適用しない
        doubling.set(ev.id, defenderVulnerable && ev.defenderGlaiveRush !== true)
        // 攻撃側が動いた → 直前までの状態は終了。この技自体が きょけんとつげき なら再付与
        attackerVulnerable = ev.moveName === GLAIVE_RUSH_MOVE_NAME
        break
      }
      case 'incoming': {
        doubling.set(ev.id, attackerVulnerable)
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

  return doubling
}

/** 時系列のどこかで自動2倍が発生するか（UI のバッジ有無判定などに使う） */
export function hasGlaiveRushDoubling(doubling: ReadonlyMap<string, boolean>): boolean {
  for (const v of doubling.values()) if (v) return true
  return false
}
