import { CdcEvent } from '../types'
import { DiffViewer } from './DiffViewer'

interface Props {
  event: CdcEvent
  onClose: () => void
}

export function EventDetail({ event, onClose }: Props) {
  return (
    <div className="w-96 border-l border-gray-800 bg-gray-900 flex flex-col overflow-hidden shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h2 className="text-sm font-bold">Event Detail</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
      </div>
      <div className="flex-1 overflow-auto p-4 text-sm space-y-3">
        {event.database && (
          <div><span className="text-gray-400">Database: </span><span className="font-mono">{event.database}</span></div>
        )}
        <div><span className="text-gray-400">Table: </span><span className="font-mono">{event.table}</span></div>
        <div><span className="text-gray-400">Operation: </span><span className="font-mono">{event.operation}</span></div>
        <div><span className="text-gray-400">Timestamp: </span><span className="text-xs">{event.timestamp}</span></div>

        {event.operation === 'u' && event.before && event.after && (
          <>
            <div className="text-gray-400 text-xs uppercase font-semibold pt-2">Changes</div>
            <DiffViewer before={event.before} after={event.after} />
          </>
        )}

        {event.after && (
          <>
            <div className="text-gray-400 text-xs uppercase font-semibold pt-2">After</div>
            <pre className="bg-gray-800 rounded p-2 text-xs overflow-auto whitespace-pre-wrap">
              {JSON.stringify(event.after, null, 2)}
            </pre>
          </>
        )}

        {event.before && (
          <>
            <div className="text-gray-400 text-xs uppercase font-semibold pt-2">Before</div>
            <pre className="bg-gray-800 rounded p-2 text-xs overflow-auto whitespace-pre-wrap">
              {JSON.stringify(event.before, null, 2)}
            </pre>
          </>
        )}
      </div>
    </div>
  )
}
