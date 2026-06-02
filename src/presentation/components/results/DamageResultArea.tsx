import { useResultStore } from '@/presentation/store/resultStore'
import { DamageResultRow } from './DamageResultRow'
import { DamageProgressionSection } from './DamageProgressionSection'
import { FieldStateBar } from '@/presentation/components/field/FieldStateBar'
import { ExportButton } from './ExportButton'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { useProgressionStore } from '@/presentation/store/progressionStore'

export function DamageResultArea() {
  const results = useResultStore(s => s.results)
  const attackerName = useAttackerStore(s => s.pokemonName)
  const defenderName = useDefenderStore(s => s.pokemonName)
  const events = useProgressionStore(s => s.events)

  const firstAttack = events.find(e => e.kind === 'attack')
  const defenderMaxHp = results[0]?.result.defenderMaxHp
    ?? (firstAttack && firstAttack.kind === 'attack' ? firstAttack.defenderMaxHp : 0)

  if (!attackerName || !defenderName) {
    return (
      <>
        <div className="panel text-center py-8">
          <p className="text-fg-muted text-sm">攻撃側・防御側のポケモンを選択してください</p>
        </div>
        <DamageProgressionSection defenderMaxHp={defenderMaxHp} />
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
      <DamageProgressionSection defenderMaxHp={defenderMaxHp} />
      <FieldStateBar />
    </>
  )
}
