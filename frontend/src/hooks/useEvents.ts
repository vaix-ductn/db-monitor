import { useState, useCallback, useMemo } from 'react'
import { CdcEvent } from '../types'

export interface Filters {
  operation: string
  table: string
  keyword: string
}

export function useEvents() {
  const [events, setEvents] = useState<CdcEvent[]>([])
  const [filters, setFilters] = useState<Filters>({ operation: '', table: '', keyword: '' })

  const addEvent = useCallback((event: CdcEvent) => {
    setEvents(prev => [event, ...prev].slice(0, 500))
  }, [])

  const tables = useMemo(
    () => Array.from(new Set(events.map(e => e.table))).sort(),
    [events]
  )

  const filtered = events.filter(e => {
    if (filters.operation && e.operation !== filters.operation) return false
    if (filters.table && e.table !== filters.table) return false
    if (filters.keyword) {
      const kw = filters.keyword.toLowerCase()
      if (!JSON.stringify(e).toLowerCase().includes(kw)) return false
    }
    return true
  })

  return { events, filtered, addEvent, filters, setFilters, tables }
}
