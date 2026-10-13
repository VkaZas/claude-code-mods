import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Quote, Session } from '../types'

const PANE = 'ticker'
const DEFAULT_SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'TSLA', 'BTC-USD']
const BARS = '▁▂▃▄▅▆▇█'
const FRAME_MS = 250
const SYMBOL = /^[A-Z0-9.^=-]{1,12}$/

const symbols = atom({ plugin: 'vkazas-ticker', key: 'symbols' } as const, DEFAULT_SYMBOLS)
const quotes = atom({ plugin: 'vkazas-ticker', key: 'quotes' } as const, [])
const session = atom({ plugin: 'vkazas-ticker', key: 'session' } as const, 'closed')
const updatedAt = atom({ plugin: 'vkazas-ticker', key: 'updatedAt' } as const, null)
const failure = atom({ plugin: 'vkazas-ticker', key: 'error' } as const, '')
const offset = atom({ plugin: 'vkazas-ticker', key: 'offset' } as const, 0)

// ---------- words, in the language the options choose ----------

type Lang = 'en' | 'zh'

const TEXT = {
  en: {
    yahooStatus: (n: number) => `Yahoo returned ${n}`,
    missing: (list: string[]) => `Not found: ${list.join(' ')}`,
    failed: (why: string) => `Fetch failed: ${why}`,
    session: { regular: '● open', pre: '◐ pre-market', post: '◑ after hours', closed: '○ closed' },
    command: 'A live stock pane; /ticker add NVDA TSLA and /ticker rm TSLA manage the watchlist',
    usage: 'Usage: /ticker add NVDA TSLA, or /ticker rm TSLA',
    watchlist: (list: string[]) => `Watchlist: ${list.join(' ')}`,
    title: 'Ticker',
    opened: 'Ticker pane opened.',
    notOpened: (why: string) => `The ticker pane could not be shown: ${why}`,
    ask: (symbol: string) => `How is ${symbol} trading today?`,
    asOf: (time: string) => `  as of ${time}`,
    fetching: 'Fetching quotes…',
    footer: (at: string | null, seconds: number) =>
      `${at === null ? 'not updated yet' : `updated ${at}`} · every ${seconds}s · Yahoo · press a symbol to ask Claude · /ticker add SYMBOL`,
  },
  zh: {
    yahooStatus: (n: number) => `Yahoo 返回 ${n}`,
    missing: (list: string[]) => `没取到：${list.join(' ')}`,
    failed: (why: string) => `拉取失败：${why}`,
    session: { regular: '● 盘中', pre: '◐ 盘前', post: '◑ 盘后', closed: '○ 休市' },
    command: '实时行情面板；/ticker add NVDA TSLA、/ticker rm TSLA 管理自选股',
    usage: '用法：/ticker add NVDA TSLA，或 /ticker rm TSLA',
    watchlist: (list: string[]) => `自选股：${list.join(' ')}`,
    title: '行情',
    opened: '行情面板已打开。',
    notOpened: (why: string) => `行情面板没能显示：${why}`,
    ask: (symbol: string) => `看看 ${symbol} 今天的走势`,
    asOf: (time: string) => `  美东 ${time}`,
    fetching: '正在拉取行情…',
    footer: (at: string | null, seconds: number) =>
      `${at === null ? '尚未更新' : `更新于 ${at}`} · 每 ${seconds}s · Yahoo · 点代码问 Claude · /ticker add 代码`,
  },
}

let lang: Lang = 'en'

// ---------- data ----------

type Period = { start: number; end: number }
type SparkMeta = {
  symbol?: string
  shortName?: string
  regularMarketPrice?: number
  chartPreviousClose?: number
  previousClose?: number
  regularMarketTime?: number
  gmtoffset?: number
  currentTradingPeriod?: { pre?: Period; regular?: Period; post?: Period }
}

function sessionAt(meta: SparkMeta | undefined, nowSeconds: number): Session {
  const p = meta?.currentTradingPeriod
  const within = (x?: Period) => x !== undefined && nowSeconds >= x.start && nowSeconds < x.end
  if (within(p?.regular)) return 'regular'
  if (within(p?.pre)) return 'pre'
  if (within(p?.post)) return 'post'
  return 'closed'
}

function parseSpark(text: string): { quotes: Omit<Quote, 'tick'>[]; first?: SparkMeta } {
  const data = JSON.parse(text) as {
    spark?: {
      result?: { symbol: string; response?: { meta?: SparkMeta; indicators?: { quote?: { close?: (number | null)[] }[] } }[] }[]
    }
  }
  const out: Omit<Quote, 'tick'>[] = []
  let first: SparkMeta | undefined
  for (const r of data.spark?.result ?? []) {
    const resp = r.response?.[0]
    const meta = resp?.meta
    if (meta === undefined || typeof meta.regularMarketPrice !== 'number') continue
    first ??= meta
    const closes = (resp?.indicators?.quote?.[0]?.close ?? []).filter((c): c is number => typeof c === 'number')
    out.push({
      symbol: r.symbol,
      name: meta.shortName ?? r.symbol,
      price: meta.regularMarketPrice,
      previousClose: meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPrice,
      closes,
      time: meta.regularMarketTime ?? 0,
      gmtoffset: meta.gmtoffset ?? 0,
    })
  }
  return { quotes: out, first }
}

