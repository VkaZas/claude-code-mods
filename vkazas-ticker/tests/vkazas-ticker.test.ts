import { describe, expect, test } from 'claude-code/testing'

// A trimmed copy of Yahoo's v7 spark response, in its real shape.
function spark(rows: { symbol: string; price: number; prev: number; closes: number[] }[]): string {
  return JSON.stringify({
    spark: {
      result: rows.map(r => ({
        symbol: r.symbol,
        response: [
          {
            meta: {
              symbol: r.symbol,
              shortName: r.symbol,
              regularMarketPrice: r.price,
              chartPreviousClose: r.prev,
              regularMarketTime: 1791489600,
              gmtoffset: -14400,
              currentTradingPeriod: {
                pre: { start: 1, end: 2 },
                regular: { start: 0, end: 4_000_000_000 },
                post: { start: 3, end: 4 },
              },
            },
            timestamp: r.closes.map((_, i) => 1791460000 + i * 300),
            indicators: { quote: [{ close: r.closes }] },
          },
        ],
      })),
    },
    error: null,
  })
}

const PANE = {
  component: 'Pane',
  requestId: 'ticker',
  props: {
    title: 'Ticker',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

describe('vkazas-ticker', () => {
  test('quotes show as rows with change, percent and a sparkline', async ($, on) => {
    const urls: string[] = []
    on('http.fetch', ($, e) => {
      urls.push(String((e as any).url))
      return {
        value: {
          status: 200,
          ok: true,
          headers: {},
          text: spark([
            { symbol: 'NVDA', price: 230.48, prev: 237.47, closes: [237, 236, 233, null as any, 231, 230.48] },
            { symbol: 'SPY', price: 780, prev: 777.22, closes: [777, 778, 779, 780] },
          ]),
        },
      } as any
    })
    on('ui.open', () => ({ value: { isPlaced: true } }) as any)
    on('store.set', () => ({ value: undefined }) as any)
    on('store.get', () => ({ value: undefined }) as any)

    await $.command.run({ command: 'ticker', args: 'rm QQQ AAPL MSFT GOOGL AMZN TSLA BTC-USD' } as any)
    const ui = await $.ui.mount({ plugin: 'vkazas-ticker', surface: 'terminal', ...(PANE as any) })

    expect(urls.length).toBeGreaterThan(0)
    expect(urls[0]).toContain('NVDA')
    expect(await ui.find({ key: 'sym-NVDA' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^230\.48$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^−6\.99$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^−2\.94%$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^\+0\.36%$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /[▁▂▃▄▅▆▇█]{3,}/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /● open/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /as of 16:00/ })).toBeDefined()
    await ui.unmount()
  })

  test('a failed fetch says so and keeps the pane up', async ($, on) => {
    on('http.fetch', () => ({ value: { status: 429, ok: false, headers: {}, text: '' } }) as any)
    on('ui.open', () => ({ value: { isPlaced: true } }) as any)
    await $.command.run({ command: 'ticker', args: '' } as any)
    const ui = await $.ui.mount({ plugin: 'vkazas-ticker', surface: 'terminal', ...(PANE as any) })
    expect(await ui.find({ type: 'Text', text: /Fetch failed: Yahoo returned 429/ })).toBeDefined()
    await ui.unmount()
  })

  test('in Chinese when the options say so', { options: { language: 'zh' } }, async ($, on) => {
    on('http.fetch', () => ({ value: { status: 429, ok: false, headers: {}, text: '' } }) as any)
    on('ui.open', () => ({ value: { isPlaced: true } }) as any)
    const said = await $.command.run({ command: 'ticker', args: '' } as any)
    expect((said as any).text).toBe('行情面板已打开。')
    const ui = await $.ui.mount({ plugin: 'vkazas-ticker', surface: 'terminal', ...(PANE as any) })
    expect(await ui.find({ type: 'Text', text: /拉取失败：Yahoo 返回 429/ })).toBeDefined()
    await ui.unmount()
  })
})
