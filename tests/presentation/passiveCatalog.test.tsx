import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { PassiveDamageTab } from '@/presentation/components/results/PassiveDamageTab'
import { PassiveRecoverTab } from '@/presentation/components/results/PassiveRecoverTab'
import { DamageProgressionPanel } from '@/presentation/components/results/DamageProgressionPanel'
import { useProgressionStore, type AttackPayload } from '@/presentation/store/progressionStore'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { TURN_END_ORDER } from '@/domain/models/PassiveEffect'

const DEFENDER_MAX_HP = 183
const ATTACKER_MAX_HP = 175

afterEach(() => {
  cleanup()
  useProgressionStore.getState().clear()
})

function renderDamageTab() {
  render(<PassiveDamageTab defenderMaxHp={DEFENDER_MAX_HP} attackerMaxHp={ATTACKER_MAX_HP} />)
}

function renderRecoverTab() {
  render(<PassiveRecoverTab defenderMaxHp={DEFENDER_MAX_HP} attackerMaxHp={ATTACKER_MAX_HP} />)
}

function row(testId: string) {
  return within(screen.getByTestId(testId))
}

function stepper(testId: string) {
  const r = row(testId)
  return {
    count: () => screen.getByTestId(`${testId}-count`).textContent,
    inc: () => fireEvent.click(r.getByRole('button', { name: /回数を増やす/ })),
    dec: () => fireEvent.click(r.getByRole('button', { name: /回数を減らす/ })),
    all: () => fireEvent.click(r.getByRole('button', { name: /全ターンに適用/ })),
  }
}

const effects = () => useProgressionStore.getState().passiveEffects

