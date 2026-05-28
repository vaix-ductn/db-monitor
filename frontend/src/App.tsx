import { useState, useEffect } from 'react'
import { CdcEvent } from './types'
import { useEvents } from './hooks/useEvents'
import { useWebSocket } from './hooks/useWebSocket'
import { EventTable } from './components/EventTable'
import { FilterBar } from './components/FilterBar'
import { EventDetail } from './components/EventDetail'

const API_PORT = import.meta.env.VITE_API_PORT || '8099'
const API_BASE = `http://localhost:${API_PORT}`

function App() {
  const { events, filtered, addEvent, filters, setFilters, tables, databases } = useEvents()
  const [selected, setSelected] = useState<CdcEvent | null>(null)

  useEffect(() => {
    fetch(`${API_BASE}/events`)
      .then(r => r.json())
      .then((data: CdcEvent[]) => data.forEach(addEvent))
      .catch(console.error)
  }, [addEvent])

  useWebSocket(addEvent, API_PORT)

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 shrink-0">
        <h1 className="text-xl font-bold text-white">DB Monitor — CDC Dashboard</h1>
        <p className="text-xs text-gray-400 mt-1">{events.length} total events captured</p>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 overflow-hidden">
          <FilterBar filters={filters} onChange={setFilters} databases={databases} tables={tables} />
          <EventTable events={filtered} selected={selected} onSelect={setSelected} />
        </div>
        {selected && (
          <EventDetail event={selected} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  )
}

export default App
