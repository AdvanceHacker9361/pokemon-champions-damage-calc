import { useResultStore } from '@/presentation/store/resultStore'
import { DamageResultRow } from './DamageResultRow'
import { ExportButton } from './ExportButton'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'

export function DamageResultArea() {
  const results = useResultStore(s => s.results)
  const attackerName = useAttackerStore(s => s.pokemonName)
  const defenderName = useDefenderStore(s => s.pokemonName)

  if (!attackerName || !defenderName) {
    return (
      <div className="panel text-center py-8">
        <p className="text-fg-muted text-sm">攻撃側・防御側のポケモンを選択してください</p>
      </div>
    )
  }

  return results.length > 0 ? (
    <div className="space-y-2">
          <div className="flex items-start justify-between gap-2 px-1">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="text-xs font-semibold text-fg-muted">技別ダメージ</h3>
                <span className="rounded border border-edge bg-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-fg-faint">
                  {results.length}件
                </span>
              </div>
              <div className="mt-0.5 truncate text-[10px] text-fg-faint">
                {attackerName} → {defenderName}
              </div>
            </div>
            <ExportButton results={results} attackerName={attackerName} defenderName={defenderName} />
          </div>
          {results.map(({ slotIndex, moveName, result, critResult, perHitResults, critPerHitResults, rawResult, rawCritResult, weakArmorPerHitResults, weakArmorCritPerHitResults, weakArmorVariableRawResults, weakArmorVariableRawCritResults }) => (
            <div key={`${slotIndex}:${moveName}`} className="bg-surface-2 rounded-lg px-3.5 py-3">
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
  )
}
