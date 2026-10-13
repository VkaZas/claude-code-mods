export type Quote = {
  symbol: string
  name: string
  price: number
  previousClose: number
  closes: number[]
  // Seconds since the epoch, and the exchange's offset from UTC in seconds.
  time: number
  gmtoffset: number
  // Which way the last refresh moved it: 1 up, -1 down, 0 unchanged.
  tick: number
}

export type Session = 'pre' | 'regular' | 'post' | 'closed'

declare module 'claude-code' {
  interface PluginState {
    'vkazas-ticker': {
      symbols: string[]
      quotes: Quote[]
      session: Session
      updatedAt: number | null
      error: string
      offset: number
    }
  }
}
