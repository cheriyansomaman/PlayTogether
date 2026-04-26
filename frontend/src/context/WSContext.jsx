import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { useAuth } from './AuthContext'

const WSContext = createContext(null)

export function WSProvider({ children }) {
  const { user } = useAuth()
  const ws = useRef(null)
  const listeners = useRef({})
  const [connected, setConnected] = useState(false)
  const reconnectTimer = useRef(null)

  const connect = useCallback(() => {
    if (!user) return
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${proto}://${window.location.host}/ws`
    ws.current = new WebSocket(url)

    ws.current.onopen = () => setConnected(true)

    ws.current.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        const handlers = listeners.current[msg.type] || []
        handlers.forEach((fn) => fn(msg))
        // Also call wildcard listeners
        ;(listeners.current['*'] || []).forEach((fn) => fn(msg))
      } catch {}
    }

    ws.current.onclose = () => {
      setConnected(false)
      reconnectTimer.current = setTimeout(connect, 3000)
    }

    ws.current.onerror = () => ws.current?.close()
  }, [user])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectTimer.current)
      ws.current?.close()
    }
  }, [connect])

  const subscribe = useCallback((type, fn) => {
    if (!listeners.current[type]) listeners.current[type] = []
    listeners.current[type].push(fn)
    return () => {
      listeners.current[type] = listeners.current[type].filter((h) => h !== fn)
    }
  }, [])

  return (
    <WSContext.Provider value={{ connected, subscribe }}>
      {children}
    </WSContext.Provider>
  )
}

export const useWS = () => useContext(WSContext)