let inFlight = false

async function refresh($: EngineInterface) {
  if (inFlight) return
  inFlight = true
  try {
    const list = (await read($, symbols)) ?? DEFAULT_SYMBOLS
    const fetched: Omit<Quote, 'tick'>[] = []
    let first: SparkMeta | undefined
    for (let i = 0; i < list.length; i += 20) {
      const chunk = list.slice(i, i + 20)
      const url = `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${encodeURIComponent(chunk.join(','))}&range=1d&interval=5m`
      const res = await $.http.fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } })
      if (!res.ok) throw new Error(TEXT[lang].yahooStatus(res.status))
      const parsed = parseSpark(res.text)
      fetched.push(...parsed.quotes)
      first ??= parsed.first
    }
    const before = new Map(((await read($, quotes)) ?? []).map(q => [q.symbol, q.price]))
    const bySymbol = new Map(fetched.map(q => [q.symbol, q]))
    const next: Quote[] = list
      .map(s => bySymbol.get(s))
      .filter((q): q is Omit<Quote, 'tick'> => q !== undefined)
      .map(q => {
        const was = before.get(q.symbol)
        return { ...q, tick: was === undefined || was === q.price ? 0 : q.price > was ? 1 : -1 }
      })
    await update($, quotes, () => next)
    await update($, session, () => sessionAt(first, Date.now() / 1000))
    await update($, updatedAt, () => Date.now())
    const missing = list.filter(s => !bySymbol.has(s))
    await update($, failure, () => (missing.length > 0 ? TEXT[lang].missing(missing) : ''))
  } catch (err) {
    await update($, failure, () => TEXT[lang].failed(err instanceof Error ? err.message : String(err)))
  } finally {
    inFlight = false
  }
}

// ---------- formatting ----------

function price(n: number): string {
  return n >= 1000 ? n.toFixed(1) : n >= 1 ? n.toFixed(2) : n.toFixed(4)
}

