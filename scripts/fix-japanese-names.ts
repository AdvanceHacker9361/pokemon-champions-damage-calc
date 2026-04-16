/**
 * fix-japanese-names.ts
 * PokeAPI から全技の正しい日本語名を取得して moves.json と ja.json を更新する
 *
 * 実行: npx tsx scripts/fix-japanese-names.ts
 *
 * 問題: 旧スクリプトが一部の技で誤った日本語名（英語音写カタカナ）を返した
 * 修正: PokeAPI の `ja` フィールドを使って正式な日本語名を再取得
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(import.meta.dirname ?? __dirname, '..')
const MOVES_JSON_PATH = resolve(ROOT, 'src/data/json/moves.json')
const JA_JSON_PATH = resolve(ROOT, 'src/data/i18n/ja.json')

interface MoveData {
  name: string
  nameEn: string
  type: string
  category: '物理' | '特殊' | '変化'
  power: number | null
  accuracy: number | null
  pp: 8 | 12 | 16 | 20
  priority: number
  flags: {
    contact: boolean; sound: boolean; bullet: boolean; pulse: boolean;
    punch: boolean; bite: boolean; slice: boolean; recoil?: boolean
  }
  special: string | null
  multiHit?: { type: string; count?: number } | null
}

interface PokeApiName { language: { name: string }; name: string }
interface PokeApiMove { id: number; name: string; names: PokeApiName[] }

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json()
}

function getJaName(names: PokeApiName[]): string | null {
  // Prefer 'ja' (kanji+kana official name), fallback to 'ja-hrkt' (kana only)
  const ja = names.find(n => n.language.name === 'ja')
  const jaHrkt = names.find(n => n.language.name === 'ja-hrkt')
  return (ja ?? jaHrkt)?.name ?? null
}

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

/**
 * Known slug overrides for moves where the PokeAPI slug differs from the expected form
 */
const SLUG_OVERRIDES: Record<string, string> = {
  'vise grip': 'vice-grip',  // PokeAPI uses historical "vice-grip" spelling
}

/**
 * Convert English move name to PokeAPI slug
 * e.g. "Poison Jab" → "poison-jab"
 *      "Extreme Speed" → "extreme-speed"
 *      "10,000,000 Volt Thunderbolt" → skip (special Z move)
 */
function toPokeApiSlug(nameEn: string): string {
  const lower = nameEn.toLowerCase()
  if (SLUG_OVERRIDES[lower]) return SLUG_OVERRIDES[lower]
  return lower
    .replace(/['']/g, '')    // remove apostrophes
    .replace(/[,]/g, '')     // remove commas
    .replace(/[.]/g, '')     // remove dots
    .replace(/\s+/g, '-')   // spaces to hyphens
    .replace(/-+/g, '-')    // collapse multiple hyphens
    .trim()
}

async function main(): Promise<void> {
  console.log('Loading existing data...')
  const moves: MoveData[] = JSON.parse(readFileSync(MOVES_JSON_PATH, 'utf-8'))
  const jaData: { moves: Record<string, string>; abilities: Record<string, string> } =
    JSON.parse(readFileSync(JA_JSON_PATH, 'utf-8'))

  console.log(`Total moves: ${moves.length}`)

  let fixed = 0
  let unchanged = 0
  let failed = 0
  const failedMoves: string[] = []
  const changedMoves: Array<{ nameEn: string; oldName: string; newName: string }> = []

  console.log('\nFetching Japanese names from PokeAPI...')

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i]
    const slug = toPokeApiSlug(move.nameEn)

    if (i > 0 && i % 50 === 0) {
      console.log(`  Progress: ${i}/${moves.length} (fixed: ${fixed}, unchanged: ${unchanged}, failed: ${failed})`)
    }

    try {
      const data = await fetchJson(`https://pokeapi.co/api/v2/move/${slug}/`) as PokeApiMove | null

      if (data?.names && data.names.length > 0) {
        const jaName = getJaName(data.names)
        if (jaName && jaName !== move.name) {
          changedMoves.push({ nameEn: move.nameEn, oldName: move.name, newName: jaName })
          moves[i] = { ...move, name: jaName }
          // Also update ja.json
          jaData.moves[move.nameEn.toLowerCase()] = jaName
          fixed++
        } else if (jaName) {
          unchanged++
          // Ensure ja.json is in sync even if name was already correct
          jaData.moves[move.nameEn.toLowerCase()] = jaName
        } else {
          // No Japanese name found - keep existing
          failed++
          failedMoves.push(move.nameEn)
        }
      } else {
        // 404 or no names - keep existing
        failed++
        failedMoves.push(move.nameEn)
      }
    } catch (e) {
      failed++
      failedMoves.push(move.nameEn)
    }

    await sleep(100)
  }

  console.log('\n=== Results ===')
  console.log(`Fixed: ${fixed}`)
  console.log(`Unchanged: ${unchanged}`)
  console.log(`Failed (kept original): ${failed}`)

  if (changedMoves.length > 0) {
    console.log('\n=== Changed moves ===')
    changedMoves.forEach(m => {
      console.log(`  ${m.nameEn}: "${m.oldName}" → "${m.newName}"`)
    })
  }

  if (failedMoves.length > 0) {
    console.log('\n=== Failed to fetch (kept original) ===')
    failedMoves.forEach(m => console.log(`  - ${m}`))
  }

  // Re-sort moves by Japanese name
  moves.sort((a, b) => a.name.localeCompare(b.name, 'ja'))

  // Write updated moves.json
  console.log('\nWriting moves.json...')
  // Compact format matching original
  const movesJson = '[\n' + moves.map(m => JSON.stringify(m)).join(',\n') + '\n]'
  writeFileSync(MOVES_JSON_PATH, movesJson, 'utf-8')
  console.log(`  Written ${moves.length} moves`)

  // Write updated ja.json
  console.log('Writing ja.json...')
  writeFileSync(JA_JSON_PATH, JSON.stringify(jaData, null, 2), 'utf-8')
  console.log(`  Written ${Object.keys(jaData.moves).length} move mappings`)

  console.log('\nDone!')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
