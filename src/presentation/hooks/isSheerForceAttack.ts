import { MoveRepository } from '@/data/repositories/MoveRepository'
import type { ProgressionEvent } from '@/presentation/store/progressionStore'

export const SHEER_FORCE = 'ちからずく'

/**
 * `PassiveExpansionContext.isSheerForceAttack` 用のコールバックを作る。
 *
 * ちからずく で追加効果が消える技（`hasSecondaryEffect`）では いのちのたま の反動が発生しない。
 * `attack` イベントは攻撃側、`incoming` イベントは防御側がその技の使用者。
 * 使用者の特性が ちからずく かつ技に追加効果があるときだけ `true`（技不明・技名なしは `false`）。
 *
 * 特性はライブストアの実効特性を使う（導出効果と同じ簡略化。メガシンカイベントによる
 * 時系列途中の特性変化は考慮しない）。
 * フック（`useBattleSequence`）・ゴースト行 UI・固定化がすべて同じ判定を使うために共有する。
 */
export function makeIsSheerForceAttack(
  events: readonly ProgressionEvent[],
  attackerAbility: string,
  defenderAbility: string,
): (eventId: string) => boolean {
  const attackerSf = attackerAbility === SHEER_FORCE
  const defenderSf = defenderAbility === SHEER_FORCE
  const moveNameById = new Map<string, string | null | undefined>()
  if (attackerSf || defenderSf) {
    for (const ev of events) {
      if (ev.kind === 'attack' && attackerSf) moveNameById.set(ev.id, ev.moveName)
      else if (ev.kind === 'incoming' && defenderSf) moveNameById.set(ev.id, ev.moveName)
    }
  }
  return (eventId: string) => {
    const moveName = moveNameById.get(eventId)
    if (!moveName) return false
    return MoveRepository.findByName(moveName)?.hasSecondaryEffect === true
  }
}
