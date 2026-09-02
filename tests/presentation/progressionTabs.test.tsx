import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ProgressionTabs } from '@/presentation/components/results/ProgressionTabs'
import type { InsertEventCtx } from '@/presentation/components/results/EventInsertMenu'

afterEach(() => cleanup())

const CTX: InsertEventCtx = { attackerCanMega: true, defenderCanMega: true }

function renderTabs(onSelectEvent = vi.fn()) {
  render(
    <ProgressionTabs
      ctx={CTX}
      onSelectEvent={onSelectEvent}
      defenderMaxHp={200}
      attackerMaxHp={100}
    />
  )
  return { onSelectEvent }
}

describe('ProgressionTabs', () => {
  it('デフォルトでイベントタブが選択され、EventInsertGrid のボタン群が表示される', () => {
    renderTabs()
    expect(screen.getByRole('tab', { name: 'イベント' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '定数ダメ' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: '回復' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('button', { name: '＋攻撃側被ダメ' })).toBeInTheDocument()
  })

  it('定数ダメタブをクリックするとスタブ文言に切り替わる', () => {
    renderTabs()
    fireEvent.click(screen.getByRole('tab', { name: '定数ダメ' }))
    expect(screen.getByRole('tab', { name: '定数ダメ' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByText('フェーズ C で実装')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: '＋攻撃側被ダメ' })).not.toBeInTheDocument()
  })

  it('回復タブをクリックするとスタブ文言に切り替わる', () => {
    renderTabs()
    fireEvent.click(screen.getByRole('tab', { name: '回復' }))
    expect(screen.getByRole('tab', { name: '回復' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByText('フェーズ C で実装')).toHaveLength(1)
  })

  it('矢印キーでタブ間をナビゲートできる（ArrowRight → ArrowLeft）', () => {
    renderTabs()
    const eventsTab = screen.getByRole('tab', { name: 'イベント' })
    const damageTab = screen.getByRole('tab', { name: '定数ダメ' })
    eventsTab.focus()
    fireEvent.keyDown(eventsTab, { key: 'ArrowRight' })
    expect(damageTab).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(damageTab)

    fireEvent.keyDown(damageTab, { key: 'ArrowLeft' })
    expect(screen.getByRole('tab', { name: 'イベント' })).toHaveAttribute('aria-selected', 'true')
  })

  it('End キーで最後のタブへ、Home キーで最初のタブへ移動する', () => {
    renderTabs()
    const eventsTab = screen.getByRole('tab', { name: 'イベント' })
    eventsTab.focus()
    fireEvent.keyDown(eventsTab, { key: 'End' })
    expect(screen.getByRole('tab', { name: '回復' })).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(screen.getByRole('tab', { name: '回復' }), { key: 'Home' })
    expect(screen.getByRole('tab', { name: 'イベント' })).toHaveAttribute('aria-selected', 'true')
  })

  it('イベントタブのアクションボタンを押すと onSelectEvent がキー付きで呼ばれる', () => {
    const { onSelectEvent } = renderTabs()
    fireEvent.click(screen.getByRole('button', { name: '＋痛み分け' }))
    expect(onSelectEvent).toHaveBeenCalledWith('painSplit')
  })

  it('メガシンカ不可のときは＋攻撃側メガ/＋防御側メガが disabled になる', () => {
    render(
      <ProgressionTabs
        ctx={{ attackerCanMega: false, defenderCanMega: false }}
        onSelectEvent={vi.fn()}
        defenderMaxHp={200}
        attackerMaxHp={100}
      />
    )
    expect(screen.getByRole('button', { name: '＋攻撃側メガ' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '＋防御側メガ' })).toBeDisabled()
  })
})
