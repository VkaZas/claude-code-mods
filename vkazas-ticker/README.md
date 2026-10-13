# Ticker (vkazas-ticker)

A live stock pane for your Claude Code terminal. Type `/ticker` and a pane opens beside the transcript: a tape of your watchlist scrolls across the top, and below it every symbol has its price, the day's change in points and percent, and a sparkline of the day. Prices that just moved flash up or down, and pressing a symbol asks Claude how it is doing today.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install vkazas-ticker --marketplace VkaZas/claude-code-mods
```

Answer `y` to add the marketplace, then pick a scope (user is the first). From your shell instead (Claude Code 2.1.292 or later):

```
claude plugin install vkazas-ticker --marketplace VkaZas/claude-code-mods
```

## Using it

| Command | Does |
| --- | --- |
| `/ticker` | Open the pane |
| `/ticker add NVDA TSLA` | Add symbols to the watchlist |
| `/ticker rm TSLA` | Remove symbols |

The watchlist starts as SPY, QQQ, AAPL, MSFT, NVDA, GOOGL, AMZN, TSLA and BTC-USD, and is remembered across sessions once you change it. Any symbol Yahoo Finance knows works: stocks, ETFs, indexes such as `^GSPC`, currencies such as `EURUSD=X`, and crypto such as `ETH-USD`. The top line shows whether the market is open, in pre-market, after hours or closed, and the time of the last trade.

## Settings

| Option | Values | Default |
| --- | --- | --- |
| Refresh (seconds) | 5, 10, 30, 60 | 10 |
| Up and down colors | `us` (green up, red down), `cn` (red up, green down) | `us` |
| Language | `en`, `zh` | `en` |

## Where the prices come from

While the pane is open, and only then, the mod asks Yahoo Finance's public quote endpoint (`query1.finance.yahoo.com/v7/finance/spark`) for your watchlist's symbols at the refresh interval. The request carries the symbols and nothing else: no key, no account, nothing about you or your session. That endpoint is unofficial; Yahoo may delay quotes, limit how often you ask (the pane then shows the error and keeps the last prices) or change it without notice. The prices are for a glance, not for trading decisions.

## What it hooks

- `session.start`: restores your saved watchlist, registers `/ticker`, and starts a quarter-second clock that moves the tape and refreshes the prices, idle while the pane is closed.
- `command.run`, for `/ticker` only: opens the pane, or adds and removes symbols, and answers with one line of text.
- `ui.render` on its own pane: draws the tape, the rows and the footer. Pressing a symbol puts a question about it in your prompt box, for you to send or not.

## Notes

- Ticker is a mod: a hooks module with a pane. It was built and tested with Claude Code 2.1.295 in Windows Terminal.
- The only thing it stores is your watchlist, in the plugin's own store.

## 中文说明

`/ticker` 打开实时行情面板：顶部滚动行情条，下面每只股票有现价、涨跌额、涨跌幅和当日走势小图，刚变动的价格会闪一下，点代码会在输入框里填好"看看它今天的走势"。`/ticker add NVDA TSLA` 加自选，`/ticker rm TSLA` 删除，自选跨会话保存。行情只在面板打开时，按刷新间隔从 Yahoo Finance 的公开接口拉取，只发送股票代码。在 `/config` 里把 Language 设成 `zh` 就是中文，涨跌配色选 `cn` 就是红涨绿跌。

## License

[MIT](LICENSE)
