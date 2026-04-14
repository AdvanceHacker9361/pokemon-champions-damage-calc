import type { SpDistribution } from '@/domain/models/StatPoints'
import { createSpDistribution } from '@/domain/models/StatPoints'
import { APP_VERSION } from '@/infrastructure/version'

interface ShareablePokemonState {
  pokemonId: number | null
  natureName: string
  sp: SpDistribution
  abilityName: string
  itemName: string | null
  isMega: boolean
  moves: (string | null)[]
  ranks: Record<string, number>
  status: string | null
}

interface ShareableState {
  version: string
  attacker: ShareablePokemonState
  defender: ShareablePokemonState
  weather: string | null
  terrain: string | null
  isReflect: boolean
  isLightScreen: boolean
  isAuroraVeil: boolean
  isTrickRoom: boolean
}

const SP_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const

function encodeSp(sp: SpDistribution): string {
  return SP_KEYS.map(k => sp[k]).join(',')
}

function decodeSp(s: string): SpDistribution {
  const vals = s.split(',').map(Number)
  return createSpDistribution({
    hp: vals[0], atk: vals[1], def: vals[2],
    spa: vals[3], spd: vals[4], spe: vals[5],
  })
}

function encodePokemon(p: ShareablePokemonState, prefix: string): Record<string, string> {
  const params: Record<string, string> = {}
  if (p.pokemonId) params[`${prefix}id`] = String(p.pokemonId)
  params[`${prefix}n`] = p.natureName
  params[`${prefix}sp`] = encodeSp(p.sp)
  params[`${prefix}ab`] = p.abilityName
  if (p.itemName) params[`${prefix}it`] = p.itemName
  if (p.isMega) params[`${prefix}mg`] = '1'
  p.moves.forEach((m, i) => { if (m) params[`${prefix}m${i}`] = m })
  if (p.status) params[`${prefix}st`] = p.status
  return params
}

function decodePokemon(params: URLSearchParams, prefix: string): ShareablePokemonState {
  const id = params.get(`${prefix}id`)
  const sp = params.get(`${prefix}sp`)
  const moves: (string | null)[] = [
    params.get(`${prefix}m0`),
    params.get(`${prefix}m1`),
    params.get(`${prefix}m2`),
    params.get(`${prefix}m3`),
  ]
  return {
    pokemonId: id ? Number(id) : null,
    natureName: params.get(`${prefix}n`) ?? 'まじめ',
    sp: sp ? decodeSp(sp) : createSpDistribution(),
    abilityName: params.get(`${prefix}ab`) ?? 'なし',
    itemName: params.get(`${prefix}it`) ?? null,
    isMega: params.get(`${prefix}mg`) === '1',
    moves,
    ranks: {},
    status: params.get(`${prefix}st`) ?? null,
  }
}

export function encodeToUrl(state: ShareableState): string {
  const params = new URLSearchParams()
  params.set('v', APP_VERSION)
  Object.entries(encodePokemon(state.attacker, 'a')).forEach(([k, v]) => params.set(k, v))
  Object.entries(encodePokemon(state.defender, 'd')).forEach(([k, v]) => params.set(k, v))
  if (state.weather) params.set('w', state.weather)
  if (state.terrain) params.set('t', state.terrain)
  if (state.isReflect)    params.set('r', '1')
  if (state.isLightScreen) params.set('l', '1')
  if (state.isAuroraVeil) params.set('au', '1')
  if (state.isTrickRoom)  params.set('tr', '1')
  return `?${params.toString()}`
}

export function decodeFromUrl(search: string): Partial<ShareableState> {
  const params = new URLSearchParams(search)
  return {
    version: params.get('v') ?? undefined,
    attacker: decodePokemon(params, 'a'),
    defender: decodePokemon(params, 'd'),
    weather: (params.get('w') as ShareableState['weather']) ?? null,
    terrain: (params.get('t') as ShareableState['terrain']) ?? null,
    isReflect: params.get('r') === '1',
    isLightScreen: params.get('l') === '1',
    isAuroraVeil: params.get('au') === '1',
    isTrickRoom: params.get('tr') === '1',
  }
}
