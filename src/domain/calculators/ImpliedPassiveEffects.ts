/**
 * パネル状態から導出される常時効果（implied passive effects）
 *
 * 攻撃側・防御側パネルで設定済みの持ち物・状態異常・特性から、
 * 「ダメージ進行」の常時効果（PassiveEffect）を自動で導出する純粋ロジック。
 * 導出した効果はストア・スナップショットに保存せず、フック・UI が毎回その場で導出して
 * 手動の常時効果とマージする（`mergePassiveEffects`）。
 *
 * 導出規則（Gen 9）:
 *   - 持ち物 いのちのたま → `lifeOrb`（その側の攻撃ごとに 1/10 反動）
 *   - 持ち物 たべのこし   → `leftovers`（毎ターン末 1/16 回復）
 *   - 持ち物 くろいヘドロ → どくタイプ: `blackSludge`（1/16 回復）/ それ以外: `blackSludgeDamage`（1/8 ダメ）
 *   - 状態 やけど        → `burn`（毎ターン末 1/16）
 *   - 状態 どく          → `poison`（毎ターン末 1/8）
 *   - 状態 もうどく      → `toxic`（k/16 累進）
 *   - 特性 ポイズンヒール + どく/もうどく → `poisonHeal`（毎ターン末 1/8 回復）に置き換え
 *   - 特性 マジックガード → その側のダメージ系（反動・状態異常・くろいヘドロ）を導出しない
 *                           （たべのこし等の回復は本編どおり導出する）
 *   - まひ / ねむり / その他の持ち物からは何も導出しない
 *
 * 数値は手動カタログ行と完全に一致させるため、`PASSIVE_PRESETS` のプリセットをそのまま使う。
 */

import type { StatusCondition, TypeName } from '@/domain/models/Pokemon'
import {
  findPassivePreset,
  type PassiveEffect,
  type PassiveOrigin,
  type PassiveSide,
} from '@/domain/models/PassiveEffect'

export interface ImpliedSideState {
  /** 持ち物名（なしは null） */
  item: string | null
  status: StatusCondition
  /** 実効特性（メガシンカ後はメガの特性） */
  ability: string
  types: TypeName[]
}

export interface ImpliedPassiveInput {
  attacker: ImpliedSideState
  defender: ImpliedSideState
}

export const MAGIC_GUARD = 'マジックガード'
export const POISON_HEAL = 'ポイズンヒール'

/** 導出効果の決定的 id（`implied:<side>:<presetKey>`） */
export function impliedEffectId(side: PassiveSide, presetKey: string): string {
  return `implied:${side}:${presetKey}`
}

/** 導出効果（ストアに存在しない・固定化できない効果）か */
export function isImpliedEffect(effect: Pick<PassiveEffect, 'origin'>): boolean {
  return effect.origin !== undefined
}

function fromPreset(side: PassiveSide, presetKey: string, origin: PassiveOrigin): PassiveEffect {
  const preset = findPassivePreset(presetKey)
  if (!preset) throw new Error(`Unknown passive preset: ${presetKey}`)
  return {
    id: impliedEffectId(side, presetKey),
    side,
    kind: preset.kind,
    amount: { ...preset.amount },
    timing: preset.timing,
    // 持ち物・状態異常は時系列の全ターン（攻撃ごとの効果は全攻撃）に効き続ける
    count: 'all',
    startTurn: 1,
    order: preset.order,
    presetKey,
    label: preset.short,
    origin,
  }
}

/** 片側分の導出（持ち物 → 状態異常 の順） */
function deriveForSide(side: PassiveSide, s: ImpliedSideState): PassiveEffect[] {
  const out: PassiveEffect[] = []
  const magicGuard = s.ability === MAGIC_GUARD

  // --- 持ち物 ---
  switch (s.item) {
    case 'いのちのたま':
      if (!magicGuard) out.push(fromPreset(side, 'lifeOrb', 'item'))
      break
    case 'たべのこし':
      out.push(fromPreset(side, 'leftovers', 'item'))
      break
    case 'くろいヘドロ':
      if (s.types.includes('どく')) out.push(fromPreset(side, 'blackSludge', 'item'))
      else if (!magicGuard) out.push(fromPreset(side, 'blackSludgeDamage', 'item'))
      break
    default:
      break
  }

  // --- 状態異常 ---
  const poisoned = s.status === 'どく' || s.status === 'もうどく'
  if (poisoned && s.ability === POISON_HEAL) {
    out.push(fromPreset(side, 'poisonHeal', 'status'))
  } else if (!magicGuard) {
    if (s.status === 'やけど') out.push(fromPreset(side, 'burn', 'status'))
    else if (s.status === 'どく') out.push(fromPreset(side, 'poison', 'status'))
    else if (s.status === 'もうどく') out.push(fromPreset(side, 'toxic', 'status'))
  }

  return out
}

/** 攻守のパネル状態から常時効果を導出する（攻撃側 → 防御側の順） */
export function deriveImpliedPassiveEffects(input: ImpliedPassiveInput): PassiveEffect[] {
  return [
    ...deriveForSide('attacker', input.attacker),
    ...deriveForSide('defender', input.defender),
  ]
}

function dedupeKey(side: PassiveSide, presetKey: string): string {
  return `${side}|${presetKey}`
}

/**
 * 手動の常時効果と導出効果をマージする。
 * 手動に同じ (presetKey, side) の効果があれば導出側を捨てる（手動でいのちのたまを積んでいた
 * ユーザーが二重に課金されないように）。並びは 手動 → 導出（同 order 内の適用順を兼ねる）。
 */
export function mergePassiveEffects(manual: PassiveEffect[], implied: PassiveEffect[]): PassiveEffect[] {
  if (implied.length === 0) return manual
  const taken = new Set<string>()
  for (const m of manual) {
    if (m.presetKey !== undefined) taken.add(dedupeKey(m.side, m.presetKey))
  }
  const extra = implied.filter(i => i.presetKey === undefined || !taken.has(dedupeKey(i.side, i.presetKey)))
  return extra.length === 0 ? manual : [...manual, ...extra]
}
