interface Props {
  before: Record<string, unknown>
  after: Record<string, unknown>
}

export function DiffViewer({ before, after }: Props) {
  const allKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
  const changed = allKeys.filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]))

  if (changed.length === 0) {
    return <div className="text-gray-500 text-xs">No field changes detected</div>
  }

  return (
    <div className="space-y-1">
      {changed.map(k => (
        <div key={k} className="text-xs font-mono bg-gray-800 rounded p-2">
          <span className="text-gray-400">{k}:</span>{' '}
          <span className="text-red-400 line-through">{JSON.stringify(before[k])}</span>
          {' → '}
          <span className="text-green-400">{JSON.stringify(after[k])}</span>
        </div>
      ))}
    </div>
  )
}
