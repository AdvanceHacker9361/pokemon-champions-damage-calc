import { calculateHP } from '@/domain/calculators/StatCalculator'
import { useDefenderStore } from '@/presentation/store/pokemonStore'
import { useProgressionStore } from '@/presentation/store/progressionStore'
import { useResultStore } from '@/presentation/store/resultStore'

export function useDefenderMaxHp(): number {
  const results = useResultStore(s => s.results)
  const events = useProgressionStore(s => s.events)
  const defenderBaseHp = useDefenderStore(s => s.baseStats.hp)
  const defenderSpHp = useDefenderStore(s => s.sp.hp)
  const firstAttack = events.find(event => event.kind === 'attack')
  const storeHp = defenderBaseHp > 0 ? calculateHP(defenderBaseHp, defenderSpHp) : 0

  return results[0]?.result.defenderMaxHp
    ?? (firstAttack && firstAttack.kind === 'attack' ? firstAttack.defenderMaxHp : storeHp)
}
