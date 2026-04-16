/**
 * build-final-data.ts
 * フィルタ済みデータ + 日本語名マッピングを統合して
 * src/data/json/{moves,abilities,items}.json を更新するスクリプト
 *
 * 実行: npx tsx scripts/build-final-data.ts
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(import.meta.dirname ?? __dirname, '..')
const FILTERED_DIR = resolve(ROOT, 'src/data/filtered')
const I18N_DIR = resolve(ROOT, 'src/data/i18n')
const JSON_DIR = resolve(ROOT, 'src/data/json')

// ────────────────────────────────────────────────
// 型定義
// ────────────────────────────────────────────────
type SpecialMoveTag =
  | 'foul-play' | 'body-press' | 'photon-geyser' | 'psyshock' | 'gyro-ball'
  | 'grass-knot' | 'low-kick' | 'hex' | 'facade' | 'stealth-rock'
  | 'freeze-dry' | 'weather-ball' | 'knock-off' | 'stored-power' | 'reversal'

type MultiHitData = { type: 'fixed'; count: number } | { type: 'variable' }

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
  special: SpecialMoveTag | null
  multiHit?: MultiHitData | null
}

// ────────────────────────────────────────────────
// 既存 moves.json の手動設定を優先するための照合
// ────────────────────────────────────────────────
interface ExistingMove {
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
  special: SpecialMoveTag | null
  multiHit?: MultiHitData | null
}

function main(): void {
  // ────────────────────────────────────────────────
  // データ読み込み
  // ────────────────────────────────────────────────
  console.log('Loading data...')
  const filteredMoves: MoveData[] = JSON.parse(readFileSync(resolve(FILTERED_DIR, 'moves-filtered.json'), 'utf-8'))
  const jaData: { moves: Record<string, string>; abilities: Record<string, string> } =
    JSON.parse(readFileSync(resolve(I18N_DIR, 'ja.json'), 'utf-8'))

  // 既存 moves.json（手動設定が含まれている）
  const existingMoves: ExistingMove[] = JSON.parse(readFileSync(resolve(JSON_DIR, 'moves.json'), 'utf-8'))

  // 既存移動データを英語名キーでインデックス化（手動設定の特殊フラグ等を保持するため）
  const existingByEn = new Map<string, ExistingMove>()
  for (const m of existingMoves) {
    existingByEn.set(m.nameEn.toLowerCase(), m)
  }

  // ────────────────────────────────────────────────
  // moves.json 更新
  // ────────────────────────────────────────────────
  console.log(`Processing ${filteredMoves.length} moves...`)

  const finalMoves: MoveData[] = []
  let existingKept = 0
  let newAdded = 0
  let jaNameApplied = 0

  for (const move of filteredMoves) {
    const enLower = move.nameEn.toLowerCase()
    const existing = existingByEn.get(enLower)

    let finalMove: MoveData

    if (existing) {
      // 既存データがある場合: 手動設定の special/flags/multiHit を優先保持
      // ただし日本語名は ja.json から更新
      finalMove = { ...existing }
      existingKept++
    } else {
      // 新規追加
      finalMove = { ...move }
      newAdded++
    }

    // 日本語名の適用
    const jaName = jaData.moves[enLower]
    if (jaName) {
      finalMove.name = jaName
      jaNameApplied++
    } else if (finalMove.name === finalMove.nameEn) {
      // 日本語名が見つからない場合は英語名をそのまま使用（警告）
      console.warn(`  [WARN] No Japanese name for: ${finalMove.nameEn}`)
    }

    finalMoves.push(finalMove)
  }

  // 既存にあってフィルタ済みにない技（連続技、特殊技など）も保持
  const filteredEnNames = new Set(filteredMoves.map(m => m.nameEn.toLowerCase()))
  for (const m of existingMoves) {
    if (!filteredEnNames.has(m.nameEn.toLowerCase())) {
      console.log(`  [INFO] Keeping existing move not in filtered set: ${m.nameEn}`)
      finalMoves.push(m)
    }
  }

  // 名前でソート（日本語名のないものは末尾）
  finalMoves.sort((a, b) => {
    // 日本語名順（Unicode順）
    return a.name.localeCompare(b.name, 'ja')
  })

  const movesPath = resolve(JSON_DIR, 'moves.json')
  writeFileSync(movesPath, JSON.stringify(finalMoves, null, 0).replace(/\},\{/g, '},\n{').replace('[{', '[\n{').replace('}]', '}\n]'), 'utf-8')
  console.log(`\nmoves.json updated:`)
  console.log(`  Total: ${finalMoves.length} moves`)
  console.log(`  Existing kept: ${existingKept}`)
  console.log(`  New added: ${newAdded}`)
  console.log(`  Japanese names applied: ${jaNameApplied}`)

  // ────────────────────────────────────────────────
  // abilities.json 更新
  // ────────────────────────────────────────────────
  console.log('\nProcessing abilities...')
  const filteredAbilities: Array<{ nameEn: string; name: string }> = JSON.parse(
    readFileSync(resolve(FILTERED_DIR, 'abilities-filtered.json'), 'utf-8')
  )

  const existingAbilities: Array<{ name: string; nameEn: string; calcTag: string }> = JSON.parse(
    readFileSync(resolve(JSON_DIR, 'abilities.json'), 'utf-8')
  )
  const existingAbilityByEn = new Map<string, typeof existingAbilities[0]>()
  for (const a of existingAbilities) {
    existingAbilityByEn.set(a.nameEn.toLowerCase(), a)
  }

  // 既存の abilities.json を基に、新しい特性を追加
  // calcTag は手動設定が必要なので、既存データを優先
  const finalAbilities: Array<{ name: string; nameEn: string; calcTag: string }> = []
  const abilityEnSet = new Set<string>()

  // 既存データを全て保持
  for (const a of existingAbilities) {
    finalAbilities.push(a)
    abilityEnSet.add(a.nameEn.toLowerCase())
  }

  // 新規特性を追加（calcTag は 'none' で初期化）
  let newAbilitiesAdded = 0
  for (const a of filteredAbilities) {
    const enLower = a.nameEn.toLowerCase()
    if (!abilityEnSet.has(enLower)) {
      const jaName = jaData.abilities[enLower] ?? a.nameEn
      finalAbilities.push({
        name: jaName,
        nameEn: a.nameEn,
        calcTag: 'none',
      })
      newAbilitiesAdded++
    } else {
      // 既存特性の日本語名を更新（jaDataから取得できた場合）
      const existing = existingAbilityByEn.get(enLower)
      if (existing) {
        const jaName = jaData.abilities[enLower]
        if (jaName && existing.name !== jaName) {
          // 既存の日本語名と異なる場合は更新しない（手動設定を保持）
          // console.log(`  [INFO] Keeping existing ja name: ${existing.name} (new: ${jaName})`)
        }
      }
    }
  }

  const abilitiesPath = resolve(JSON_DIR, 'abilities.json')
  writeFileSync(abilitiesPath, JSON.stringify(finalAbilities, null, 2), 'utf-8')
  console.log(`abilities.json updated: ${finalAbilities.length} abilities (${newAbilitiesAdded} new)`)

  // ────────────────────────────────────────────────
  // items.json は既存のものをそのまま保持（手動管理）
  // ────────────────────────────────────────────────
  console.log('\nitems.json: Keeping existing (manually managed)')
  console.log('\nDone!')
}

main()
