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
  const activeCount = [
    field.weather,
    field.terrain,
    field.isReflect,
    field.isLightScreen,
    field.isAuroraVeil,
    field.isGravity,
    field.isTrickRoom,
  ].filter(Boolean).length

  return (
    <div className="panel">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-fg">フィールド条件</h2>
          <p className="text-xs text-fg-muted">天候・フィールド・壁・場の効果をまとめて設定</p>
        </div>
        <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
          activeCount > 0 ? 'bg-accent-bg text-accent' : 'bg-surface-3 text-fg-muted'
        }`}>
          {activeCount > 0 ? `${activeCount}件 有効` : '条件なし'}
        </span>
      </div>

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
                  ? 'bg-accent-bg text-accent font-medium'
                  : 'text-fg-muted hover:text-fg'
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
                  ? 'bg-accent-bg text-accent font-medium'
                  : 'text-fg-muted hover:text-fg'
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
                  ? 'bg-accent-bg border-accent-border text-accent font-medium'
                  : 'border-edge text-fg-muted hover:border-accent-border hover:text-accent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 場 */}
        <div className="flex items-center gap-1.5">
          <span className="label">場:</span>
          <button
            type="button"
            onClick={() => field.setGravity(!field.isGravity)}
            title="命中率5/3倍 + 全ポケモン接地（ひこう/ふゆうにじめん技が当たる）"
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
              field.isGravity
                ? 'bg-accent-bg border-accent-border text-accent font-medium'
                : 'border-edge text-fg-muted hover:border-accent-border hover:text-accent'
            }`}
          >
            じゅうりょく
          </button>
          <button
            type="button"
            onClick={() => field.setTrickRoom(!field.isTrickRoom)}
            title="素早さ順が逆転する場の状態"
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
              field.isTrickRoom
                ? 'bg-accent-bg border-accent-border text-accent font-medium'
                : 'border-edge text-fg-muted hover:border-accent-border hover:text-accent'
            }`}
          >
            トリックルーム
          </button>
        </div>
      </div>
    </div>
  )
}
