/**
 * fetch-showdown-data.ts
 * Pokemon Showdown の公開データを取得して src/data/raw/ に保存するスクリプト
 * 実行: npx tsx scripts/fetch-showdown-data.ts
 */

import { writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

const RAW_DIR = resolve(import.meta.dirname ?? __dirname, '../src/data/raw')

interface FetchTarget {
  url: string
  outFile: string
  isJs?: boolean
  jsVarName?: string
}

const TARGETS: FetchTarget[] = [
  { url: 'https://play.pokemonshowdown.com/data/pokedex.json', outFile: 'pokedex-raw.json' },
  { url: 'https://play.pokemonshowdown.com/data/moves.json', outFile: 'moves-raw.json' },
  { url: 'https://play.pokemonshowdown.com/data/learnsets.json', outFile: 'learnsets-raw.json' },
  { url: 'https://play.pokemonshowdown.com/data/abilities.js', outFile: 'abilities-raw.json', isJs: true, jsVarName: 'BattleAbilities' },
  { url: 'https://play.pokemonshowdown.com/data/items.js', outFile: 'items-raw.json', isJs: true, jsVarName: 'BattleItems' },
  { url: 'https://play.pokemonshowdown.com/data/typechart.js', outFile: 'typechart-raw.json', isJs: true, jsVarName: 'BattleTypeChart' },
]

function extractJsObject(src: string, varName: string): unknown {
  // "exports.BattleXxx = {...}" or "const BattleXxx = {...}" patterns
  const patterns = [
    new RegExp(`exports\\.${varName}\\s*=\\s*`, ''),
    new RegExp(`${varName}\\s*=\\s*`, ''),
  ]
  let start = -1
  for (const pat of patterns) {
    const m = pat.exec(src)
    if (m) {
      start = m.index + m[0].length
      break
    }
  }
  if (start === -1) {
    throw new Error(`Variable ${varName} not found in JS source`)
  }

  // Find matching brace
  let depth = 0
  let i = start
  let objStart = -1
  while (i < src.length) {
    if (src[i] === '{') {
      if (depth === 0) objStart = i
      depth++
    } else if (src[i] === '}') {
      depth--
      if (depth === 0) {
        const objStr = src.slice(objStart, i + 1)
        // Use Function to safely evaluate (no global pollution)
        const fn = new Function(`return (${objStr})`)
        return fn() as unknown
      }
    }
    i++
  }
  throw new Error(`Could not find closing brace for ${varName}`)
}

async function fetchAndSave(target: FetchTarget): Promise<void> {
  console.log(`Fetching ${target.url} ...`)
  const res = await fetch(target.url)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${target.url}`)
  }

  let data: unknown
  if (target.isJs && target.jsVarName) {
    const text = await res.text()
    data = extractJsObject(text, target.jsVarName)
  } else {
    data = await res.json()
  }

  const outPath = resolve(RAW_DIR, target.outFile)
  writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf-8')
  console.log(`  -> Saved to ${outPath}`)
}

async function main(): Promise<void> {
  mkdirSync(RAW_DIR, { recursive: true })
  console.log(`Output directory: ${RAW_DIR}\n`)

  for (const target of TARGETS) {
    try {
      await fetchAndSave(target)
    } catch (e) {
      console.error(`  [ERROR] ${target.url}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  console.log('\nDone!')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
