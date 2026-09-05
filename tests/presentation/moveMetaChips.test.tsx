import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MoveMetaChips } from '@/presentation/components/moves/MoveMetaChips'
import { getPowerLabel } from '@/presentation/components/moves/movePowerLabel'
import { MoveRepository } from '@/data/repositories/MoveRepository'
import type { MoveRecord } from '@/data/schemas/types'

function findMove(name: string): MoveRecord {
  const move = MoveRepository.findByName(name)
  if (!move) throw new Error(`技が見つからない: ${name}`)
  return move
}

describe('getPowerLabel', () => {
  it('けたぐりは文脈がないとき「威力可変」（moves.json の power=1 を出さない）', () => {
    expect(getPowerLabel(findMove('けたぐり'))).toBe('威力可変')
    expect(getPowerLabel(findMove('けたぐり'), null)).toBe('威力可変')
  })

  it('けたぐりは解決済み威力が渡されたらその値を出す', () => {
    expect(getPowerLabel(findMove('けたぐり'), 80)).toBe('威力80')
  })

  it('ヘビーボンバー / ジャイロボール / くさむすび も文脈なしでは「威力可変」', () => {
    expect(getPowerLabel(findMove('ヘビーボンバー'))).toBe('威力可変')
    expect(getPowerLabel(findMove('ジャイロボール'))).toBe('威力可変')
    expect(getPowerLabel(findMove('くさむすび'))).toBe('威力可変')
  })

  it('ハードプレスは未選択なら選択肢を並べる', () => {
    expect(getPowerLabel(findMove('ハードプレス'))).toBe('威力25/50/75/100')
  })

  it('ハードプレスは選択済みならその威力を出す', () => {
    expect(getPowerLabel(findMove('ハードプレス'), 50)).toBe('威力50')
  })

  it('通常技は moves.json の威力をそのまま出す', () => {
    expect(getPowerLabel(findMove('じしん'))).toBe('威力100')
  })

  it('変化技は威力チップを出さない', () => {
    expect(getPowerLabel(findMove('おにび'))).toBeNull()
  })
})

describe('MoveMetaChips', () => {
  it('けたぐりを文脈なしで描画すると「威力可変」チップになる', () => {
    render(<MoveMetaChips move={findMove('けたぐり')} />)
    expect(screen.getByText('威力可変')).toBeTruthy()
  })

  it('解決済み威力を渡すとその値とツールチップを表示する', () => {
    render(
      <MoveMetaChips
        move={findMove('けたぐり')}
        power={80}
        powerTitle="相手体重 95.0kg → 威力80"
      />,
    )
    const chip = screen.getByText('威力80')
    expect(chip.getAttribute('title')).toBe('相手体重 95.0kg → 威力80')
  })
})
