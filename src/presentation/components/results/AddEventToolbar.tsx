import type { EventKind } from '@/presentation/store/progressionStore'

export type AddEventAction =
  | { type: 'event'; kind: EventKind; label: string; tone?: 'accent' | 'warning' | 'success' }
  | { type: 'setupTurn'; side: 'attacker' | 'defender'; label: string; title: string; tone?: 'accent' }
  | { type: 'megaEvolve'; side: 'attacker' | 'defender'; label: string; title: string; tone?: 'accent' }
  | {
      type: 'leechSeed'
      direction: 'fromAttacker' | 'fromDefender'
      label: string
      title: string
      tone?: 'success'
    }

const ADD_EVENT_GROUPS: {
  label: string
  hint: string
  actions: AddEventAction[]
}[] = [
  {
    label: 'ターン進行',
    hint: '反撃・補助技・HP平均化',
    actions: [
      { type: 'event', kind: 'incoming', label: '＋攻撃側被ダメ', tone: 'warning' },
      {
        type: 'megaEvolve',
        side: 'attacker',
        label: '＋攻撃側メガ',
        tone: 'accent',
        title: 'この時点以降、攻撃側をメガシンカ後のステータス・特性として扱います',
      },
      {
        type: 'megaEvolve',
        side: 'defender',
        label: '＋防御側メガ',
        tone: 'accent',
        title: 'この時点以降、防御側をメガシンカ後のステータス・特性として扱います',
      },
      {
        type: 'setupTurn',
        side: 'attacker',
        label: '＋攻撃側補助',
        tone: 'accent',
        title: '攻撃側が積み技などの補助技を使うターンを時系列に追加',
      },
      {
        type: 'setupTurn',
        side: 'defender',
        label: '＋防御側補助',
        tone: 'accent',
        title: '防御側が積み技などの補助技を使うターンを時系列に追加',
      },
      { type: 'event', kind: 'painSplit', label: '＋痛み分け', tone: 'accent' },
      { type: 'event', kind: 'rearmBerry', label: '＋リサイクル', tone: 'success' },
    ],
  },
  {
    label: 'HP補正',
    hint: '順序を固定する定数ダメージ・回復',
    actions: [
      { type: 'event', kind: 'defenderConst', label: '＋防御側ダメ', tone: 'warning' },
      { type: 'event', kind: 'defenderRecover', label: '＋防御側回復', tone: 'success' },
      { type: 'event', kind: 'attackerConst', label: '＋攻撃側ダメ', tone: 'warning' },
      { type: 'event', kind: 'attackerRecover', label: '＋攻撃側回復', tone: 'success' },
    ],
  },
  {
    label: '継続効果',
    hint: '時系列に1ティックずつ挿入',
    actions: [
      {
        type: 'leechSeed',
        direction: 'fromAttacker',
        label: '＋宿り木（攻→防）',
        tone: 'success',
        title: '攻撃側が宿り木のタネを植えた状態の1ティック（防御側-1/8、攻撃側+同量）',
      },
      {
        type: 'leechSeed',
        direction: 'fromDefender',
        label: '＋宿り木（防→攻）',
        tone: 'success',
        title: '防御側が宿り木のタネを植えた状態の1ティック（攻撃側-1/8、防御側+同量）',
      },
    ],
  },
]

const ADD_BUTTON_BASE_CLASS = 'text-[11px] px-1.5 py-0.5 rounded border border-edge text-fg-muted transition-colors whitespace-nowrap'

function addButtonClass(tone: AddEventAction['tone'] = 'accent') {
  switch (tone) {
    case 'warning':
      return `${ADD_BUTTON_BASE_CLASS} hover:border-warning hover:text-warning`
    case 'success':
      return `${ADD_BUTTON_BASE_CLASS} hover:border-success hover:text-success`
    case 'accent':
    default:
      return `${ADD_BUTTON_BASE_CLASS} hover:border-accent hover:text-accent`
  }
}

interface AddEventToolbarProps {
  attackerCanMega: boolean
  defenderCanMega: boolean
  onAddAction: (action: AddEventAction) => void
}

export function AddEventToolbar({ attackerCanMega, defenderCanMega, onAddAction }: AddEventToolbarProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="label">イベント追加</span>
        <span className="text-[10px] text-fg-faint">末尾に追加</span>
      </div>
      <div className="space-y-1">
        {ADD_EVENT_GROUPS.map(group => (
          <div key={group.label} className="flex items-start gap-2">
            <div className="w-16 flex-shrink-0 pt-0.5">
              <div className="text-[11px] font-medium text-fg-muted leading-tight">{group.label}</div>
              <div className="text-[10px] text-fg-faint leading-tight">{group.hint}</div>
            </div>
            <div className="flex flex-wrap gap-1 min-w-0">
              {group.actions.map(action => (
                (() => {
                  const disabled =
                    action.type === 'megaEvolve' &&
                    (action.side === 'attacker' ? !attackerCanMega : !defenderCanMega)
                  return (
                <button
                  key={
                    action.type === 'event'
                      ? action.kind
                      : action.type === 'setupTurn'
                        ? `${action.type}-${action.side}`
                        : action.type === 'megaEvolve'
                          ? `${action.type}-${action.side}`
                          : `${action.type}-${action.direction}`
                  }
                  type="button"
                  onClick={() => onAddAction(action)}
                  disabled={disabled}
                  className={addButtonClass(action.tone)}
                  title={
                    action.type === 'leechSeed' || action.type === 'setupTurn' || action.type === 'megaEvolve'
                      ? action.title
                      : undefined
                  }
                >
                  {action.label}
                </button>
                  )
                })()
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
