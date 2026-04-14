import { MoveSelect } from './MoveSelect'
import type { PokemonStore } from '@/presentation/store/pokemonStore'

interface MoveSlotsProps {
  moves: PokemonStore['moves']
  setMove: PokemonStore['setMove']
}

export function MoveSlots({ moves, setMove }: MoveSlotsProps) {
  return (
    <div className="space-y-1.5">
      <span className="label">技</span>
      <div className="grid grid-cols-2 gap-1.5">
        {([0, 1, 2, 3] as const).map(slot => (
          <MoveSelect
            key={slot}
            value={moves[slot]}
            onChange={name => setMove(slot, name)}
            placeholder={`技${slot + 1}`}
          />
        ))}
      </div>
    </div>
  )
}
