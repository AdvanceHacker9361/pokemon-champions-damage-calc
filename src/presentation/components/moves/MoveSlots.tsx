import { MoveSelect } from './MoveSelect'
import type { PokemonStore } from '@/presentation/store/pokemonStore'
import { MoveRepository } from '@/data/repositories/MoveRepository'

interface MoveSlotsProps {
  moves: PokemonStore['moves']
  setMove: PokemonStore['setMove']
  movePowers: PokemonStore['movePowers']
  setMovePower: PokemonStore['setMovePower']
}

export function MoveSlots({ moves, setMove, movePowers, setMovePower }: MoveSlotsProps) {
  return (
    <div className="space-y-1.5">
      <span className="label">技</span>
      <div className="grid grid-cols-2 gap-1.5">
        {([0, 1, 2, 3] as const).map(slot => {
          const moveName = moves[slot]
          const moveRecord = moveName ? MoveRepository.findByName(moveName) : null
          const hasPowerOptions = (moveRecord?.powerOptions?.length ?? 0) > 0
          const selectedPower = movePowers[slot] ?? moveRecord?.power

          return (
            <div key={slot} className="space-y-1">
              <MoveSelect
                value={moveName}
                onChange={name => setMove(slot, name)}
                placeholder={`技${slot + 1}`}
              />
              {/* 可変威力ボタン（powerOptions を持つ技のみ） */}
              {hasPowerOptions && moveName && (
                <div className="flex gap-1">
                  {moveRecord!.powerOptions!.map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setMovePower(slot, p)}
                      className={`flex-1 text-xs py-0.5 rounded border transition-colors ${
                        selectedPower === p
                          ? 'bg-indigo-600 dark:bg-indigo-700 border-indigo-500 dark:border-indigo-600 text-white font-semibold'
                          : 'text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-600 hover:border-slate-500 dark:hover:border-slate-400'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
