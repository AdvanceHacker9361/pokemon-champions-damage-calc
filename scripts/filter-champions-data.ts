/**
 * filter-champions-data.ts
 * Showdown rawデータから Champions 内定ポケモン用データを抽出・変換するスクリプト
 * 実行: npx tsx scripts/filter-champions-data.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(import.meta.dirname ?? __dirname, '..')
const RAW_DIR = resolve(ROOT, 'src/data/raw')
const FILTERED_DIR = resolve(ROOT, 'src/data/filtered')

// ────────────────────────────────────────────────
// Showdown型定義
// ────────────────────────────────────────────────
interface ShowdownMove {
  num?: number
  name: string
  type: string
  category: 'Physical' | 'Special' | 'Status'
  basePower?: number
  accuracy?: number | true
  pp?: number
  priority?: number
  flags?: Record<string, number | string>
  multihit?: number | [number, number]
  secondary?: unknown
  isNonstandard?: string
  isZ?: string
  isMax?: string
  zMove?: unknown
  maxMove?: unknown
  target?: string
  desc?: string
}

interface ShowdownPokemon {
  num: number
  name: string
  types: string[]
  baseStats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number }
  abilities: Record<string, string>
  weightkg?: number
  isNonstandard?: string
}

interface ShowdownAbility {
  name: string
  rating?: number
  num?: number
  desc?: string
  shortDesc?: string
}

interface ShowdownItem {
  name: string
  num?: number
  gen?: number
  isNonstandard?: string
  desc?: string
  shortDesc?: string
}

interface ShowdownLearnset {
  learnset?: Record<string, string[]>
  eventData?: unknown
}

// ────────────────────────────────────────────────
// Champions 内定ポケモンの Showdown ID リスト
// pokemon.json + pokemon-mega.json から抽出した全ポケモンを列挙
// ────────────────────────────────────────────────
const CHAMPIONS_BASE_IDS = new Set([
  // Gen 1
  'bulbasaur', 'ivysaur', 'venusaur',
  'charmander', 'charmeleon', 'charizard',
  'squirtle', 'wartortle', 'blastoise',
  'pikachu', 'raichu',
  'meowth', 'persian',
  'psyduck', 'golduck',
  'arcanine',
  'alakazam',
  'machamp',
  'slowbro',
  'gengar',
  'exeggutor',
  'marowak',
  'hitmonchan',
  'lickitung',
  'rhydon',
  'chansey',
  'kangaskhan',
  'staryu', 'starmie',
  'pinsir',
  'tauros',
  'gyarados',
  'lapras',
  'snorlax',
  'dragonite',
  'mewtwo',
  // Gen 2
  'chikorita', 'meganium',
  'cyndaquil', 'typhlosion',
  'totodile', 'feraligatr',
  'togepi', 'togetic',
  'ampharos',
  'bellossom',
  'azumarill',
  'sudowoodo',
  'politoed',
  'espeon', 'umbreon',
  'wobbuffet',
  'steelix',
  'granbull',
  'scizor',
  'heracross',
  'ursaring',
  'magcargo',
  'piloswine',
  'houndoom',
  'kingdra',
  'donphan',
  'stantler',
  'hitmontop',
  'raikou', 'entei', 'suicune',
  'tyranitar',
  'lugia', 'hooh',
  // Gen 3
  'sceptile', 'blaziken', 'swampert',
  'mightyena',
  'ludicolo',
  'gardevoir',
  'breloom',
  'slaking',
  'exploud',
  'sableye', 'mawile',
  'aggron',
  'medicham',
  'manectric',
  'sharpedo',
  'camerupt',
  'flygon',
  'altaria',
  'zangoose', 'seviper',
  'crawdaunt',
  'claydol',
  'milotic',
  'banette',
  'tropius',
  'absol',
  'glalie',
  'salamence',
  'metagross',
  'latias', 'latios',
  'kyogre', 'groudon', 'rayquaza',
  // Gen 4
  'piplup', 'empoleon',
  'staraptor',
  'bibarel',
  'luxray',
  'roserade',
  'rampardos',
  'bastiodon',
  'vespiquen',
  'floatzel',
  'ambipom',
  'lopunny',
  'mismagius',
  'honchkrow',
  'purugly',
  'bronzong',
  'chatot',
  'spiritomb',
  'garchomp',
  'lucario',
  'hippowdon',
  'drapion',
  'toxicroak',
  'abomasnow',
  'weavile',
  'magnezone',
  'rhyperior',
  'electivire',
  'magmortar',
  'togekiss',
  'glaceon',
  'mamoswine',
  'gallade',
  'dusknoir',
  'froslass',
  'palkia',
  'giratina',
  'darkrai',
  'shaymin',
  // Gen 5
  'serperior', 'emboar', 'samurott',
  'stoutland',
  'liepard',
  'excadrill',
  'conkeldurr',
  'scolipede',
  'lilligant',
  'darmanitan',
  'scrafty',
  'cofagrigus',
  'carracosta',
  'archeops',
  'zoroark',
  'gothitelle',
  'reuniclus',
  'swanna',
  'emolga',
  'amoonguss',
  'galvantula',
  'ferrothorn',
  'chandelure',
  'haxorus',
  'beartic',
  'mienshao',
  'druddigon',
  'golurk',
  'bisharp',
  'braviary',
  'mandibuzz',
  'hydreigon',
  'volcarona',
  'cobalion', 'terrakion', 'virizion',
  'reshiram', 'zekrom',
  'landorus',
  'kyurem',
  // Gen 6
  'chesnaught', 'delphox', 'greninja',
  'diggersby',
  'talonflame',
  'pyroar',
  'florges',
  'meowstic',
  'aegislash',
  'malamar',
  'heliolisk',
  'sylveon',
  'goodra',
  'trevenant',
  'noivern',
  'xerneas', 'yveltal', 'zygarde',
  // Gen 7
  'decidueye', 'incineroar', 'primarina',
  'vikavolt',
  'ribombee',
  'toxapex',
  'araquanid',
  'lurantis',
  'salazzle',
  'bewear',
  'tsareena',
  'golisopod',
  'silvally',
  'turtonator',
  'mimikyu',
  'lunala',
  'pheromosa',
  'necrozma',
  // Gen 8
  'zacian', 'zamazenta',
  'kubfu',
  // Gen 9
  'tandemaus',
  'clodsire',
  'ironvaliant',
])

// ────────────────────────────────────────────────
// タイプ名日本語マッピング（Showdown英語 → 日本語）
// ────────────────────────────────────────────────
const TYPE_MAP: Record<string, string> = {
  Normal: 'ノーマル',
  Fire: 'ほのお',
  Water: 'みず',
  Electric: 'でんき',
  Grass: 'くさ',
  Ice: 'こおり',
  Fighting: 'かくとう',
  Poison: 'どく',
  Ground: 'じめん',
  Flying: 'ひこう',
  Psychic: 'エスパー',
  Bug: 'むし',
  Rock: 'いわ',
  Ghost: 'ゴースト',
  Dragon: 'ドラゴン',
  Dark: 'あく',
  Steel: 'はがね',
  Fairy: 'フェアリー',
}

// ────────────────────────────────────────────────
// PP変換: Showdown PP → Champions 4段階 (8/12/16/20)
// Champions PPは 8/12/16/20 の4段階のみ
// 標準PP: 5→8, 8→8, 10→16, 15→16, 20→20, 25→20,  30→20, etc
// ────────────────────────────────────────────────
function convertPP(pp: number): 8 | 12 | 16 | 20 {
  if (pp <= 8) return 8
  if (pp <= 12) return 12
  if (pp <= 16) return 16
  return 20
}

// ────────────────────────────────────────────────
// Showdown フラグ → MoveFlags 変換
// ────────────────────────────────────────────────
function convertFlags(flags: Record<string, number | string> | undefined): {
  contact: boolean; sound: boolean; bullet: boolean; pulse: boolean;
  punch: boolean; bite: boolean; slice: boolean; recoil?: boolean
} {
  const f = flags ?? {}
  return {
    contact: !!f.contact,
    sound: !!f.sound,
    bullet: !!f.bullet,
    pulse: !!f.pulse,
    punch: !!f.punch,
    bite: !!f.bite,
    slice: !!f.slicing,
    ...(f.recharge ? {} : {}),
  }
}

// ────────────────────────────────────────────────
// 技の special タグ判定
// ────────────────────────────────────────────────
type SpecialMoveTag =
  | 'foul-play' | 'body-press' | 'photon-geyser' | 'psyshock' | 'gyro-ball'
  | 'grass-knot' | 'low-kick' | 'hex' | 'facade' | 'stealth-rock'
  | 'freeze-dry' | 'weather-ball' | 'knock-off' | 'stored-power' | 'reversal'

const SPECIAL_MOVE_MAP: Record<string, SpecialMoveTag> = {
  foulplay: 'foul-play',
  bodypress: 'body-press',
  photongeyser: 'photon-geyser',
  psyshock: 'psyshock',
  psystrike: 'psyshock',
  gyroball: 'gyro-ball',
  grassknot: 'grass-knot',
  lowkick: 'low-kick',
  heavyslam: 'low-kick',
  hex: 'hex',
  infernalparade: 'hex',
  facade: 'facade',
  stealthrock: 'stealth-rock',
  freezedry: 'freeze-dry',
  weatherball: 'weather-ball',
  knockoff: 'knock-off',
  storedpower: 'stored-power',
  reversal: 'reversal',
  finalgambit: 'reversal',
}

function getSpecialTag(moveId: string): SpecialMoveTag | null {
  return SPECIAL_MOVE_MAP[moveId] ?? null
}

// ────────────────────────────────────────────────
// multiHit 変換
// ────────────────────────────────────────────────
type MultiHitData = { type: 'fixed'; count: number } | { type: 'variable' }

function convertMultiHit(multihit: number | [number, number] | undefined): MultiHitData | null {
  if (multihit === undefined) return null
  if (typeof multihit === 'number') {
    return { type: 'fixed', count: multihit }
  }
  // Array means variable hits
  return { type: 'variable' }
}

// ────────────────────────────────────────────────
// スキップする技（Z技、Max技、非標準）
// ────────────────────────────────────────────────
function shouldSkipMove(moveId: string, move: ShowdownMove): boolean {
  if (move.isNonstandard && move.isNonstandard !== 'Unobtainable') return true
  if (move.isZ) return true
  if (move.isMax) return true
  // Z moves have specific keywords
  if (moveId.includes('zunmittableforze') || moveId.includes('zcrystal')) return true
  return false
}

// ────────────────────────────────────────────────
// 技カテゴリ日本語変換
// ────────────────────────────────────────────────
function convertCategory(cat: string): '物理' | '特殊' | '変化' {
  if (cat === 'Physical') return '物理'
  if (cat === 'Special') return '特殊'
  return '変化'
}

// ────────────────────────────────────────────────
// 日本語技名マッピング（既存 moves.json から抽出）
// ────────────────────────────────────────────────
function buildExistingMoveNameMap(existingMoves: Array<{ name: string; nameEn: string }>): Map<string, string> {
  const map = new Map<string, string>()
  for (const m of existingMoves) {
    // nameEn を Showdown ID 形式 (lowercase, no spaces/hyphens) に変換
    const sid = m.nameEn.toLowerCase().replace(/[^a-z0-9]/g, '')
    map.set(sid, m.name)
  }
  return map
}

// ────────────────────────────────────────────────
// メイン処理
// ────────────────────────────────────────────────
function main(): void {
  mkdirSync(FILTERED_DIR, { recursive: true })

  // rawデータ読み込み
  console.log('Loading raw data...')
  const rawMoves: Record<string, ShowdownMove> = JSON.parse(readFileSync(resolve(RAW_DIR, 'moves-raw.json'), 'utf-8'))
  const rawPokedex: Record<string, ShowdownPokemon> = JSON.parse(readFileSync(resolve(RAW_DIR, 'pokedex-raw.json'), 'utf-8'))
  const rawLearnsets: Record<string, ShowdownLearnset> = JSON.parse(readFileSync(resolve(RAW_DIR, 'learnsets-raw.json'), 'utf-8'))
  const rawAbilities: Record<string, ShowdownAbility> = JSON.parse(readFileSync(resolve(RAW_DIR, 'abilities-raw.json'), 'utf-8'))
  const rawItems: Record<string, ShowdownItem> = JSON.parse(readFileSync(resolve(RAW_DIR, 'items-raw.json'), 'utf-8'))

  // 既存 moves.json から日本語名マッピングを構築
  const existingMoves: Array<{ name: string; nameEn: string }> = JSON.parse(
    readFileSync(resolve(ROOT, 'src/data/json/moves.json'), 'utf-8')
  )
  const existingMoveNameMap = buildExistingMoveNameMap(existingMoves)

  // ────────────────────────────────────────────────
  // Step 1: 内定ポケモンが覚える全技 ID を収集
  // ────────────────────────────────────────────────
  console.log('Collecting move IDs for Champions roster...')
  const championsMoveIds = new Set<string>()

  for (const pokemonId of CHAMPIONS_BASE_IDS) {
    const learnset = rawLearnsets[pokemonId]
    if (!learnset?.learnset) {
      console.warn(`  [WARN] No learnset found for: ${pokemonId}`)
      continue
    }
    for (const moveId of Object.keys(learnset.learnset)) {
      championsMoveIds.add(moveId)
    }
  }

  console.log(`  Collected ${championsMoveIds.size} unique move IDs`)

  // ────────────────────────────────────────────────
  // Step 2: 技データをフィルタ・変換
  // ────────────────────────────────────────────────
  console.log('Converting move data...')

  interface OutputMove {
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

  const outputMoves: OutputMove[] = []
  const skippedMoves: string[] = []
  const unknownTypeMoves: string[] = []

  for (const moveId of championsMoveIds) {
    const move = rawMoves[moveId]
    if (!move) {
      skippedMoves.push(moveId)
      continue
    }
    if (shouldSkipMove(moveId, move)) {
      continue
    }
    const typeJa = TYPE_MAP[move.type]
    if (!typeJa) {
      unknownTypeMoves.push(`${moveId} (type: ${move.type})`)
      continue
    }

    const jaName = existingMoveNameMap.get(moveId) ?? null
    const flags = convertFlags(move.flags)
    // Check for recoil from description
    const hasRecoil = move.flags?.['recharge'] === undefined &&
      (move.flags as Record<string, unknown>)?.['recoil'] !== undefined

    if (hasRecoil) {
      flags.recoil = true
    }

    const outputMove: OutputMove = {
      name: jaName ?? move.name,  // 日本語名があれば使用、なければ英語名
      nameEn: move.name,
      type: typeJa,
      category: convertCategory(move.category),
      power: move.basePower && move.basePower > 0 ? move.basePower : null,
      accuracy: typeof move.accuracy === 'number' ? move.accuracy : null,
      pp: convertPP(move.pp ?? 10),
      priority: move.priority ?? 0,
      flags,
      special: getSpecialTag(moveId),
      multiHit: convertMultiHit(move.multihit),
    }

    outputMoves.push(outputMove)
  }

  // 名前でソート
  outputMoves.sort((a, b) => a.nameEn.localeCompare(b.nameEn))

  console.log(`  Converted ${outputMoves.length} moves`)
  console.log(`  Skipped (not in raw): ${skippedMoves.length} moves`)
  if (unknownTypeMoves.length > 0) {
    console.warn(`  Unknown type: ${unknownTypeMoves.join(', ')}`)
  }

  // ────────────────────────────────────────────────
  // Step 3: 特性データをフィルタ
  // ────────────────────────────────────────────────
  console.log('Collecting ability data...')

  const championsAbilityIds = new Set<string>()
  for (const pokemonId of CHAMPIONS_BASE_IDS) {
    const pokemon = rawPokedex[pokemonId]
    if (!pokemon) continue
    for (const abilityName of Object.values(pokemon.abilities)) {
      const abilityId = abilityName.toLowerCase().replace(/[^a-z0-9]/g, '')
      championsAbilityIds.add(abilityId)
    }
  }

  interface OutputAbility {
    nameEn: string
    name: string
  }

  const outputAbilities: OutputAbility[] = []
  for (const abilityId of championsAbilityIds) {
    const ability = rawAbilities[abilityId]
    if (!ability) continue
    outputAbilities.push({ nameEn: ability.name, name: ability.name })
  }
  outputAbilities.sort((a, b) => a.nameEn.localeCompare(b.nameEn))
  console.log(`  Collected ${outputAbilities.length} abilities`)

  // ────────────────────────────────────────────────
  // Step 4: アイテムデータ（ダメージ計算関連）
  // ────────────────────────────────────────────────
  const DAMAGE_CALC_ITEMS = new Set([
    'lifeorb', 'choiceband', 'choicespecs', 'choicescarf',
    'focussash', 'assaultvest', 'expertbelt',
    'brightpowder',
    // type-boosting items
    'miracleseed', 'charcoal', 'mysticwater', 'magnet',
    'nevermeltice', 'blackbelt', 'poisonbarb', 'softsand',
    'sharpbeak', 'twistedspoon', 'silverpowder', 'hardstone',
    'spelltag', 'dragonfang', 'blackglasses', 'metalcoat',
    'fairyfeather',
    // resistance berries
    'occaberry', 'passhoberry', 'wacanberry', 'rindoberry',
    'yacheberry', 'chopleberry', 'kebiaberry', 'shucaberry',
    'cobaberry', 'payapaberry', 'tangaberry', 'chartiberry',
    'habanberry', 'colburberry', 'babiriberry', 'roseliberry',
    'chilanberry',
    // mega stone (represented as single item)
    // Note: actual mega stones tracked separately in game
  ])

  const outputItems: Array<{ nameEn: string; name: string }> = []
  for (const itemId of DAMAGE_CALC_ITEMS) {
    const item = rawItems[itemId]
    if (!item) continue
    outputItems.push({ nameEn: item.name, name: item.name })
  }
  outputItems.sort((a, b) => a.nameEn.localeCompare(b.nameEn))
  console.log(`  Collected ${outputItems.length} items`)

  // ────────────────────────────────────────────────
  // Step 5: フィルタ済みデータを出力
  // ────────────────────────────────────────────────
  console.log('Writing filtered data...')
  writeFileSync(resolve(FILTERED_DIR, 'moves-filtered.json'), JSON.stringify(outputMoves, null, 2), 'utf-8')
  writeFileSync(resolve(FILTERED_DIR, 'abilities-filtered.json'), JSON.stringify(outputAbilities, null, 2), 'utf-8')
  writeFileSync(resolve(FILTERED_DIR, 'items-filtered.json'), JSON.stringify(outputItems, null, 2), 'utf-8')

  // ────────────────────────────────────────────────
  // Step 6: 抜け検出レポート
  // ────────────────────────────────────────────────
  console.log('\n=== Gap Detection Report ===')

  // 既存 moves.json の技が新データに含まれているか確認
  const newMoveEnSet = new Set(outputMoves.map(m => m.nameEn.toLowerCase().replace(/[^a-z0-9]/g, '')))
  const missingFromNew: string[] = []
  for (const m of existingMoves) {
    const sid = m.nameEn.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!newMoveEnSet.has(sid)) {
      missingFromNew.push(`${m.name} (${m.nameEn})`)
    }
  }

  if (missingFromNew.length > 0) {
    console.log(`\n[WARNING] ${missingFromNew.length} moves in existing moves.json not found in Champions learnsets:`)
    missingFromNew.forEach(m => console.log(`  - ${m}`))
  } else {
    console.log('\nAll existing moves are covered by Champions learnsets.')
  }

  // 日本語名が未設定の技を報告
  const noJaName = outputMoves.filter(m => m.name === m.nameEn)
  console.log(`\n[INFO] ${noJaName.length} moves have no Japanese name mapping (using English):`)
  noJaName.slice(0, 20).forEach(m => console.log(`  - ${m.nameEn}`))
  if (noJaName.length > 20) console.log(`  ... and ${noJaName.length - 20} more`)

  // 内定ポケモンのうち learnset がないもの
  const noLearnset = [...CHAMPIONS_BASE_IDS].filter(id => !rawLearnsets[id]?.learnset)
  if (noLearnset.length > 0) {
    console.log(`\n[WARNING] ${noLearnset.length} Champions pokemon have no learnset:`)
    noLearnset.forEach(id => console.log(`  - ${id}`))
  }

  console.log('\nDone!')
  console.log(`Output: ${FILTERED_DIR}`)
  console.log(`  - moves-filtered.json (${outputMoves.length} moves)`)
  console.log(`  - abilities-filtered.json (${outputAbilities.length} abilities)`)
  console.log(`  - items-filtered.json (${outputItems.length} items)`)
}

main()
