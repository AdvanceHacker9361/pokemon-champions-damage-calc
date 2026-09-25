import { useMemo } from 'react'
import { useAttackerStore, useDefenderStore, type PokemonStore } from '@/presentation/store/pokemonStore'
import { useProgressionStore } from '@/presentation/store/progressionStore'
import {
  deriveImpliedPassiveEffects,
  mergePassiveEffects,
  type ImpliedSideState,
} from '@/domain/calculators/ImpliedPassiveEffects'
import type { PassiveEffect } from '@/domain/models/PassiveEffect'

type SideSource = Pick<PokemonStore, 'itemName' | 'status' | 'effectiveAbility' | 'types'>

/** ポケモンストアの状態 → 導出用の片側状態 */
export function impliedSideStateOf(s: SideSource): ImpliedSideState {
  return { item: s.itemName, status: s.status, ability: s.effectiveAbility, types: s.types }
}

/** 攻守のストア状態から導出効果を求める（フックの useMemo 内から呼ぶ用） */
export function impliedPassivesFromStores(attacker: SideSource, defender: SideSource): PassiveEffect[] {
  return deriveImpliedPassiveEffects({
    attacker: impliedSideStateOf(attacker),
    defender: impliedSideStateOf(defender),
  })
}

export interface EffectivePassiveEffects {
  /** ユーザーがカタログから積んだ効果（ストアの passiveEffects そのまま） */
  manual: PassiveEffect[]
  /** パネル状態（持ち物・状態異常・特性）から導出した効果（ストアには保存しない） */
  implied: PassiveEffect[]
  /** 展開に使う効果 = 手動 + 手動と重複しない導出効果 */
  effective: PassiveEffect[]
}

/**
 * 手動の常時効果とパネル状態からの導出効果をマージして返す。
 * 展開（ゴースト行・シミュレーション・エクスポート）は `effective` を、
 * 固定化・クリア等のストア操作は `manual` を使う。
 */
export function useEffectivePassiveEffects(): EffectivePassiveEffects {
  const manual = useProgressionStore(s => s.passiveEffects)
  const aItem = useAttackerStore(s => s.itemName)
  const aStatus = useAttackerStore(s => s.status)
  const aAbility = useAttackerStore(s => s.effectiveAbility)
  const aTypes = useAttackerStore(s => s.types)
  const dItem = useDefenderStore(s => s.itemName)
  const dStatus = useDefenderStore(s => s.status)
  const dAbility = useDefenderStore(s => s.effectiveAbility)
  const dTypes = useDefenderStore(s => s.types)

  const implied = useMemo(
    () => impliedPassivesFromStores(
      { itemName: aItem, status: aStatus, effectiveAbility: aAbility, types: aTypes },
      { itemName: dItem, status: dStatus, effectiveAbility: dAbility, types: dTypes },
    ),
    [aItem, aStatus, aAbility, aTypes, dItem, dStatus, dAbility, dTypes],
  )
  const effective = useMemo(() => mergePassiveEffects(manual, implied), [manual, implied])
  return { manual, implied, effective }
}
