import { useResultStore } from '@/presentation/store/resultStore'
import { DamageResultRow } from './DamageResultRow'
import { DamageAccumPanel } from './DamageAccumPanel'
import { FieldStateBar } from '@/presentation/components/field/FieldStateBar'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { useAccumStore } from '@/presentation/store/accumStore'

export function DamageResultArea() {
  const results = useResultStore(s => s.results)
  const attackerName = useAttackerStore(s => s.pokemonName)
  const defenderName = useDefenderStore(s => s.pokemonName)
  const accumEntries = useAccumStore(s => s.entries)

  const defenderMaxHp = results[0]?.result.defenderMaxHp ?? accumEntries[0]?.defenderMaxHp ?? 0

  if (!attackerName || !defenderName) {
    return (
      <>
        <div className="panel text-center py-8">
          <p className="text-slate-500 text-sm">攻撃側・防御側のポケモンを選択してください</p>
        </div>
        <FieldStateBar />
        <DamageAccumPanel defenderMaxHp={defenderMaxHp} />
      </>
    )
  }

  return (
    <>
      {results.length > 0 ? (
        <div className="panel">
          <div className="text-xs text-slate-500 mb-3">
            {attackerName} → {defenderName}
          </div>
          <div>
            {results.map(({ moveName, result, critResult }) => (
              <DamageResultRow key={moveName} moveName={moveName} result={result} critResult={critResult} />
            ))}
          </div>
        </div>
      ) : (
        <div className="panel text-center py-8">
          <p className="text-slate-500 text-sm">攻撃側に技を選択するとダメージが計算されます</p>
        </div>
      )}
      <FieldStateBar />
      <DamageAccumPanel defenderMaxHp={defenderMaxHp} />
    </>
  )
}
