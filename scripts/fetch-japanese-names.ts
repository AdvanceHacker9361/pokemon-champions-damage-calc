/**
 * fetch-japanese-names.ts
 * PokeAPI から技・特性の日本語名を一括取得して src/data/i18n/ja.json に保存
 * 実行: npx tsx scripts/fetch-japanese-names.ts
 *
 * 戦略:
 * 1. 既存 moves.json / abilities.json の日本語名マッピングを優先使用
 * 2. PokeAPI の list endpoint で全件の slug を取得（ページネーション）
 * 3. 各 slug の詳細を取得して日本語名を抽出
 * 4. Showdown 英語名 → 日本語名のマッピングを構築
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(import.meta.dirname ?? __dirname, '..')
const FILTERED_DIR = resolve(ROOT, 'src/data/filtered')
const I18N_DIR = resolve(ROOT, 'src/data/i18n')

interface PokeApiName { language: { name: string }; name: string }
interface PokeApiMove { id: number; name: string; names: PokeApiName[] }
interface PokeApiAbility { id: number; name: string; names: PokeApiName[] }
interface PokeApiListResult { name: string; url: string }
interface PokeApiList { count: number; results: PokeApiListResult[] }

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json()
}

function getJaName(names: PokeApiName[]): string | null {
  // Prefer 'ja' (kanji+kana), fallback to 'ja-Hrkt' (kana only)
  const ja = names.find(n => n.language.name === 'ja')
  const jaHrkt = names.find(n => n.language.name === 'ja-Hrkt')
  return (ja ?? jaHrkt)?.name ?? null
}

async function fetchAllFromList(endpoint: string): Promise<PokeApiListResult[]> {
  const firstPage = await fetchJson(`${endpoint}?limit=1`) as PokeApiList
  const total = firstPage.count
  const allPage = await fetchJson(`${endpoint}?limit=${total}`) as PokeApiList
  return allPage.results
}

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

async function main(): Promise<void> {
  mkdirSync(I18N_DIR, { recursive: true })

  // ────────────────────────────────────────────────
  // 1. 既存 moves.json から日本語名マッピングを構築
  // ────────────────────────────────────────────────
  const existingMoves: Array<{ name: string; nameEn: string }> = JSON.parse(
    readFileSync(resolve(ROOT, 'src/data/json/moves.json'), 'utf-8')
  )
  const existingMoveByEn = new Map<string, string>() // English name (lowercase, nospace) → ja name
  for (const m of existingMoves) {
    existingMoveByEn.set(m.nameEn.toLowerCase(), m.name)
  }
  console.log(`Loaded ${existingMoveByEn.size} moves from existing moves.json`)

  // 2. 既存 abilities.json から日本語名マッピングを構築
  const existingAbilities: Array<{ name: string; nameEn: string }> = JSON.parse(
    readFileSync(resolve(ROOT, 'src/data/json/abilities.json'), 'utf-8')
  )
  const existingAbilityByEn = new Map<string, string>()
  for (const a of existingAbilities) {
    existingAbilityByEn.set(a.nameEn.toLowerCase(), a.name)
  }
  console.log(`Loaded ${existingAbilityByEn.size} abilities from existing abilities.json`)

  // ────────────────────────────────────────────────
  // 3. フィルタ済みデータ読み込み
  // ────────────────────────────────────────────────
  const filteredMoves: Array<{ name: string; nameEn: string }> = JSON.parse(
    readFileSync(resolve(FILTERED_DIR, 'moves-filtered.json'), 'utf-8')
  )
  const filteredAbilities: Array<{ name: string; nameEn: string }> = JSON.parse(
    readFileSync(resolve(FILTERED_DIR, 'abilities-filtered.json'), 'utf-8')
  )

  // 必要な英語名セット
  const neededMoveEnNames = new Set(filteredMoves.map(m => m.nameEn.toLowerCase()))
  const neededAbilityEnNames = new Set(filteredAbilities.map(a => a.nameEn.toLowerCase()))

  // ────────────────────────────────────────────────
  // 4. 既存マッピングで解決できるものを先に処理
  // ────────────────────────────────────────────────
  const moveJaMap: Record<string, string> = {}
  const abilityJaMap: Record<string, string> = {}

  const movesNeedingFetch: string[] = []
  for (const enNameLower of neededMoveEnNames) {
    const jaName = existingMoveByEn.get(enNameLower)
    if (jaName) {
      moveJaMap[enNameLower] = jaName
    } else {
      movesNeedingFetch.push(enNameLower)
    }
  }

  const abilitiesNeedingFetch: string[] = []
  for (const enNameLower of neededAbilityEnNames) {
    const jaName = existingAbilityByEn.get(enNameLower)
    if (jaName) {
      abilityJaMap[enNameLower] = jaName
    } else {
      abilitiesNeedingFetch.push(enNameLower)
    }
  }

  console.log(`\nMoves: ${Object.keys(moveJaMap).length} from existing, ${movesNeedingFetch.length} need API fetch`)
  console.log(`Abilities: ${Object.keys(abilityJaMap).length} from existing, ${abilitiesNeedingFetch.length} need API fetch`)

  // ────────────────────────────────────────────────
  // 5. PokeAPI から全技リストを取得して日本語名マッピングを構築
  // ────────────────────────────────────────────────
  if (movesNeedingFetch.length > 0) {
    console.log('\nFetching all move list from PokeAPI...')
    const moveList = await fetchAllFromList('https://pokeapi.co/api/v2/move')
    console.log(`  Got ${moveList.length} moves from PokeAPI`)

    // slug → English name の逆引き用
    // PokeAPI slug は hyphen-separated lowercase
    // Showdown の英語名（スペース区切り）を lowercase に変換して照合
    const slugToEnName = new Map<string, string>()
    for (const item of moveList) {
      slugToEnName.set(item.name, item.name) // slug → slug (will be resolved later)
    }

    // 未解決の技をPokeAPIから取得
    // 方針: filteredMovesの英語名をslugに変換して照合
    const enNameToSlug = new Map<string, string>()
    for (const item of moveList) {
      // PokeAPI slug: "acid-spray" → "acid spray" (replace hyphens)
      const slugAsName = item.name.replace(/-/g, ' ')
      enNameToSlug.set(slugAsName, item.name)
    }

    console.log(`  Fetching details for ${movesNeedingFetch.length} moves...`)
    let fetched = 0
    let failed = 0

    for (const enNameLower of movesNeedingFetch) {
      // Try to find the PokeAPI slug
      const slug = enNameToSlug.get(enNameLower)
      if (!slug) {
        failed++
        continue
      }

      try {
        const data = await fetchJson(`https://pokeapi.co/api/v2/move/${slug}/`) as PokeApiMove | null
        if (data?.names) {
          const jaName = getJaName(data.names)
          if (jaName) {
            moveJaMap[enNameLower] = jaName
            fetched++
          } else {
            failed++
          }
        } else {
          failed++
        }
      } catch {
        failed++
      }

      await sleep(80) // rate limit

      if ((fetched + failed) % 20 === 0) {
        process.stdout.write(`  Progress: ${fetched} success, ${failed} failed...\r`)
      }
    }
    console.log(`\n  Moves: ${fetched} fetched, ${failed} failed`)
  }

  // ────────────────────────────────────────────────
  // 6. PokeAPI から全特性リストを取得
  // ────────────────────────────────────────────────
  if (abilitiesNeedingFetch.length > 0) {
    console.log('\nFetching all ability list from PokeAPI...')
    const abilityList = await fetchAllFromList('https://pokeapi.co/api/v2/ability')
    console.log(`  Got ${abilityList.length} abilities from PokeAPI`)

    const abilityEnNameToSlug = new Map<string, string>()
    for (const item of abilityList) {
      const slugAsName = item.name.replace(/-/g, ' ')
      abilityEnNameToSlug.set(slugAsName, item.name)
    }

    console.log(`  Fetching details for ${abilitiesNeedingFetch.length} abilities...`)
    let fetched = 0
    let failed = 0

    for (const enNameLower of abilitiesNeedingFetch) {
      const slug = abilityEnNameToSlug.get(enNameLower)
      if (!slug) {
        failed++
        continue
      }

      try {
        const data = await fetchJson(`https://pokeapi.co/api/v2/ability/${slug}/`) as PokeApiAbility | null
        if (data?.names) {
          const jaName = getJaName(data.names)
          if (jaName) {
            abilityJaMap[enNameLower] = jaName
            fetched++
          } else {
            failed++
          }
        } else {
          failed++
        }
      } catch {
        failed++
      }

      await sleep(80)
    }
    console.log(`  Abilities: ${fetched} fetched, ${failed} failed`)
  }

  // ────────────────────────────────────────────────
  // 7. 結果を ja.json に保存
  //    キー: 英語名 lowercase (スペース区切り)
  // ────────────────────────────────────────────────
  const jaData = {
    moves: moveJaMap,
    abilities: abilityJaMap,
  }

  const outPath = resolve(I18N_DIR, 'ja.json')
  writeFileSync(outPath, JSON.stringify(jaData, null, 2), 'utf-8')
  console.log(`\nSaved to ${outPath}`)
  console.log(`  Move mappings: ${Object.keys(moveJaMap).length} / ${neededMoveEnNames.size}`)
  console.log(`  Ability mappings: ${Object.keys(abilityJaMap).length} / ${neededAbilityEnNames.size}`)

  // 未マッピング報告
  const unmappedMoves = filteredMoves.filter(m => !moveJaMap[m.nameEn.toLowerCase()])
  if (unmappedMoves.length > 0) {
    console.log(`\n[WARN] ${unmappedMoves.length} moves without Japanese name:`)
    unmappedMoves.slice(0, 20).forEach(m => console.log(`  - ${m.nameEn}`))
    if (unmappedMoves.length > 20) console.log(`  ... and ${unmappedMoves.length - 20} more`)
  }

  const unmappedAbilities = filteredAbilities.filter(a => !abilityJaMap[a.nameEn.toLowerCase()])
  if (unmappedAbilities.length > 0) {
    console.log(`\n[WARN] ${unmappedAbilities.length} abilities without Japanese name:`)
    unmappedAbilities.forEach(a => console.log(`  - ${a.nameEn}`))
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
