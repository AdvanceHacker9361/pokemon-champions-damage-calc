import { useState } from 'react'
import { useAccumStore } from '@/presentation/store/accumStore'
import { useAttackerStore } from '@/presentation/store/pokemonStore'
import { calculateHP } from '@/domain/calculators/StatCalculator'
import { TypeBadge } from '@/presentation/components/shared/Badge'

/**
 * いたみわけ（Pain Split）を累積に挟むための専用行。
 * 攻撃側の技スロットに「いたみわけ」が選択されているとき、`DamageResultArea` がこの行を表示する。
 * 直近の累積エントリ直後にペインスプリットを挿入する。
 */
export function PainSplitInsertRow() {
  const entries        = useAccumStore(s => s.entries)
  const addPainSplit   = useAccumStore(s => s.addPainSplit)
  const attackerBaseHp = useAttackerStore(s => s.baseStats.hp)
  const attackerSpHp   = useAttackerStore(s => s.sp.hp)
  const attackerMaxHp  = attackerBaseHp > 0 ? calculateHP(attackerBaseHp, attackerSpHp) : 0

  const [hpInput, setHpInput] = useState<number>(attackerMaxHp || 0)

  // 攻撃側ストアの最大HPが後から変わったら入力値も追随（ユーザーが触っていない場合）
  // ただし手動編集後は上書きしない方が UX 上自然なので、初回マウントの値だけ反映する設計に留める
  // → 攻撃側ポケモン変更時に値が古いままになる懸念はあるが、明示的に編集する想定なので許容

  const lastEntryId = entries.length > 0 ? entries[entries.length - 1].id : null
  const canInsert = lastEntryId !== null && hpInput >= 0

  function handleInsert() {
    if (!lastEntryId) return
    addPainSplit(lastEntryId, hpInput)
  }

  return (
    <div className="bg-surface-2 rounded-lg px-3.5 py-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-fg">いたみわけ</span>
        <TypeBadge type="ノーマル" />
        <span className="text-[10px] text-fg-faint">変化 / 攻撃側現在HP × 防御側現在HP を平均化</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-fg-muted">攻撃側現在HP:</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setHpInput(Math.max(0, hpInput - 1))}
            className="w-5 h-5 text-xs bg-surface-3 hover:bg-surface-2 rounded text-fg-muted"
          >−</button>
          <input
            type="number"
            min={0}
            value={hpInput}
            onChange={e => setHpInput(Math.max(0, Number(e.target.value)))}
            className="input-base w-16 text-center text-xs px-1"
          />
          <button
            type="button"
            onClick={() => setHpInput(hpInput + 1)}
            className="w-5 h-5 text-xs bg-surface-3 hover:bg-surface-2 rounded text-fg-muted"
          >+</button>
        </div>
        {attackerMaxHp > 0 && (
          <button
            type="button"
            onClick={() => setHpInput(attackerMaxHp)}
            className="text-[10px] px-1.5 py-0.5 rounded border border-edge text-fg-faint hover:border-accent hover:text-accent transition-colors"
            title={`攻撃側最大HP ${attackerMaxHp} を入力`}
          >
            最大{attackerMaxHp}
          </button>
        )}
        <button
          type="button"
          onClick={handleInsert}
          disabled={!canInsert}
          className="ml-auto text-xs font-semibold px-3 py-1 rounded bg-accent-bg border border-accent-border text-accent hover:bg-accent-bg/70 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title={canInsert ? '直前に加算した技の後ろに痛み分けを挿入' : '先に技を加算してください'}
        >
          + 直前の技の後に挟む
        </button>
      </div>

      {!canInsert && entries.length === 0 && (
        <div className="text-[10px] text-fg-faint">
          ※ 痛み分けはダメージ加算の合間に挟むため、先に他の技を「+ 加算」してから挿入してください。
        </div>
      )}
    </div>
  )
}
