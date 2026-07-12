import { useProgressionStore, hasSequenceImpact } from '@/presentation/store/progressionStore'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { useBattleSequence } from '@/presentation/hooks/useBattleSequence'
import { SequenceResultPanel } from './SequenceResultPanel'

export function DamageSequenceSummary() {
  const events = useProgressionStore(s => s.events)
  const attackerStartHp = useProgressionStore(s => s.attackerStartHp)
  const attackerName = useAttackerStore(s => s.pokemonName)
  const defenderName = useDefenderStore(s => s.pokemonName)
  const showSequence = hasSequenceImpact({ events, attackerStartHp })
  const { result } = useBattleSequence()

  if (!showSequence || !result) return null

  return (
    <section className="panel space-y-3 sm:space-y-4" aria-labelledby="battle-sequence-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-edge pb-2">
        <div className="flex items-baseline gap-2">
          <h2 id="battle-sequence-heading" className="text-sm font-bold text-fg">
            攻守シミュレーション
          </h2>
          <span className="text-[10px] text-fg-faint sm:text-xs">イベント順に両者のHPを追跡</span>
        </div>
        <span className="font-mono text-[10px] text-fg-faint sm:text-xs">
          {result.steps.length}ステップ
        </span>
      </div>

      <SequenceResultPanel
        seqResult={result}
        attackerName={attackerName}
        defenderName={defenderName}
      />
    </section>
  )
}
