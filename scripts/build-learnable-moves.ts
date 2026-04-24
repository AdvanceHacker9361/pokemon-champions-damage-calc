/**
 * pkdx の learnset データから習得可能技のマッピングを生成する。
 *
 * 入力: scripts/pkdx-learnset.json (pkdx v0.4.12 の pkdx_patch/004_champions_learnset/data.json)
 * 出力: src/data/json/learnableMoves.json
 *
 * データ形式:
 *   { [pokemonId: number]: string[] }
 *
 * マッピング規則:
 *   - base form (id < 10000) → globalNo = zero-padded id, region = ''
 *   - regional form (id >= 10000) → base_id = id - 10000, region = 'アローラのすがた' 等
 *     ただし Rotom / Castform 等の "alternate form" は base と同じ learnset を使う
 *   - 技はこのプロジェクトの moves.json に存在するもののみ残す
 *   - 技データがない / 空のポケモンは結果に含めず、UI は "フィルタなし" にフォールバックする
 */
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

interface PkdxLearnsetEntry {
  id: string
  globalNo: string
  form: string
  region: string
  mega_evolution: string
  gigantamax: string
  pokedex: string
  conditions: string
  waza: string
}

interface ProjectPokemon {
  id: number
  name: string
  nameEn: string
}

interface ProjectMove {
  name: string
}

const ROOT = resolve(__dirname, '..')
const LEARNSET_PATH = resolve(ROOT, 'scripts/pkdx-learnset.json')
const POKEMON_PATH = resolve(ROOT, 'src/data/json/pokemon.json')
const MOVES_PATH = resolve(ROOT, 'src/data/json/moves.json')
const OUT_PATH = resolve(ROOT, 'src/data/json/learnableMoves.json')

const learnset: PkdxLearnsetEntry[] = JSON.parse(readFileSync(LEARNSET_PATH, 'utf8'))
const pokemon: ProjectPokemon[] = JSON.parse(readFileSync(POKEMON_PATH, 'utf8'))
const moves: ProjectMove[] = JSON.parse(readFileSync(MOVES_PATH, 'utf8'))

const validMoveNames = new Set(moves.map(m => m.name))

// (globalNo, region) -> Set<move>
const pkdxMap = new Map<string, Set<string>>()
for (const e of learnset) {
  const key = `${e.globalNo}|${e.region}`
  if (!pkdxMap.has(key)) pkdxMap.set(key, new Set())
  pkdxMap.get(key)!.add(e.waza)
}

function regionFromName(name: string): string {
  if (name.startsWith('アローラ')) return 'アローラのすがた'
  if (name.startsWith('ガラル')) return 'ガラルのすがた'
  if (name.startsWith('ヒスイ')) return 'ヒスイのすがた'
  if (name.startsWith('パルデア')) return 'パルデアのすがた'
  return ''
}

function resolveLearnset(p: ProjectPokemon): Set<string> | null {
  let baseId = p.id
  let region = ''
  if (p.id >= 10000) {
    // name から region を推定
    region = regionFromName(p.name)
    // 複数 form Pokemon は (id % 10000) が 0 に近い基本 ID を探る
    // 例) Rotom forms: 10479 → 479, 20479 → 479, … すべて 479 に集約
    //     Castform forms: 10351 → 351, 20351 → 351 …
    if (region === '') {
      // alternate form: base id は末尾 4 桁 (ただし base id が 10000 以下になるまで mod)
      let candidate = p.id % 10000
      while (candidate >= 10000) candidate = candidate % 10000
      baseId = candidate
    } else {
      baseId = p.id - 10000
    }
  }
  const key = `${String(baseId).padStart(4, '0')}|${region}`
  const set = pkdxMap.get(key)
  if (!set || set.size === 0) return null
  return set
}

const result: Record<string, string[]> = {}
let matched = 0
let empty = 0
let partial = 0
for (const p of pokemon) {
  const learned = resolveLearnset(p)
  if (!learned) {
    empty++
    continue
  }
  const filtered = [...learned].filter(m => validMoveNames.has(m)).sort()
  if (filtered.length === 0) {
    empty++
    continue
  }
  if (filtered.length < learned.size) partial++
  matched++
  result[String(p.id)] = filtered
}

writeFileSync(OUT_PATH, JSON.stringify(result, null, 2) + '\n', 'utf8')

console.log(`書き込み完了: ${OUT_PATH}`)
console.log(`  マッチ: ${matched} / 全 ${pokemon.length}`)
console.log(`  学習技がない/マップ外: ${empty}`)
console.log(`  一部の技が project 側に無い (fallback): ${partial}`)
