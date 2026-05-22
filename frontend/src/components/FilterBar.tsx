import { Filters } from '../hooks/useEvents'

interface Props {
  filters: Filters
  onChange: (f: Filters) => void
  tables: string[]
}

export function FilterBar({ filters, onChange, tables }: Props) {
  return (
    <div className="flex gap-3 px-4 py-2 bg-gray-900 border-b border-gray-800 flex-wrap shrink-0">
      <select
        className="bg-gray-800 text-gray-200 text-sm rounded px-2 py-1 border border-gray-700"
        value={filters.operation}
        onChange={e => onChange({ ...filters, operation: e.target.value })}
      >
        <option value="">All Operations</option>
        <option value="c">INSERT</option>
        <option value="u">UPDATE</option>
        <option value="d">DELETE</option>
        <option value="r">SNAPSHOT</option>
      </select>

      <select
        className="bg-gray-800 text-gray-200 text-sm rounded px-2 py-1 border border-gray-700"
        value={filters.table}
        onChange={e => onChange({ ...filters, table: e.target.value })}
      >
        <option value="">All Tables</option>
        {tables.map(t => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>

      <input
        type="text"
        placeholder="Search keyword..."
        className="bg-gray-800 text-gray-200 text-sm rounded px-2 py-1 border border-gray-700 flex-1 min-w-40"
        value={filters.keyword}
        onChange={e => onChange({ ...filters, keyword: e.target.value })}
      />
    </div>
  )
}
