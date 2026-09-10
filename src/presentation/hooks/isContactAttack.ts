import { MoveRepository } from '@/data/repositories/MoveRepository'
import type { ProgressionEvent } from '@/presentation/store/progressionStore'

/**
 * `PassiveExpansionContext.isContactAttack` 用のコールバックを作る。
 *
 * ゴツゴツメットのように「接触技のときだけ発動する」常時効果を、
 * 攻撃側 perAttack は `attack` イベントの技、防御側 perAttack は `incoming` イベントの技で判定する。
 * 技名が無い／技データに無い場合は従来どおり適用する（`true`）。
 *
 * フック（`useBattleSequence`）・ゴースト行 UI・固定化がすべて同じ判定を使うために共有する。
 */
export function makeIsContactAttack(
  events: readonly ProgressionEvent[],
): (eventId: string) => boolean {
  const moveNameById = new Map<string, string | null | undefined>()
  for (const ev of events) {
    if (ev.kind === 'attack' || ev.kind === 'incoming') moveNameById.set(ev.id, ev.moveName)
  }
  return (eventId: string) => {
    const moveName = moveNameById.get(eventId)
    if (!moveName) return true
    const move = MoveRepository.findByName(moveName)
    return move?.flags.contact ?? true
  }
}