describe('PassiveCatalog（定数ダメ / 回復タブ）', () => {
  it('＋ で防御側の常時効果が count=1 で追加され、もう一度押すと 2 になる', () => {
    renderDamageTab()
    const s = stepper('passive-row-sandstorm')
    expect(s.count()).toBe('0')

    s.inc()
    expect(effects()).toHaveLength(1)
    expect(effects()[0]).toMatchObject({
      presetKey: 'sandstorm', side: 'defender', kind: 'damage',
      timing: 'turnEnd', count: 1, startTurn: 1, order: TURN_END_ORDER.weather,
    })
    expect(s.count()).toBe('1')

    s.inc()
    expect(effects()).toHaveLength(1)
    expect(effects()[0].count).toBe(2)
    expect(s.count()).toBe('2')
  })

  it('「全」で count が all になり、all から − すると回数へ戻る', () => {
    renderDamageTab()
    const s = stepper('passive-row-sandstorm')
    s.all()
    expect(effects()[0].count).toBe('all')
    expect(s.count()).toBe('全')

    // 時系列にターンが無い場合は最低 1 ターン分に戻す
    s.dec()
    expect(effects()[0].count).toBe(1)
  })

  it('count=1 から − すると効果ごと削除される', () => {
    renderDamageTab()
    const s = stepper('passive-row-sandstorm')
    s.inc()
    expect(effects()).toHaveLength(1)
    s.dec()
    expect(effects()).toHaveLength(0)
    expect(s.count()).toBe('0')
  })

  it('対象を攻撃側へ切り替えると同じプリセットのステッパーは空になる', () => {
    renderDamageTab()
    stepper('passive-row-sandstorm').inc()
    expect(screen.getByTestId('passive-row-sandstorm-count').textContent).toBe('1')

    fireEvent.click(screen.getByRole('button', { name: '攻撃側' }))
    expect(screen.getByTestId('passive-row-sandstorm-count').textContent).toBe('0')
    // 防御側の効果は残っている
    expect(effects()).toHaveLength(1)

    // 攻撃側で積むと別エントリになる
    stepper('passive-row-sandstorm').inc()
    expect(effects().map(e => e.side)).toEqual(['defender', 'attacker'])
  })

  it('1適用あたりの実量を表示する（HP183 の 1/16 切り捨て = 11）', () => {
    renderDamageTab()
    expect(screen.getByTestId('passive-row-sandstorm-amount').textContent).toBe('防−11/回')
  })

  it('クリア（定数ダメ）は回復の常時効果を消さない', () => {
    renderDamageTab()
    stepper('passive-row-sandstorm').inc()
    act(() => {
      useProgressionStore.getState().addPassiveEffect({
        side: 'defender', kind: 'recover',
        amount: { type: 'ratio', num: 1, den: 16, rounding: 'floor' },
        timing: 'turnEnd', count: 'all', startTurn: 1,
        order: TURN_END_ORDER.itemHeal, presetKey: 'leftovers', label: 'たべのこし',
      })
    })
    expect(effects()).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'クリア' }))
    expect(effects().map(e => e.kind)).toEqual(['recover'])
  })

  it('回復タブ: きのみサブタブは防御側の BerryConfig を編集する', () => {
    renderRecoverTab()
    fireEvent.click(screen.getByRole('button', { name: 'きのみ' }))
    fireEvent.change(screen.getByLabelText('きのみ回復量'), { target: { value: '40' } })
    fireEvent.change(screen.getByLabelText('きのみ発動しきい値（%）'), { target: { value: '25' } })

    const store = useProgressionStore.getState()
    expect(store.defenderBerry).toMatchObject({ amount: 40, thresholdPct: 25 })
    expect(store.attackerBerry.amount).toBe(0)
  })

  it('回復タブ: 攻撃側を選ぶと きのみ編集対象が attackerBerry になる', () => {
    renderRecoverTab()
    fireEvent.click(screen.getByRole('button', { name: 'きのみ' }))
    fireEvent.click(screen.getByRole('button', { name: '攻撃側' }))
    // 攻撃側でも同じ編集UIが表示される（旧「次フェーズ」注記は撤去）
    expect(screen.getByLabelText('きのみ回復量')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('きのみ回復量'), { target: { value: '33' } })
    expect(useProgressionStore.getState().attackerBerry).toMatchObject({ amount: 33, thresholdPct: 50 })
    expect(useProgressionStore.getState().defenderBerry.amount).toBe(0)
  })

  it('回復タブ: きのみプリセットは選択中の側の最大HPから量を決める', () => {
    renderRecoverTab()
    fireEvent.click(screen.getByRole('button', { name: 'きのみ' }))
    // 防御側 HP183 の 1/4 = 45
    fireEvent.click(screen.getByRole('button', { name: /オボン/ }))
    expect(useProgressionStore.getState().defenderBerry).toMatchObject({ amount: 45, thresholdPct: 50 })

    // 攻撃側 HP175 の 1/3 = 58（混乱実）
    fireEvent.click(screen.getByRole('button', { name: '攻撃側' }))
    fireEvent.click(screen.getByRole('button', { name: /混乱実/ }))
    expect(useProgressionStore.getState().attackerBerry).toMatchObject({ amount: 58, thresholdPct: 25 })
  })

  it('回復タブ: はんすう・しゅうかくも側ごとに独立して切り替わる', () => {
    renderRecoverTab()
    fireEvent.click(screen.getByRole('button', { name: 'きのみ' }))
    fireEvent.click(screen.getByRole('button', { name: '攻撃側' }))
    fireEvent.change(screen.getByLabelText('きのみ回復量'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /はんすう/ }))
    fireEvent.click(screen.getByRole('button', { name: '晴/物拾' }))

    expect(useProgressionStore.getState().attackerBerry)
      .toMatchObject({ cudChew: true, harvestChance: 1 })
    expect(useProgressionStore.getState().defenderBerry)
      .toMatchObject({ cudChew: false, harvestChance: 0 })
  })

  it('回復タブ: 単発の「＋末尾に追加」で解決済みの回復イベントを末尾へ追加する', () => {
    renderRecoverTab()
    fireEvent.click(screen.getByRole('button', { name: '単発' }))
    const oneShot = within(screen.getByTestId('passive-oneshot-recover50'))
    fireEvent.click(oneShot.getByRole('button', { name: '＋末尾に追加' }))

    const events = useProgressionStore.getState().events
    expect(events).toHaveLength(1)
    // HP183 の 1/2 切り捨て = 91
    expect(events[0]).toMatchObject({ kind: 'defenderRecover', amount: 91, label: '回復技1/2' })
    // 常時効果としては積まれない
    expect(effects()).toHaveLength(0)
  })

  it('固定サブタブのフォームからカスタム効果を追加できる', () => {
    renderDamageTab()
    fireEvent.click(screen.getByRole('button', { name: '固定' }))
    fireEvent.change(screen.getByLabelText('固定効果の名前'), { target: { value: 'テスト固定' } })
    fireEvent.change(screen.getByLabelText('固定効果の量'), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: '＋追加' }))

    expect(effects()).toHaveLength(1)
    expect(effects()[0]).toMatchObject({
      side: 'defender', kind: 'damage', timing: 'turnEnd', count: 1,
      label: 'テスト固定', amount: { type: 'fixed', value: 7 },
    })
    // カスタム行としても描画される
    expect(screen.getByTestId(`passive-custom-${effects()[0].id}`)).toBeInTheDocument()
  })
})

function attackPayload(usages: number): AttackPayload {
  const rolls = Array(16).fill(30)
  return {
    label: 'テスト与ダメ',
    rolls, rawRolls: rolls, usages,
    minDmg: 30, maxDmg: 30, rawMin: 30, rawMax: 30,
    defenderMaxHp: DEFENDER_MAX_HP, hadMultiscale: false,
    critRolls: rolls, rawCritRolls: rolls,
    critMin: 30, critMax: 30, rawCritMin: 30, rawCritMax: 30,
    critChance: 0, isForcedCrit: false,
  }
}

