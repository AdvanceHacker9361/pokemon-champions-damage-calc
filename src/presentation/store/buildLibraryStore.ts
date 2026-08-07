import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BaseStats, StatKey, StatusCondition, TypeName } from '@/domain/models/Pokemon'
import { ALL_TYPE_NAMES } from '@/domain/models/Pokemon'
import { createSpDistribution, type SpDistribution } from '@/domain/models/StatPoints'
import { SP_MAX_STAT } from '@/domain/constants/spLimits'
import type { StatNatures } from '@/application/usecases/CalculateStatsUseCase'
import type { MegaPokemonRecord } from '@/data/schemas/types'
import { PokemonRepository } from '@/data/repositories/PokemonRepository'
import { defaultAbilityActivated, useAttackerStore, useDefenderStore } from './pokemonStore'
import { clonePokemonSnapshot, genId, type PokemonSnapshot } from './sessionSnapshot'

/** 登録できる個体の上限数 */
export const BUILD_LIBRARY_MAX = 300

export interface RegisteredBuild {
  id: string
  nickname: string
  snapshot: PokemonSnapshot
  /** epoch ms */
  createdAt: number
  updatedAt: number
}

export type ImportResult =
  | { ok: true; added: number }
  | { ok: false; error: string }

// ---------------------------------------------------------------------------
// 正規化
// ---------------------------------------------------------------------------

const DEFAULT_RANKS: Record<StatKey, number> = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
const NATURE_STAT_KEYS = ['atk', 'def', 'spa', 'spd', 'spe'] as const
const NATURE_VALUES = [0.9, 1.0, 1.1]
const STATUS_VALUES: StatusCondition[] = ['やけど', 'まひ', 'どく', 'もうどく', 'ねむり']

interface DerivedFields {
  baseStats: BaseStats
  types: TypeName[]
  weight: number
  effectiveAbility: string
  canMega: boolean
  availableMegas: MegaPokemonRecord[]
  isMega: boolean
  megaKey: string | null
}

/**
 * baseStats / types / weight / メガ関連をリポジトリから再解決する。
 * 保存済みスナップショットの陳腐化と、ブレード/マイティによる種族値上書きを打ち消す。
 * 解決できない（未選択・データから消えた種族）場合は null を返し、呼び出し側で元値を維持する。
 */
