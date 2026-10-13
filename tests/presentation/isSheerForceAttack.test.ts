import { describe, expect, it } from 'vitest'
import { makeIsSheerForceAttack } from '@/presentation/hooks/isSheerForceAttack'
import { MoveRepository } from '@/data/repositories/MoveRepository'
import type { ProgressionEvent } from '@/presentation/store/progressionStore'

function attackEv(id: string, moveName: string | undefined): ProgressionEvent {
  return { kind: 'attack', id, moveName } as unknown as ProgressionEvent
}
function incomingEv(id: string, moveName: string | null): ProgressionEvent {
  return { kind: 'incoming', id, moveName, crit: false }
}

describe('makeIsSheerForceAttack', () => {
  it('前提: かみくだく は追加効果あり、つばめがえし は無し', () => {
    expect(MoveRepository.findByName('かみくだく')?.hasSecondaryEffect).toBe(true)
    expect(MoveRepository.findByName('つばめがえし')?.hasSecondaryEffect).not.toBe(true)
  })

  const events: ProgressionEvent[] = [
    attackEv('a1', 'かみくだく'),
    attackEv('a2', 'つばめがえし'),
    incomingEv('in1', 'かみくだく'),
    incomingEv('in2', 'つばめがえし'),
    attackEv('a3', undefined),
    attackEv('a4', '存在しない技'),
    incomingEv('in3', null),
  ]

  it('攻撃側 ちからずく: attack の追加効果あり技だけ true（incoming は防御側の特性で判定）', () => {
    const f = makeIsSheerForceAttack(events, 'ちからずく', 'いかく')
    expect(f('a1')).toBe(true)
    expect(f('a2')).toBe(false)
    expect(f('in1')).toBe(false)
    expect(f('a3')).toBe(false)
    expect(f('a4')).toBe(false)
    expect(f('unknown')).toBe(false)
  })

  it('防御側 ちからずく: incoming の追加効果あり技だけ true', () => {
    const f = makeIsSheerForceAttack(events, 'いかく', 'ちからずく')
    expect(f('a1')).toBe(false)
    expect(f('in1')).toBe(true)
    expect(f('in2')).toBe(false)
    expect(f('in3')).toBe(false)
  })

  it('どちらも ちからずく でなければ常に false', () => {
    const f = makeIsSheerForceAttack(events, 'なし', 'なし')
    expect(['a1', 'a2', 'in1', 'in2'].map(f)).toEqual([false, false, false, false])
  })
})
