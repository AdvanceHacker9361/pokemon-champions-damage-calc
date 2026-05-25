import { useResultStore } from '@/presentation/store/resultStore'
import { DamageResultRow } from './DamageResultRow'
import { DamageAccumPanel } from './DamageAccumPanel'
import { FieldStateBar } from '@/presentation/components/field/FieldStateBar'
import { ExportButton } from './ExportButton'
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
          <p className="text-fg-muted text-sm">攻撃側・防御側のポケモンを選択してください</p>
        </div>
        <DamageAccumPanel defenderMaxHp={defenderMaxHp} />
        <FieldStateBar />
      </>
    )
  }

  return (
    <>
      {results.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-fg-muted">{attackerName} → {defenderName}</span>
            <ExportButton results={results} attackerName={attackerName} defenderName={defenderName} />
          </div>
          {results.map(({ moveName, result, critResult, perHitResults, critPerHitResults, rawResult, rawCritResult, weakArmorPerHitResults, weakArmorCritPerHitResults, weakArmorVariableRawResults, weakArmorVariableRawCritResults }) => (
            <div key={moveName} className="bg-surface-2 rounded-lg px-3.5 py-3">
              <DamageResultRow
                moveName={moveName}
                result={result}
                critResult={critResult}
                perHitResults={perHitResults}
                critPerHitResults={critPerHitResults}
                rawResult={rawResult}
                rawCritResult={rawCritResult}
                weakArmorPerHitResults={weakArmorPerHitResults}
                weakArmorCritPerHitResults={weakArmorCritPerHitResults}
                weakArmorVariableRawResults={weakArmorVariableRawResults}
                weakArmorVariableRawCritResults={weakArmorVariableRawCritResults}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="panel text-center py-8">
          <p className="text-fg-muted text-sm">攻撃側に技を選択するとダメージが計算されます</p>
        </div>
      )}
      <DamageAccumPanel defenderMaxHp={defenderMaxHp} />
      <FieldStateBar />
    </>
  )
}
