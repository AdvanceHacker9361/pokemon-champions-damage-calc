/**
 * fix-pokemon-abilities.ts
 * pokemon.json の各ポケモンに欠落している特性を補完する
 * Showdown raw pokedex の "0"/"1"/"H" スロットと照合
 *
 * 実行: npx tsx scripts/fix-pokemon-abilities.ts
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(import.meta.dirname ?? __dirname, '..')

const rawPokedex: Record<string, {
  name: string
  abilities: Record<string, string>
}> = JSON.parse(readFileSync(resolve(ROOT, 'src/data/raw/pokedex-raw.json'), 'utf-8'))

const jaData: { abilities: Record<string, string> } =
  JSON.parse(readFileSync(resolve(ROOT, 'src/data/i18n/ja.json'), 'utf-8'))

const pokemon: Array<{
  id: number; name: string; nameEn: string; types: string[]
  baseStats: object; abilities: string[]; weight: number
}> = JSON.parse(readFileSync(resolve(ROOT, 'src/data/json/pokemon.json'), 'utf-8'))

// Champions 固有のデータ上書き対象（Showdown と異なるため自動補完しない）
// イッカネズミ・キョジオーン等
const SKIP_IDS = new Set([
  906,  // イッカネズミ (Tandemaus) - Champions固有特性
  968,  // キョジオーン (Clodsire) - Champions固有特性
])

let totalAdded = 0
let totalChanged = 0

const fixed = pokemon.map(p => {
  if (SKIP_IDS.has(p.id)) return p

  // Showdown ID
  const showdownId = p.nameEn.toLowerCase().replace(/[^a-z0-9]/g, '')
  const rawData = rawPokedex[showdownId]
  if (!rawData) return p

  // rawの全特性スロット("0","1","H") を日本語名に変換
  const rawAbilitySlots = Object.entries(rawData.abilities)
    .sort((a, b) => {
      // "0" → "1" → "H" の順
      const order = (k: string) => k === 'H' ? 99 : parseInt(k)
      return order(a[0]) - order(b[0])
    })

  const currentSet = new Set(p.abilities)
  const newAbilities = [...p.abilities]

  for (const [, enName] of rawAbilitySlots) {
    const enLower = enName.toLowerCase()
    const jaName = jaData.abilities[enLower]
    if (!jaName) continue

    if (!currentSet.has(jaName)) {
      // 既存にない特性を末尾に追加
      newAbilities.push(jaName)
      currentSet.add(jaName)
      console.log(`  [ADD] ${p.name} (${p.nameEn}): +${jaName} (${enName})`)
      totalAdded++
    }
  }

  if (newAbilities.length !== p.abilities.length) {
    totalChanged++
    return { ...p, abilities: newAbilities }
  }
  return p
})

writeFileSync(
  resolve(ROOT, 'src/data/json/pokemon.json'),
  JSON.stringify(fixed, null, 0)
    .replace(/\},\{/g, '},\n{')
    .replace('[{', '[\n{')
    .replace('}]', '}\n]'),
  'utf-8'
)

console.log(`\n=== 完了 ===`)
console.log(`更新ポケモン数: ${totalChanged}`)
console.log(`追加特性数: ${totalAdded}`)