function resolveDerivedFields(s: PokemonSnapshot): DerivedFields | null {
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

  return {
    baseStats: { ...record.baseStats },
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
 * 登録個体は「構成」であって「戦闘中の状態」ではない。
 * ランク・状態異常・一時フラグを初期値へ戻し、派生値をリポジトリから引き直す。
 */
export function normalizeBuildSnapshot(source: PokemonSnapshot): PokemonSnapshot {
  const cloned = clonePokemonSnapshot(source)
  const derived = resolveDerivedFields(cloned)
  const base: PokemonSnapshot = derived ? { ...cloned, ...derived } : cloned

  return {
    ...base,
    ranks: { ...DEFAULT_RANKS },
    status: null,
    abilityActivated: defaultAbilityActivated(base.effectiveAbility),
    proteanType: null,
    proteanStab: true,
    focusEnergyActive: false,
    chargeActive: false,
    metronomeMultiplier: 1,
    supremeOverlordBoost: 0,
    grounded: false,
    isBlade: false,
    isMighty: false,
  }
}

// ---------------------------------------------------------------------------
// 外部入力（インポート）の型強制
// ---------------------------------------------------------------------------

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {}
}

function asStr(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback
}

function asStrOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function asNum(v: unknown, fallback: number, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  return Math.max(min, Math.min(max, v))
}

function asIntOrNull(v: unknown, min: number, max: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  return Math.max(min, Math.min(max, Math.trunc(v)))
}

function coerceStatNatures(v: unknown): StatNatures {
  const r = asRecord(v)
  const out: StatNatures = {}
  for (const k of NATURE_STAT_KEYS) {
    const val = r[k]
    out[k] = typeof val === 'number' && NATURE_VALUES.includes(val) ? val : 1.0
  }
  return out
}

function coerceSp(v: unknown): SpDistribution {
  const r = asRecord(v)
  return createSpDistribution({
    hp: asNum(r.hp, 0, 0, SP_MAX_STAT),
    atk: asNum(r.atk, 0, 0, SP_MAX_STAT),
    def: asNum(r.def, 0, 0, SP_MAX_STAT),
    spa: asNum(r.spa, 0, 0, SP_MAX_STAT),
    spd: asNum(r.spd, 0, 0, SP_MAX_STAT),
    spe: asNum(r.spe, 0, 0, SP_MAX_STAT),
  })
}

function coerceRanks(v: unknown): Record<StatKey, number> {
  const r = asRecord(v)
  return {
    hp: asNum(r.hp, 0, -6, 6),
    atk: asNum(r.atk, 0, -6, 6),
    def: asNum(r.def, 0, -6, 6),
    spa: asNum(r.spa, 0, -6, 6),
    spd: asNum(r.spd, 0, -6, 6),
    spe: asNum(r.spe, 0, -6, 6),
  }
}

function coerceStats(v: unknown): BaseStats {
  const r = asRecord(v)
  return {
    hp: asNum(r.hp, 0, 0, 999),
    atk: asNum(r.atk, 0, 0, 999),
    def: asNum(r.def, 0, 0, 999),
    spa: asNum(r.spa, 0, 0, 999),
    spd: asNum(r.spd, 0, 0, 999),
    spe: asNum(r.spe, 0, 0, 999),
  }
}

function coerceMoves(v: unknown): PokemonSnapshot['moves'] {
  const arr = Array.isArray(v) ? v : []
  return [asStrOrNull(arr[0]), asStrOrNull(arr[1]), asStrOrNull(arr[2]), asStrOrNull(arr[3])]
}

function coerceMovePowers(v: unknown): PokemonSnapshot['movePowers'] {
  const arr = Array.isArray(v) ? v : []
  const one = (x: unknown): number | null => asIntOrNull(x, 0, 999)
  return [one(arr[0]), one(arr[1]), one(arr[2]), one(arr[3])]
}

/**
 * 未知のキーを一切通さない 28 フィールドのホワイトリスト再構築。
 * インポート経路の値がそのまま setState に流れ込むのを防ぐ。
 * availableMegas は常に空で作り、normalizeBuildSnapshot でリポジトリから再解決する。
 */
function coerceSnapshot(raw: unknown): PokemonSnapshot {
  const r = asRecord(raw)
  const rawTypes = Array.isArray(r.types) ? r.types : []
  const status = STATUS_VALUES.find(s => s === r.status) ?? null
  const proteanType = ALL_TYPE_NAMES.find(t => t === r.proteanType) ?? null

  return {
    pokemonId: asIntOrNull(r.pokemonId, 0, Number.MAX_SAFE_INTEGER),
    pokemonName: asStr(r.pokemonName, ''),
    statNatures: coerceStatNatures(r.statNatures),
    sp: coerceSp(r.sp),
    abilityName: asStr(r.abilityName, 'なし'),
    itemName: asStrOrNull(r.itemName),
    isMega: asBool(r.isMega, false),
    canMega: asBool(r.canMega, false),
    availableMegas: [],
    megaKey: asStrOrNull(r.megaKey),
    isBlade: asBool(r.isBlade, false),
    isMighty: asBool(r.isMighty, false),
    ranks: coerceRanks(r.ranks),
    status,
    abilityActivated: asBool(r.abilityActivated, false),
    proteanType,
    proteanStab: asBool(r.proteanStab, true),
    moves: coerceMoves(r.moves),
    movePowers: coerceMovePowers(r.movePowers),
    supremeOverlordBoost: (asIntOrNull(r.supremeOverlordBoost, 0, 2) ?? 0) as 0 | 1 | 2,
    focusEnergyActive: asBool(r.focusEnergyActive, false),
    chargeActive: asBool(r.chargeActive, false),
    metronomeMultiplier: asNum(r.metronomeMultiplier, 1, 1, 2),
    grounded: asBool(r.grounded, false),
    baseStats: coerceStats(r.baseStats),
    types: rawTypes.filter((t): t is TypeName => ALL_TYPE_NAMES.some(v => v === t)),
    weight: asNum(r.weight, 0, 0, 100000),
    effectiveAbility: asStr(r.effectiveAbility, asStr(r.abilityName, 'なし')),
  }
}

// ---------------------------------------------------------------------------
// エクスポート／インポート用エンベロープ
// ---------------------------------------------------------------------------

const ENVELOPE_APP = 'pcma-builds'
const ENVELOPE_VERSION = 1

interface ExportedBuild {
  nickname: string
  snapshot: PokemonSnapshot
}

/** availableMegas は pokemonId から再解決できるため、文字列長を抑える目的で落とす */
function toExported(b: RegisteredBuild): ExportedBuild {
  return {
    nickname: b.nickname,
    snapshot: { ...clonePokemonSnapshot(b.snapshot), availableMegas: [] },
  }
}

function envelopeText(builds: RegisteredBuild[]): string {
  return JSON.stringify({
    app: ENVELOPE_APP,
    version: ENVELOPE_VERSION,
    builds: builds.map(toExported),
  })
}

function normalizeNickname(nickname: string, snapshot: PokemonSnapshot): string {
  return nickname.trim() || snapshot.pokemonName || '無名'
}

// ---------------------------------------------------------------------------
// ストア
// ---------------------------------------------------------------------------

interface BuildLibraryStore {
  builds: RegisteredBuild[]

  /**
   * ライブのポケモンストア状態（useAttackerStore.getState() 等）を個体として登録する。
   * 上限到達時・ポケモン未選択時は null を返して何もしない。新しい個体は先頭に積む。
   */
  registerBuild: (nickname: string, source: PokemonSnapshot) => RegisteredBuild | null
  renameBuild: (id: string, nickname: string) => void
  removeBuild: (id: string) => void
  /** 既存個体の中身だけ差し替える（nickname / createdAt は維持）。id が無ければ false */
  overwriteBuild: (id: string, source: PokemonSnapshot) => boolean
  /** エンベロープ文字列を読み込んで追記する。上限を超える分は切り捨てて追加数を返す */
  importBuilds: (text: string) => ImportResult
  exportAllText: () => string
  exportOneText: (id: string) => string | null
}

export const useBuildLibraryStore = create<BuildLibraryStore>()(
  persist(
    (set, get) => ({
      builds: [],

      registerBuild: (nickname, source) => {
        const { builds } = get()
        if (builds.length >= BUILD_LIBRARY_MAX) return null
        if (source.pokemonId == null) return null

        const snapshot = normalizeBuildSnapshot(source)
        const now = Date.now()
        const build: RegisteredBuild = {
          id: genId(),
          nickname: normalizeNickname(nickname, snapshot),
          snapshot,
          createdAt: now,
          updatedAt: now,
        }
        set({ builds: [build, ...builds] })
        return build
      },

      renameBuild: (id, nickname) => set(s => ({
        builds: s.builds.map(b =>
          b.id === id
            ? { ...b, nickname: nickname.trim() || b.nickname, updatedAt: Date.now() }
            : b
        ),
      })),

      removeBuild: (id) => set(s => ({ builds: s.builds.filter(b => b.id !== id) })),

      overwriteBuild: (id, source) => {
        const { builds } = get()
        if (!builds.some(b => b.id === id)) return false
        if (source.pokemonId == null) return false
        const snapshot = normalizeBuildSnapshot(source)
        set({
          builds: builds.map(b =>
            b.id === id ? { ...b, snapshot, updatedAt: Date.now() } : b
          ),
        })
        return true
      },

      importBuilds: (text) => {
        let parsed: unknown
        try {
          parsed = JSON.parse(text)
        } catch {
          return { ok: false, error: '形式が不正です' }
        }
        const env = asRecord(parsed)
        if (env.app !== ENVELOPE_APP) {
          return { ok: false, error: 'このデータは個体登録用ではありません' }
        }
        if (env.version !== ENVELOPE_VERSION) {
          return { ok: false, error: '対応していないバージョンです' }
        }
        if (!Array.isArray(env.builds)) {
          return { ok: false, error: '形式が不正です' }
        }

        const now = Date.now()
        const valid: RegisteredBuild[] = []
        for (const entry of env.builds) {
          const e = asRecord(entry)
          if (typeof e.nickname !== 'string' || !e.nickname.trim()) continue
          const rawSnapshot = e.snapshot
          if (typeof rawSnapshot !== 'object' || rawSnapshot === null || Array.isArray(rawSnapshot)) continue
          const snapshot = normalizeBuildSnapshot(coerceSnapshot(rawSnapshot))
          if (snapshot.pokemonId == null) continue
          valid.push({
            id: genId(),
            nickname: normalizeNickname(e.nickname, snapshot),
            snapshot,
            createdAt: now,
            updatedAt: now,
          })
        }

        if (valid.length === 0) {
          return { ok: false, error: '有効な個体が含まれていません' }
        }

        const capacity = BUILD_LIBRARY_MAX - get().builds.length
        if (capacity <= 0) {
          return { ok: false, error: `登録上限（${BUILD_LIBRARY_MAX}件）に達しています` }
        }
        const added = valid.slice(0, capacity)
        set(s => ({ builds: [...s.builds, ...added] }))
        return { ok: true, added: added.length }
      },

      exportAllText: () => envelopeText(get().builds),

      exportOneText: (id) => {
        const build = get().builds.find(b => b.id === id)
        return build ? envelopeText([build]) : null
      },
    }),
    {
      name: 'pcma-builds-v1',
      partialize: (s) => ({ builds: s.builds }),
    }
  )
)

// ---------------------------------------------------------------------------
// 読み込み
// ---------------------------------------------------------------------------

/**
 * 登録個体をパネルへ読み込む（攻守とも現在のパネルを上書き。
 * 攻撃側はアクティブタブ＝ライブストアなので、タブ保存時に自然に反映される）。
 * スナップショットが全データフィールドを覆うため reset 不要。
 * 読み込み時にも派生値をリポジトリから引き直すため、登録後のデータ更新に追従する。
 */
export function loadRegisteredBuild(
  side: 'attacker' | 'defender',
  build: RegisteredBuild,
): void {
  const snapshot = normalizeBuildSnapshot(build.snapshot)
  const store = side === 'defender' ? useDefenderStore : useAttackerStore
  store.setState(snapshot)
}
