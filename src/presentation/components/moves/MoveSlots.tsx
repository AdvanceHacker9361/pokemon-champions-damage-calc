import { useState, useEffect } from 'react'
import { MoveSelect } from './MoveSelect'
import type { PokemonStore } from '@/presentation/store/pokemonStore'
import { MoveRepository } from '@/data/repositories/MoveRepository'
import { resolveReversalPower } from '@/domain/calculators/SpecialMoveCalc'

interface MoveSlotsProps {
  moves: PokemonStore['moves']
  setMove: PokemonStore['setMove']
  movePowers: PokemonStore['movePowers']
  setMovePower: PokemonStore['setMovePower']
  /** 攻撃側の実数値HP（きしかいせい / じたばた の最大HPとして使用） */
  maxHP?: number
}

export function MoveSlots({ moves, setMove, movePowers, setMovePower, maxHP }: MoveSlotsProps) {
  // きしかいせい / じたばた 用の HP テキスト入力（スロットごと）
  const [hpInputs, setHpInputs] = useState<[string, string, string, string]>(['', '', '', ''])

  // 技が変わったら HP 入力をリセット
  useEffect(() => {
    setHpInputs(prev => {
      const next = [...prev] as typeof prev
      ;([0, 1, 2, 3] as const).forEach(slot => {
        const move = moves[slot] ? MoveRepository.findByName(moves[slot]!) : null
        if (move?.special !== 'reversal') next[slot] = ''
      })
      return next
    })
  }, [moves[0], moves[1], moves[2], moves[3]]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleHpChange(slot: 0 | 1 | 2 | 3, raw: string) {
    const next = [...hpInputs] as typeof hpInputs
    next[slot] = raw
    setHpInputs(next)

    const val = parseInt(raw, 10)
    const max = maxHP ?? 1
    if (!raw || isNaN(val) || val < 1) {
      setMovePower(slot, null)
      return
    }
    const clamped = Math.min(val, max)
    setMovePower(slot, resolveReversalPower(clamped, max))
  }

  return (
    <div className="space-y-1.5">
      <span className="label">技</span>
      <div className="grid grid-cols-2 gap-1.5">
        {([0, 1, 2, 3] as const).map(slot => {
          const moveName = moves[slot]
          const moveRecord = moveName ? MoveRepository.findByName(moveName) : null
          const isReversal   = moveRecord?.special === 'reversal'
          const hasPowerOpts = (moveRecord?.powerOptions?.length ?? 0) > 0

          // きしかいせい / じたばた: 現在の威力を表示
          const currentHP = parseInt(hpInputs[slot], 10)
          const max = maxHP ?? 0
          const reversalPower =
            isReversal && !isNaN(currentHP) && currentHP >= 1
              ? resolveReversalPower(Math.min(currentHP, max), max)
              : movePowers[slot] ?? moveRecord?.power ?? null

          return (
            <div key={slot} className="space-y-1">
              <MoveSelect
                value={moveName}
                onChange={name => setMove(slot, name)}
                placeholder={`技${slot + 1}`}
              />

              {/* ── きしかいせい / じたばた: HP入力 ── */}
              {isReversal && moveName && (
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min={1}
                      max={max || undefined}
                      value={hpInputs[slot]}
                      onChange={e => handleHpChange(slot, e.target.value)}
                      placeholder={max ? `HP (最大${max})` : 'HP入力'}
                      className="input-base w-full text-xs pr-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    → 威力
                    <span className={`ml-1 font-semibold ${
                      reversalPower !== null
                        ? reversalPower >= 150 ? 'text-red-500 dark:text-red-400'
                        : reversalPower >= 100 ? 'text-orange-500 dark:text-orange-400'
                        : reversalPower >= 80  ? 'text-yellow-600 dark:text-yellow-400'
                        : 'text-slate-600 dark:text-slate-400'
                        : 'text-slate-400'
                    }`}>
                      {reversalPower ?? '—'}
                    </span>
                  </span>
                </div>
              )}

              {/* ── 可変威力ボタン (powerOptions, おはかまいり等) ── */}
              {hasPowerOpts && moveName && (
                <div className="flex gap-1">
                  {moveRecord!.powerOptions!.map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setMovePower(slot, p)}
                      className={`flex-1 text-xs py-0.5 rounded border transition-colors ${
                        (movePowers[slot] ?? moveRecord!.power) === p
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