describe('DamageProgressionPanel のゴースト行', () => {
  afterEach(() => {
    cleanup()
    useProgressionStore.getState().clear()
    useAttackerStore.getState().reset()
    useDefenderStore.getState().reset()
  })

  it('攻撃(×2) と すなあらし「全」で T1末 / T2末 の自動適用行が出る', () => {
    const store = useProgressionStore.getState()
    store.addAttack(attackPayload(2))
    store.addPassiveEffect({
      side: 'defender', kind: 'damage',
      amount: { type: 'ratio', num: 1, den: 16, rounding: 'floor' },
      timing: 'turnEnd', count: 'all', startTurn: 1,
      order: TURN_END_ORDER.weather, presetKey: 'sandstorm', label: 'すなあらし',
    })

    render(<DamageProgressionPanel defenderMaxHp={DEFENDER_MAX_HP} />)

    const ghosts = screen.getAllByLabelText('自動適用')
    const text = ghosts.map(g => g.textContent ?? '').join('\n')
    expect(text).toContain('T1末')
    expect(text).toContain('T2末')
    expect(text).toContain('すなあらし')
  })

  it('常時効果が無ければゴースト行は描画されない', () => {
    useProgressionStore.getState().addAttack(attackPayload(1))
    render(<DamageProgressionPanel defenderMaxHp={DEFENDER_MAX_HP} />)
    expect(screen.queryAllByLabelText('自動適用')).toHaveLength(0)
  })

  it('ゴースト行の「固定化」でゴーストが消え、source=pinned の手動イベントに変わる', () => {
    const store = useProgressionStore.getState()
    store.addAttack(attackPayload(2))
    store.addPassiveEffect({
      side: 'defender', kind: 'damage',
      amount: { type: 'ratio', num: 1, den: 16, rounding: 'floor' },
      timing: 'turnEnd', count: 'all', startTurn: 1,
      order: TURN_END_ORDER.weather, presetKey: 'sandstorm', label: 'すなあらし',
    })

    render(<DamageProgressionPanel defenderMaxHp={DEFENDER_MAX_HP} />)
    expect(screen.getAllByLabelText('自動適用').length).toBeGreaterThan(0)

    const pinButtons = screen.getAllByRole('button', { name: '固定化' })
    expect(pinButtons.length).toBeGreaterThan(0)
    act(() => { fireEvent.click(pinButtons[0]) })

    // 常時効果は取り除かれ、ゴースト行も消える
    expect(useProgressionStore.getState().passiveEffects).toHaveLength(0)
    expect(screen.queryAllByLabelText('自動適用')).toHaveLength(0)

    // 全ターン分（T1末 / T2末）が pinned イベントとして入る
    const events = useProgressionStore.getState().events
    expect(events.map(e => e.kind)).toEqual(['attack', 'defenderConst', 'attack', 'defenderConst'])
    expect(events.filter(e => e.kind === 'defenderConst').map(e => e.label))
      .toEqual(['T1末 すなあらし', 'T2末 すなあらし'])
    expect(events.filter(e => e.kind === 'defenderConst').every(e => e.source === 'pinned')).toBe(true)
    // 「固定」バッジが行に出る
    expect(screen.getAllByTitle(/常時効果を固定化して生成された行/).length).toBe(2)
  })

  it('ヘッダーの「すべて固定化」は常時効果があるときだけ出て、全件を固定化する', () => {
    const store = useProgressionStore.getState()
    store.addAttack(attackPayload(1))

    const { rerender } = render(<DamageProgressionPanel defenderMaxHp={DEFENDER_MAX_HP} />)
    expect(screen.queryByRole('button', { name: /すべて固定化/ })).toBeNull()

    act(() => {
      store.addPassiveEffect({
        side: 'defender', kind: 'damage',
        amount: { type: 'ratio', num: 1, den: 16, rounding: 'floor' },
        timing: 'turnEnd', count: 'all', startTurn: 1,
        order: TURN_END_ORDER.weather, presetKey: 'sandstorm', label: 'すなあらし',
      })
      store.addPassiveEffect({
        side: 'defender', kind: 'recover',
        amount: { type: 'ratio', num: 1, den: 16, rounding: 'floor' },
        timing: 'turnEnd', count: 'all', startTurn: 1,
        order: TURN_END_ORDER.itemHeal, presetKey: 'leftovers', label: 'たべのこし',
      })
    })
    rerender(<DamageProgressionPanel defenderMaxHp={DEFENDER_MAX_HP} />)

    act(() => { fireEvent.click(screen.getByRole('button', { name: /すべて固定化/ })) })

    expect(useProgressionStore.getState().passiveEffects).toHaveLength(0)
    expect(useProgressionStore.getState().events.map(e => e.kind))
      .toEqual(['attack', 'defenderConst', 'defenderRecover'])
    expect(screen.queryByRole('button', { name: /すべて固定化/ })).toBeNull()
  })
})
