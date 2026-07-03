/** おやこあい 16×16 テーブル */
export function ParentalBondTable({ rolls, childRolls, defenderHp }: { rolls: number[]; childRolls: number[]; defenderHp: number }) {

  return (
    <div className="mt-1 overflow-x-auto">
      <div className="text-xs text-fg-muted mb-1">
        おやこあい合計 (親 + 子×25%) —{' '}
        <span className="text-danger-1">赤=確定KO</span>
        <span className="text-danger-3 ml-2">橙=乱数2発</span>
      </div>
      <table className="text-xs font-mono border-collapse">
        <thead>
          <tr>
            <th className="text-fg-subtle pr-1 text-right">親↓子→</th>
            {childRolls.map((c, j) => (
              <th key={j} className="text-fg-subtle w-7 text-center px-0.5">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rolls.map((r, i) => (
            <tr key={i}>
              <td className="text-fg-muted pr-1 text-right">{r}</td>
              {childRolls.map((c, j) => {
                const total = r + c
                const isKo = total >= defenderHp
                return (
                  <td
                    key={j}
                    className={`text-center px-0.5 ${isKo ? 'text-danger-1 font-bold' : 'text-fg-subtle'}`}
                  >
                    {total}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <ParentalBondKoInfo rolls={rolls} childRolls={childRolls} defenderHp={defenderHp} />
    </div>
  )
}

function ParentalBondKoInfo({ rolls, childRolls, defenderHp }: { rolls: number[]; childRolls: number[]; defenderHp: number }) {
  let koCount = 0
  for (const r of rolls) {
    for (const c of childRolls) {
      if (r + c >= defenderHp) koCount++
    }
  }
  const total = rolls.length * childRolls.length
  const prob = koCount / total

  if (koCount === 0) return <div className="text-xs text-fg-subtle mt-1">KO不可</div>
  if (koCount === total) return <div className="text-xs text-danger-1 mt-1">確定KO (親子愛1発)</div>
  return (
    <div className="text-xs text-danger-4 mt-1">
      乱数KO: {koCount}/{total} ({(prob * 100).toFixed(1)}%)
    </div>
  )
}
