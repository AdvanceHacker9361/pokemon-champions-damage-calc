interface AbilitySelectProps {
  value: string
  options: string[]  // ポケモン固有の特性リスト
  isMega: boolean
  megaAbility?: string
  onChange: (name: string) => void
}

export function AbilitySelect({ value, options, isMega, megaAbility, onChange }: AbilitySelectProps) {
  if (isMega && megaAbility) {
    return (
      <div>
        <label className="label block mb-1">特性</label>
        <div className="input-base text-sm text-slate-400 w-full">
          {megaAbility} <span className="text-xs">(メガ固定)</span>
        </div>
      </div>
    )
  }

  const displayOptions = options.length > 0 ? options : ['なし']

  return (
    <div>
      <label className="label block mb-1">特性</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="input-base w-full text-sm"
      >
        {displayOptions.map(a => (
          <option key={a} value={a}>{a}</option>
        ))}
      </select>
    </div>
  )
}
