import { useEffect, useRef } from 'react'
import { CdcEvent } from '../types'

export function useWebSocket(onEvent: (event: CdcEvent) => void, apiPort: string) {
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    let retryDelay = 1000
    let ws: WebSocket | undefined
    let timeoutId: ReturnType<typeof setTimeout>
    let unmounted = false

    const connect = () => {
      ws = new WebSocket(`ws://localhost:${apiPort}/ws`)

      ws.onopen = () => { retryDelay = 1000 }

      ws.onmessage = (e) => {
        try {
          onEventRef.current(JSON.parse(e.data) as CdcEvent)
        } catch { /* ignore malformed messages */ }
      }

      ws.onclose = () => {
        if (!unmounted) {
          timeoutId = setTimeout(() => {
            retryDelay = Math.min(retryDelay * 2, 30000)
            connect()
          }, retryDelay)
        }
      }
    }

    connect()

    return () => {
      unmounted = true
      clearTimeout(timeoutId)
      ws?.close()
    }
  }, [apiPort])
}
