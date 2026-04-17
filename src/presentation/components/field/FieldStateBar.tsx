import { useFieldStore } from '@/presentation/store/fieldStore'
import type { Weather, TerrainField } from '@/domain/models/Pokemon'

const WEATHERS: { value: Weather; label: string }[] = [
  { value: null,        label: 'なし' },
  { value: 'はれ',      label: 'はれ' },
  { value: 'あめ',      label: 'あめ' },
  { value: 'すなあらし', label: 'すな' },
  { value: 'ゆき',      label: 'ゆき' },
]

const TERRAINS: { value: TerrainField; label: string }[] = [
  { value: null,      label: 'なし' },
  { value: 'エレキ',  label: 'エレキ' },
  { value: 'グラス',  label: 'グラス' },
  { value: 'サイコ',  label: 'サイコ' },
  { value: 'ミスト',  label: 'ミスト' },
]

export function FieldStateBar() {
  const field = useFieldStore()

  return (
    <div className="panel">
      <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-sm">
        {/* 天候 */}
        <div className="flex items-center gap-1.5">
          <span className="label">天候:</span>
          {WEATHERS.map(w => (
            <button
              key={String(w.value)}
              type="button"
              onClick={() => field.setWeather(w.value)}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${
                field.weather === w.value
                  ? 'bg-blue-600 dark:bg-blue-700 text-white'
                  : 'text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>

        {/* フィールド */}
        <div className="flex items-center gap-1.5">
          <span className="label">フィールド:</span>
          {TERRAINS.map(t => (
            <button
              key={String(t.value)}
              type="button"
              onClick={() => field.setTerrain(t.value)}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${
                field.terrain === t.value
                  ? 'bg-green-600 dark:bg-green-700 text-white'
                  : 'text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 壁 */}
        <div className="flex items-center gap-1.5">
          <span className="label">壁:</span>
          {[
            { key: 'isReflect', label: 'リフレクター', setter: field.setReflect, value: field.isReflect },
            { key: 'isLightScreen', label: 'ひかりのかべ', setter: field.setLightScreen, value: field.isLightScreen },
            { key: 'isAuroraVeil', label: 'オーロラベール', setter: field.setAuroraVeil, value: field.isAuroraVeil },
          ].map(({ key, label, setter, value }) => (
            <button
              key={key}
              type="button"
              onClick={() => setter(!value)}
              className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                value
                  ? 'bg-indigo-700 dark:bg-indigo-800 border-indigo-500 dark:border-indigo-600 text-white'
                  : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-400 hover:border-slate-500 dark:hover:border-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
