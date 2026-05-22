import { CdcEvent } from '../types'

const OP_BADGE: Record<string, { label: string; cls: string }> = {
  c: { label: 'INSERT',   cls: 'bg-green-900 text-green-300' },
  u: { label: 'UPDATE',   cls: 'bg-yellow-900 text-yellow-300' },
  d: { label: 'DELETE',   cls: 'bg-red-900 text-red-300' },
  r: { label: 'SNAPSHOT', cls: 'bg-gray-700 text-gray-300' },
}

const MAX_INLINE = 3

function InlineDetail({ event }: { event: CdcEvent }) {
  // UPDATE — show changed fields as old → new
  if (event.operation === 'u' && event.before && event.after) {
    const changed = Object.keys(event.after).filter(
      k => JSON.stringify(event.before![k]) !== JSON.stringify(event.after![k])
    )
    const shown = changed.slice(0, MAX_INLINE)
    const more = changed.length - shown.length
    if (shown.length === 0) return <span className="text-gray-600 text-xs">no field changes</span>
    return (
      <div className="space-y-0.5">
        {shown.map(k => (
          <div key={k} className="text-xs font-mono flex gap-1 items-baseline flex-wrap">
            <span className="text-gray-400 shrink-0">{k}:</span>
            <span className="text-red-400 line-through break-all">
              {JSON.stringify(event.before![k])}
            </span>
            <span className="text-gray-500 shrink-0">→</span>
            <span className="text-green-400 break-all">
              {JSON.stringify(event.after![k])}
            </span>
          </div>
        ))}
        {more > 0 && (
          <div className="text-xs text-gray-500">+{more} more field{more > 1 ? 's' : ''}</div>
        )}
      </div>
    )
  }

  // INSERT — show after values
  if (event.operation === 'c' && event.after) {
    const entries = Object.entries(event.after).slice(0, MAX_INLINE)
    const more = Object.keys(event.after).length - entries.length
    return (
      <div className="space-y-0.5">
        {entries.map(([k, v]) => (
          <div key={k} className="text-xs font-mono flex gap-1 flex-wrap">
            <span className="text-gray-400 shrink-0">{k}:</span>
            <span className="text-green-400 break-all">{JSON.stringify(v)}</span>
          </div>
        ))}
        {more > 0 && (
          <div className="text-xs text-gray-500">+{more} more field{more > 1 ? 's' : ''}</div>
        )}
      </div>
    )
  }

  // DELETE — show before values (what was deleted)
  if (event.operation === 'd' && event.before) {
    const entries = Object.entries(event.before).slice(0, MAX_INLINE)
    const more = Object.keys(event.before).length - entries.length
    return (
      <div className="space-y-0.5">
        {entries.map(([k, v]) => (
          <div key={k} className="text-xs font-mono flex gap-1 flex-wrap">
            <span className="text-gray-400 shrink-0">{k}:</span>
            <span className="text-red-400 break-all">{JSON.stringify(v)}</span>
          </div>
        ))}
        {more > 0 && (
          <div className="text-xs text-gray-500">+{more} more field{more > 1 ? 's' : ''}</div>
        )}
      </div>
    )
  }

  // SNAPSHOT — just show field count
  if (event.operation === 'r' && event.after) {
    return (
      <span className="text-xs text-gray-500">{Object.keys(event.after).length} fields</span>
    )
  }

  return <span className="text-gray-600 text-xs">—</span>
}

function changedFieldCount(event: CdcEvent): number {
  if (event.before && event.after) {
    return Object.keys(event.after).filter(
      k => JSON.stringify(event.before![k]) !== JSON.stringify(event.after![k])
    ).length
  }
  if (event.after) return Object.keys(event.after).length
  if (event.before) return Object.keys(event.before).length
  return 0
}

interface Props {
  events: CdcEvent[]
  selected: CdcEvent | null
  onSelect: (e: CdcEvent) => void
}

export function EventTable({ events, selected, onSelect }: Props) {
  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-gray-900 text-gray-400 text-xs uppercase z-10">
          <tr>
            <th className="px-4 py-2 text-left whitespace-nowrap w-44">Timestamp</th>
            <th className="px-4 py-2 text-left w-32">Table</th>
            <th className="px-4 py-2 text-left w-28">Operation</th>
            <th className="px-4 py-2 text-left w-16">Fields</th>
            <th className="px-4 py-2 text-left">Detail</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e, i) => {
            const badge = OP_BADGE[e.operation] ?? { label: e.operation, cls: 'bg-gray-700 text-gray-300' }
            return (
              <tr
                key={i}
                className={`border-b border-gray-800 cursor-pointer hover:bg-gray-800 transition-colors align-top ${selected === e ? 'bg-gray-800' : ''}`}
                onClick={() => onSelect(e)}
              >
                <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap text-xs">{e.timestamp}</td>
                <td className="px-4 py-2.5 font-mono text-sm">{e.table}</td>
                <td className="px-4 py-2.5">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${badge.cls}`}>
                    {badge.label}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-400">{changedFieldCount(e)}</td>
                <td className="px-4 py-2.5">
                  <InlineDetail event={e} />
                </td>
              </tr>
            )
          })}
          {events.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                No events yet — waiting for CDC data...
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
