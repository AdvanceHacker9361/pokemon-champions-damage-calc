import { useResultStore } from '@/presentation/store/resultStore'
import { DamageResultRow } from './DamageResultRow'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'

export function DamageResultArea() {
  const results = useResultStore(s => s.results)
  const attackerName = useAttackerStore(s => s.pokemonName)
  const defenderName = useDefenderStore(s => s.pokemonName)

  if (!attackerName || !defenderName) {
    return (
      <div className="panel text-center py-8">
        <p className="text-slate-500 text-sm">攻撃側・防御側のポケモンを選択してください</p>
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="panel text-center py-8">
        <p className="text-slate-500 text-sm">攻撃側に技を選択するとダメージが計算されます</p>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="text-xs text-slate-500 mb-3">
        {attackerName} → {defenderName}
      </div>
      <div>
        {results.map(({ moveName, result }) => (
          <DamageResultRow key={moveName} moveName={moveName} result={result} />
        ))}
      </div>
    </div>
  )
}
