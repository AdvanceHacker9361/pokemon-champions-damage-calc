/**
 * add-missing-pokemon.ts
 * pokedex-raw.json に存在するが pokemon.json に未収録の全ポケモンを追加
 * PokeAPI から日本語名を取得し、能力を ja.json から翻訳して pokemon.json に追記
 *
 * 実行: npx tsx scripts/add-missing-pokemon.ts
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(import.meta.dirname ?? __dirname, '..')

const rawData   = JSON.parse(readFileSync(resolve(ROOT, 'src/data/raw/pokedex-raw.json'), 'utf-8'))
const pokeJson  = JSON.parse(readFileSync(resolve(ROOT, 'src/data/json/pokemon.json'), 'utf-8'))
const jaJson    = JSON.parse(readFileSync(resolve(ROOT, 'src/data/i18n/ja.json'), 'utf-8'))
const abJson    = JSON.parse(readFileSync(resolve(ROOT, 'src/data/json/abilities.json'), 'utf-8'))

// ──────────────────────────────────────────────
// 1. 欠落ポケモンを抽出
// ──────────────────────────────────────────────
const currentIds = new Set(pokeJson.map((p: any) => p.id))

const missing: Array<{ key: string; num: number; raw: any }> = []
for (const [key, val] of Object.entries(rawData) as [string, any][]) {
  if (!val.num || val.num <= 0 || val.num > 1025) continue
  if (val.isNonstandard === 'CAP' || val.isNonstandard === 'Future') continue
  if (val.tier === 'Illegal') continue
  if (val.baseSpecies && val.baseSpecies !== val.name) continue
  if (currentIds.has(val.num)) continue
  missing.push({ key, num: val.num, raw: val })
}
missing.sort((a, b) => a.num - b.num)
console.log(`欠落ポケモン数: ${missing.length}`)

// ──────────────────────────────────────────────
// 2. PokeAPI から日本語名を取得（バッチ）
// ──────────────────────────────────────────────
async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  return res.json()
}

function getJaName(names: Array<{ language: { name: string }; name: string }>): string | null {
  const ja = names.find(n => n.language.name === 'ja')
  const jaHrkt = names.find(n => n.language.name === 'ja-Hrkt')
  return (ja ?? jaHrkt)?.name ?? null
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// PokeAPI の species slug → Japanese name
async function fetchJaNameForId(dexNum: number): Promise<string | null> {
  try {
    const data = await fetchJson(`https://pokeapi.co/api/v2/pokemon-species/${dexNum}/`)
    if (!data) return null
    return getJaName(data.names)
  } catch {
    return null
  }
}

// ──────────────────────────────────────────────
// 3. 能力英語名 → 日本語名変換
// ──────────────────────────────────────────────
const abilityNameMap: Record<string, string> = {}
for (const [k, v] of Object.entries(jaJson.abilities as Record<string, string>)) {
  abilityNameMap[k] = v
}
const existingAbilityNames = new Set(abJson.map((a: any) => a.name))
const newAbilities: any[] = []

function translateAbility(enName: string): string {
  const key = enName.toLowerCase()
  if (abilityNameMap[key]) return abilityNameMap[key]
  // fallback: katakana transliteration is unknown, use English
  return enName
}

function buildAbilities(rawAbilities: Record<string, string>): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  // slot order: 0 → 1 → H
  for (const slot of ['0', '1', 'H']) {
    const enName = rawAbilities[slot]
    if (!enName) continue
    const jaName = translateAbility(enName)
    if (!seen.has(jaName)) {
      result.push(jaName)
      seen.add(jaName)
      // abilities.json に未収録なら追加キューへ
      if (!existingAbilityNames.has(jaName) && !newAbilities.find(a => a.name === jaName)) {
        newAbilities.push({
          name: jaName,
          nameEn: enName,
          calcTag: enName.toLowerCase().replace(/\s+/g, '-'),
        })
        existingAbilityNames.add(jaName)
      }
    }
  }
  return result
}

// ──────────────────────────────────────────────
// 4. タイプ英語 → 日本語変換
// ──────────────────────────────────────────────
const TYPE_MAP: Record<string, string> = {
  Normal: 'ノーマル', Fire: 'ほのお', Water: 'みず', Electric: 'でんき',
  Grass: 'くさ', Ice: 'こおり', Fighting: 'かくとう', Poison: 'どく',
  Ground: 'じめん', Flying: 'ひこう', Psychic: 'エスパー', Bug: 'むし',
  Rock: 'いわ', Ghost: 'ゴースト', Dragon: 'ドラゴン', Dark: 'あく',
  Steel: 'はがね', Fairy: 'フェアリー',
}

// ──────────────────────────────────────────────
// 5. メイン処理
// ──────────────────────────────────────────────
async function main() {
  const newEntries: any[] = []
  const BATCH = 10  // 並列リクエスト数

  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH)
    const results = await Promise.all(
      batch.map(async ({ key, num, raw }) => {
        const jaName = await fetchJaNameForId(num)
        if (!jaName) {
          console.warn(`  [WARN] 日本語名取得失敗: ${key} (#${num}) - 英語名で登録`)
        }
        const types = (raw.types as string[]).map((t: string) => TYPE_MAP[t] ?? t)
        const abilities = buildAbilities(raw.abilities ?? {})
        return {
          id: num,
          name: jaName ?? raw.name,
          nameEn: raw.name,
          types,
          baseStats: {
            hp:  raw.baseStats.hp,
            atk: raw.baseStats.atk,
            def: raw.baseStats.def,
            spa: raw.baseStats.spa,
            spd: raw.baseStats.spd,
            spe: raw.baseStats.spe,
          },
          abilities,
          weight: raw.weightkg ?? 0,
        }
      })
    )
    newEntries.push(...results)
    const done = Math.min(i + BATCH, missing.length)
    process.stdout.write(`\r  進捗: ${done}/${missing.length}`)
    if (i + BATCH < missing.length) await sleep(300)  // rate limit
  }
  console.log('')

  // pokemon.json に追記してIDソート
  const merged = [...pokeJson, ...newEntries]
  merged.sort((a: any, b: any) => a.id - b.id)
  writeFileSync(resolve(ROOT, 'src/data/json/pokemon.json'), JSON.stringify(merged, null, 2), 'utf-8')
  console.log(`pokemon.json 更新: ${merged.length}体 (+${newEntries.length})`)

  // abilities.json に未収録特性を追記
  if (newAbilities.length > 0) {
    const mergedAb = [...abJson, ...newAbilities]
    writeFileSync(resolve(ROOT, 'src/data/json/abilities.json'), JSON.stringify(mergedAb, null, 2), 'utf-8')
    console.log(`abilities.json 更新: ${mergedAb.length}件 (+${newAbilities.length}未翻訳特性)`)
  }

  // champions-roster.ts を更新
  let roster = readFileSync(resolve(ROOT, 'src/data/champions-roster.ts'), 'utf-8')
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const rosterMatches = roster.match(/'([a-z0-9]+)'/g) || []
  const rosterIdSet = new Set(rosterMatches.map(m => m.replace(/'/g, '')))

  const toAdd = missing
    .map(({ key }) => key)
    .filter(k => !rosterIdSet.has(k))

  if (toAdd.length > 0) {
    // CHAMPIONS_POKEMON_IDS 末尾の ']' の前に追加
    const insertPoint = roster.lastIndexOf('\n]')
    const additions = toAdd.map(k => `  '${k}',`).join('\n')
    roster = roster.slice(0, insertPoint) + '\n  // 追加分\n' + additions + roster.slice(insertPoint)
    writeFileSync(resolve(ROOT, 'src/data/champions-roster.ts'), roster, 'utf-8')
    console.log(`champions-roster.ts 更新: +${toAdd.length}件`)
  }

  console.log('完了')
}

main().catch(e => { console.error(e); process.exit(1) })
