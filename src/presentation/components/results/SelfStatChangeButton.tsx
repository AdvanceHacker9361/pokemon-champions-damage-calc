import type { StatKey } from '@/domain/models/Pokemon'

/** StatKey → 日本語ランク表記 (A/B/C/D/S) */
const STAT_LETTER: Record<string, string> = {
  hp: 'HP', atk: 'A', def: 'B', spa: 'C', spd: 'D', spe: 'S',
}

/** 使用後の自ステータス変化ボタン（りゅうせいぐん・アーマーキャノン等） */
export function SelfStatChangeButton({
  stat, stages, attackerAbility, attackerRanks, setAttackerRank,
}: {
  stat: StatKey
  stages: number
  attackerAbility: string
  attackerRanks: Record<string, number>
  setAttackerRank: (stat: StatKey, value: number) => void
}) {
  const effectiveStages = attackerAbility === 'あまのじゃく' ? -stages : stages
  const letter = STAT_LETTER[stat] ?? stat
  const isBoost = effectiveStages > 0
  const sign = isBoost ? '+' : '−'
  const abs = Math.abs(effectiveStages)
  const arrow = isBoost ? '↑' : '↓'
  const currentRank = attackerRanks[stat] ?? 0
  const targetRank = currentRank + effectiveStages
  const clamped = Math.max(-6, Math.min(6, targetRank))
  const willApply = clamped !== currentRank
  const contraryNote = attackerAbility === 'あまのじゃく' ? '（あまのじゃくで反転）' : ''
  return (
    <button
      type="button"
      onClick={() => setAttackerRank(stat, clamped)}
      disabled={!willApply}
      className={`min-w-0 text-xs px-2 py-1 rounded border transition-colors ${
        willApply
          ? isBoost
            ? 'border-accent-border text-accent hover:bg-accent-bg'
            : 'border-danger-2 text-danger-2 hover:bg-surface-3'
          : 'border-edge text-fg-faint cursor-not-allowed'
      }`}
      title={`攻撃側の${letter}ランクを${abs}段階${isBoost ? '上げる' : '下げる'}${contraryNote}（現在: ${currentRank} → ${clamped}）`}
    >
      {arrow}{letter}{sign}{abs}
    </button>
  )
}
