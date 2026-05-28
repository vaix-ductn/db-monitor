import { useState, useCallback, useMemo, useEffect } from 'react'
import { CdcEvent } from '../types'

const API_PORT = import.meta.env.VITE_API_PORT || '8099'
const API_BASE = `http://localhost:${API_PORT}`

export interface Filters {
  operation: string
  database: string
  table: string
  keyword: string
}

export function useEvents() {
  const [events, setEvents] = useState<CdcEvent[]>([])
  const [filters, setFilters] = useState<Filters>({ operation: '', database: '', table: '', keyword: '' })
  const [schema, setSchema] = useState<Record<string, string[]>>({})

  useEffect(() => {
    fetch(`${API_BASE}/schema`)
      .then(r => r.json())
      .then(setSchema)
      .catch(() => {})
  }, [])

  const addEvent = useCallback((event: CdcEvent) => {
    setEvents(prev => [event, ...prev].slice(0, 500))
  }, [])

  const databases = useMemo(
    () => Object.keys(schema).sort(),
    [schema]
  )

  const tables = useMemo(() => {
    if (filters.database && schema[filters.database]) {
      return schema[filters.database]
    }
    const fromSchema = Object.values(schema).flat()
    return fromSchema.length > 0
      ? Array.from(new Set(fromSchema)).sort()
      : Array.from(new Set(events.map(e => e.table))).sort()
  }, [schema, filters.database, events])

  const filtered = useMemo(() => events.filter(e => {
    if (filters.database && e.database !== filters.database) return false
    if (filters.operation && e.operation !== filters.operation) return false
    if (filters.table && e.table !== filters.table) return false
    if (filters.keyword) {
      const kw = filters.keyword.toLowerCase()
      if (!JSON.stringify(e).toLowerCase().includes(kw)) return false
    }
    return true
  }), [events, filters])

  return { events, filtered, addEvent, filters, setFilters, tables, databases }
}
