import type { SpDistribution } from '@/domain/models/StatPoints'
import { createSpDistribution } from '@/domain/models/StatPoints'

export type SpPresetKey = 'AS' | 'HS' | 'HB' | 'HD' | 'HC' | 'CS' | 'HA' | 'balanced' | 'clear'

export interface SpPreset {
  key: SpPresetKey
  label: string
  sp: SpDistribution
}

export const SP_PRESETS: SpPreset[] = [
  {
    key: 'AS',
    label: 'AS',
    sp: createSpDistribution({ atk: 32, spe: 32, hp: 2 }),
  },
  {
    key: 'CS',
    label: 'CS',
    sp: createSpDistribution({ spa: 32, spe: 32, hp: 2 }),
  },
  {
    key: 'HS',
    label: 'HS',
    sp: createSpDistribution({ hp: 32, spe: 32, def: 2 }),
  },
  {
    key: 'HB',
    label: 'HB',
    sp: createSpDistribution({ hp: 32, def: 32, spd: 2 }),
  },
  {
    key: 'HD',
    label: 'HD',
    sp: createSpDistribution({ hp: 32, spd: 32, def: 2 }),
  },
  {
    key: 'HC',
    label: 'HC',
    sp: createSpDistribution({ hp: 32, spa: 32, spd: 2 }),
  },
  {
    key: 'HA',
    label: 'HA',
    sp: createSpDistribution({ hp: 32, atk: 32, def: 2 }),
  },
  {
    key: 'balanced',
    label: '均等',
    sp: createSpDistribution({ hp: 11, atk: 11, def: 11, spa: 11, spd: 11, spe: 11 }),
  },
  {
    key: 'clear',
    label: 'クリア',
    sp: createSpDistribution(),
  },
]
