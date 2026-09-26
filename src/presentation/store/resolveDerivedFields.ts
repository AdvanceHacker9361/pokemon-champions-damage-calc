import type { BaseStats, TypeName } from '@/domain/models/Pokemon'
import type { MegaPokemonRecord } from '@/data/schemas/types'
import { PokemonRepository } from '@/data/repositories/PokemonRepository'
import type { PokemonSnapshot } from './sessionSnapshot'

export interface DerivedFields {
  baseStats: BaseStats
  types: TypeName[]
  weight: number
  effectiveAbility: string
  canMega: boolean
  availableMegas: MegaPokemonRecord[]
  isMega: boolean
  megaKey: string | null
}

export interface ResolveDerivedFieldsOptions {
  /**
   * true のとき、非メガかつフォルム上書き中（ブレード/マイティ）は
   * スナップショット自身の baseStats を維持する（種族値のフォルム上書きを打ち消さないため）。
   * セッション復元（`refreshDerivedFields`）専用。ビルドライブラリの正規化では使わない
   * （登録個体は「構成」であってフォルム状態を持ち越さないため）。
   */
  keepFormBaseStats?: boolean
}

/**
 * baseStats / types / weight / メガ関連をリポジトリから再解決する。
 * 保存済みスナップショットの陳腐化と、ブレード/マイティによる種族値上書きを打ち消す。
 * 解決できない（未選択・データから消えた種族）場合は null を返し、呼び出し側で元値を維持する。
 */
export function resolveDerivedFields(
  s: PokemonSnapshot,
  opts: ResolveDerivedFieldsOptions = {}
): DerivedFields | null {
  if (s.pokemonId == null) return null
  const record = PokemonRepository.findById(s.pokemonId)
  if (!record) return null

  const availableMegas = PokemonRepository.getMegasByBaseId(s.pokemonId)
  const mega = s.isMega && s.megaKey ? PokemonRepository.getMegaByKey(s.megaKey) : undefined

  // 登録時のメガ形態がデータから消えている / 別種族のキーだった場合は非メガへフォールバック
  if (mega && mega.basePokemonId === s.pokemonId) {
    return {
      baseStats: { ...mega.baseStats },
      types: [...mega.types],
      weight: mega.weight !== undefined ? mega.weight : record.weight,
      effectiveAbility: mega.ability,
      canMega: availableMegas.length > 0,
      availableMegas,
      isMega: true,
      megaKey: mega.key,
    }
  }

  const keepForm = opts.keepFormBaseStats === true && (s.isBlade || s.isMighty)

  return {
    baseStats: keepForm ? { ...s.baseStats } : { ...record.baseStats },
    types: [...record.types],
    weight: record.weight,
    effectiveAbility: s.abilityName,
    canMega: availableMegas.length > 0,
    availableMegas,
    isMega: false,
    megaKey: null,
  }
}

/**
 * セッション（タブ・localStorage）復元専用。
 * `resolveDerivedFields` を `keepFormBaseStats: true` で呼び、ブレード/マイティの
 * フォルム上書きは保ったまま weight/types/メガ関連だけをリポジトリから引き直す。
 *
 * ビルドライブラリの正規化（`normalizeBuildSnapshot`）と異なり、これは
 * 「戦闘中の状態」を保持したまま呼ばれるため、`effectiveAbility`（特性変更・
 * プロテインリベロ等でライブ変更されている場合がある）を勝手に上書きしない。
 * ただし、保存されていたメガキーがデータ更新等で解決できなくなり非メガへ
 * フォールバックする場合は、`resolveDerivedFields` と同じく
 * `effectiveAbility = abilityName` に戻す（メガ状態自体が壊れているため）。
 *
 * 解決できない（pokemonId 不明 / データから消えた種族）場合は元のスナップショットを
 * そのまま返す（同一参照で構わない）。
 */
export function refreshDerivedFields(s: PokemonSnapshot): PokemonSnapshot {
  const derived = resolveDerivedFields(s, { keepFormBaseStats: true })
  if (!derived) return s

  if (derived.isMega) {
    // メガ解決成功: 派生値（effectiveAbility = mega.ability 含む）をそのまま適用
    return { ...s, ...derived }
  }

  if (s.isMega) {
    // 保存されていたメガキーが解決できなかった: resolveDerivedFields と同じ
    // フォールバック（effectiveAbility = abilityName・isMega/megaKey を非メガへ）
    return { ...s, ...derived }
  }

  // 元から非メガ: ライブの effectiveAbility（特性変更・プロテイン系等）を上書きしない
  return { ...s, ...derived, effectiveAbility: s.effectiveAbility }
}