function signed(n: number, digits = 2): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}`
}

function sparkline(closes: number[], width: number): string {
  if (closes.length < 2 || width < 2) return ''
  const step = closes.length / width
  const points = Array.from({ length: Math.min(width, closes.length) }, (_, i) =>
    closes[Math.min(closes.length - 1, Math.floor(i * step))],
  )
  points[points.length - 1] = closes[closes.length - 1]
  const lo = Math.min(...points)
  const hi = Math.max(...points)
  const span = hi - lo || 1
  return points.map(p => BARS[Math.round(((p - lo) / span) * (BARS.length - 1))]).join('')
}

function clock(ms: number): string {
  return new Date(ms).toTimeString().slice(0, 8)
}

function exchangeTime(q: Quote): string {
  return new Date((q.time + q.gmtoffset) * 1000).toISOString().slice(11, 16)
}

const SESSION_COLOR: Record<Session, string> = { regular: 'success', pre: 'warning', post: 'warning', closed: 'inactive' }

type Seg = { text: string; color: string; bold?: boolean }

// The tape: every quote in a row, cut to the window and moved by the frame.
function tapeWindow(segs: Seg[], width: number, frame: number): Seg[] {
  const chars: { ch: string; color: string; bold: boolean }[] = []
  for (const s of segs) for (const ch of s.text) chars.push({ ch, color: s.color, bold: s.bold === true })
  if (chars.length === 0) return []
  const shown =
    chars.length <= width
      ? chars
      : Array.from({ length: width }, (_, i) => chars[(frame + i) % chars.length])
  const out: Seg[] = []
  for (const c of shown) {
    const last = out[out.length - 1]
    if (last !== undefined && last.color === c.color && (last.bold === true) === c.bold) last.text += c.ch
    else out.push({ text: c.ch, color: c.color, bold: c.bold })
  }
  return out
}

// ---------- the mod ----------

type Options = { refresh?: string; colors?: string; language?: string }

export const register: Register = (on, options) => {
  const opt = (options ?? {}) as Options
  lang = opt.language === 'zh' ? 'zh' : 'en'
  const t = TEXT[lang]
  const refreshMs = Math.max(5, Number(opt.refresh ?? '10') || 10) * 1000
  const isCn = opt.colors === 'cn'
  const UP = isCn ? 'error' : 'success'
  const DOWN = isCn ? 'success' : 'error'
  const dir = (n: number) => (n > 0 ? UP : n < 0 ? DOWN : 'subtle')

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const saved = await $.store.get('symbols').catch(() => undefined)
    if (Array.isArray(saved) && saved.every(s => typeof s === 'string' && SYMBOL.test(s))) {
      await update($, symbols, () => saved as string[])
    }
    await $.command.register({
      name: 'ticker',
      description: t.command,
    })
    // One clock for the tape's motion and the refresh, idle while the pane is closed.
    let lastFetch = 0
    void $.clock.every(FRAME_MS, async () => {
      const isOpen = (await $.ui.panes().catch(() => [])).some(p => p.id === PANE)
      if (!isOpen) return
      await update($, offset, n => ((n ?? 0) + 1) % 1_000_000)
      if (Date.now() - lastFetch >= refreshMs) {
        lastFetch = Date.now()
        void refresh($)
      }
    })
    return started
  })

  on('command.run', { command: 'ticker' }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/[\s,，]+/).filter(Boolean)
    const asked = rest.map(s => s.toUpperCase()).filter(s => SYMBOL.test(s))
    const current = (await read($, symbols)) ?? DEFAULT_SYMBOLS
    if (verb === 'add' || verb === 'rm' || verb === 'remove' || verb === 'del') {
      if (asked.length === 0) return { text: t.usage }
      const next =
        verb === 'add' ? [...current, ...asked.filter(s => !current.includes(s))] : current.filter(s => !asked.includes(s))
      await update($, symbols, () => next)
      await $.store.set('symbols', next)
      await refresh($)
      return { text: t.watchlist(next) }
    }
    const opened = await $.ui.open({ id: PANE, title: t.title })
    // Wait for the first quotes, so the pane opens with prices in it.
    await refresh($)
    return { text: opened.isPlaced ? t.opened : t.notOpened(String(opened.reason)) }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e) as any
    const list = ((await read($, quotes)) ?? []) as Quote[]
    const current = ((await read($, session)) ?? 'closed') as Session
    const sess = { label: t.session[current], color: SESSION_COLOR[current] }
    const at = await read($, updatedAt)
    const err = (await read($, failure)) ?? ''
    const frame = (await read($, offset)) ?? 0
    const columns = Math.max(30, e.props.bodyColumns)
    const sparkWidth = Math.min(24, columns - 42)

    const tape = tapeWindow(
      list.flatMap(q => {
        const change = q.price - q.previousClose
        const pct = q.previousClose === 0 ? 0 : (change / q.previousClose) * 100
        return [
          { text: q.symbol, color: 'text', bold: true },
          { text: ` ${price(q.price)} `, color: 'text' },
          { text: `${change > 0 ? '▲' : change < 0 ? '▼' : '•'}${Math.abs(pct).toFixed(2)}%`, color: dir(change) },
          { text: '   ·   ', color: 'subtle' },
        ]
      }),
      columns,
      frame,
    )

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="row">
            <Text color="claude" bold>
              {t.title}
            </Text>
            {list[0] !== undefined && <Text color="subtle">{t.asOf(exchangeTime(list[0]))}</Text>}
          </Box>
          <Text color={sess.color}>{sess.label}</Text>
        </Box>
        <Text color="subtle">{'─'.repeat(columns)}</Text>

        {tape.length > 0 ? (
          <Box flexDirection="row">
            {tape.map(s => (
              <Text color={s.color} bold={s.bold}>
                {s.text}
              </Text>
            ))}
          </Box>
        ) : (
          <Text color="subtle">{err === '' ? t.fetching : ' '}</Text>
        )}
        <Text color="subtle">{'─'.repeat(columns)}</Text>

        {list.map(q => {
          const change = q.price - q.previousClose
          const pct = q.previousClose === 0 ? 0 : (change / q.previousClose) * 100
          const color = dir(change)
          return (
            <Box key={`row-${q.symbol}`} flexDirection="row">
              <Box width={8}>
                <Button
                  key={`sym-${q.symbol}`}
                  label={q.symbol}
                  plain
                  onPress={() => {
                    void $.prompt.fill({ text: t.ask(q.symbol), mode: 'insert' })
                  }}
                />
              </Box>
              <Box width={11} justifyContent="flex-end">
                <Text color={q.tick === 0 ? 'text' : dir(q.tick)} bold={q.tick !== 0}>
                  {price(q.price)}
                </Text>
              </Box>
              <Box width={9} justifyContent="flex-end">
                <Text color={color}>{signed(change)}</Text>
              </Box>
              <Box width={9} justifyContent="flex-end">
                <Text color={color}>{`${signed(pct)}%`}</Text>
              </Box>
              {sparkWidth >= 6 && (
                <Box marginLeft={2}>
                  <Text color={color}>{sparkline(q.closes, sparkWidth)}</Text>
                </Box>
              )}
            </Box>
          )
        })}

        {err !== '' && <Text color="error">{`⚠ ${err}`}</Text>}
        <Box marginTop={1}>
          <Text color="subtle">
            {t.footer(at === null ? null : clock(at), refreshMs / 1000)}
          </Text>
        </Box>
      </Box>
    )
  })
}
