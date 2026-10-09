import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ComboView } from '../types'

const FRAME_MS = 50
const BREAK_MS = 1500
const SHOW_END_MS = 1500
const WINDOW_MS = 1000
const MILESTONE_MS = 450
const BASE_LEFT = 7

const IDLE: ComboView = {
  count: 0,
  best: 0,
  kps: 0,
  level: 0,
  lastKeyAt: 0,
  hitDir: 1,
  hitPower: 0,
  milestoneAt: 0,
  milestone: '',
  endedAt: 0,
  ended: 0,
}

const view = atom({ plugin: 'typing-combo', key: 'view' } as const, IDLE)
const tick = atom({ plugin: 'typing-combo', key: 'tick' } as const, 0)

// Faster typing, hotter colour, harder hits.
const LEVEL_COLOR = ['#E8E8E8', '#7FC8F8', '#FFD54F', '#FF9F43', '#FF4D4D']
const POWER = [1, 2, 3, 4, 6]
// A hit: out, back past rest, settle. One entry per frame after the key.
const SPRING = [1, -0.55, 0.3, -0.12, 0]
const MILESTONE_SPRING = [1, -0.8, 0.6, -0.4, 0.2, -0.1, 0]
const SPARKS = ['✦', '*', '+', '✧', '·']
// Hit-stop: the hit frame holds before the knockback plays, longer for harder hits.
const HITSTOP_MS = [30, 40, 55, 70, 85]
const MILESTONE_HITSTOP_MS = 140

// Which frame of a hit this moment is: held at 0 through the hit-stop, then the spring.
function frameAt(elapsed: number, hitstop: number): number {
  return elapsed < hitstop ? 0 : 1 + Math.floor((elapsed - hitstop) / FRAME_MS)
}

// The words on the band, in the language the options choose.
type Lang = 'en' | 'zh'

const TEXT = {
  en: { ranks: ['GODLIKE!!!!', 'INSANE!!!', 'AMAZING!!', 'NICE!', 'GOOD'], ended: 'COMBO END', kps: 'keys/s', best: 'best' },
  zh: { ranks: ['神之手！！！！', '疯狂！！！', '太强了！！', '漂亮！', '不错'], ended: '连击结束', kps: '键/秒', best: '最高' },
}

// The counts each rank starts at, highest first.
const RANK_AT = [200, 100, 50, 25, 10]

let lang: Lang = 'en'

// Three rows per digit, three cells wide.
const DIGITS: Record<string, [string, string, string]> = {
  '0': ['█▀█', '█ █', '█▄█'],
  '1': ['▄█ ', ' █ ', '▄█▄'],
  '2': ['▀▀█', '█▀▀', '█▄▄'],
  '3': ['▀▀█', ' ▀█', '▄▄█'],
  '4': ['█ █', '▀▀█', '  █'],
  '5': ['█▀▀', '▀▀█', '▄▄█'],
  '6': ['█▀▀', '█▀█', '█▄█'],
  '7': ['▀▀█', '  █', '  █'],
  '8': ['█▀█', '█▀█', '█▄█'],
  '9': ['█▀█', '▀▀█', '▄▄█'],
}

function bigDigits(n: number, heavy: boolean): [string, string, string] {
  const rows: [string, string, string] = ['', '', '']
  for (const ch of String(n)) {
    const d = DIGITS[ch]
    for (let r = 0; r < 3; r++) rows[r] += `${heavy ? d[r].replace(/[▀▄]/g, '█') : d[r]} `
  }
  return rows
}

function levelOf(kps: number): number {
  return kps < 2 ? 0 : kps < 4 ? 1 : kps < 6 ? 2 : kps < 9 ? 3 : 4
}

function rankOf(count: number): string {
  const i = RANK_AT.findIndex(at => count >= at)
  return i < 0 ? '' : TEXT[lang].ranks[i]
}

// ---------- module state (a reload starts these over) ----------

let times: number[] = []
let best = 0
let bestLoaded = false

async function loadBest($: EngineInterface) {
  if (bestLoaded) return
  bestLoaded = true
  try {
    const saved = await $.store.get('best')
    if (typeof saved === 'number') best = saved
  } catch {
    // a fresh record is fine
  }
}

async function endCombo($: EngineInterface) {
  const v = { ...IDLE, ...((await read($, view)) ?? {}) }
  if (v.count === 0) return
  times = []
  if (v.count > best) {
    best = v.count
    try {
      await $.store.set('best', best)
    } catch {
      // the record is best effort
    }
  }
  await update($, view, () => ({ ...IDLE, best, endedAt: Date.now(), ended: v.count }))
}

async function keyed($: EngineInterface, typed: number) {
  await loadBest($)
  const now = Date.now()
  times = [...times.filter(t => now - t < WINDOW_MS), ...Array.from({ length: typed }, () => now)]
  const kps = times.length / (WINDOW_MS / 1000)
  const level = levelOf(kps)
  await update($, view, v => {
    const cur = { ...IDLE, ...(v ?? {}) }
    const before = now - cur.lastKeyAt < BREAK_MS ? cur.count : 0
    const count = before + typed
    // Every ten, and every new rank, is a milestone.
    const rank = rankOf(count)
    const isMilestone = Math.floor(count / 10) > Math.floor(before / 10) || rank !== rankOf(before)
    return {
      ...cur,
      count,
      kps,
      level,
      lastKeyAt: now,
      // Hits land left, right, left: each one knocks the other way.
      hitDir: -cur.hitDir || 1,
      hitPower: POWER[level],
      milestoneAt: isMilestone ? now : cur.milestoneAt,
      milestone: isMilestone ? (rank !== rankOf(before) ? rank : `${Math.floor(count / 10) * 10}!`) : cur.milestone,
      best: Math.max(best, cur.best),
      endedAt: 0,
      ended: 0,
    }
  })
}

// While a combo runs or its ending shows, the frame clock plays the hits out.
async function frame($: EngineInterface) {
  const v = { ...IDLE, ...((await read($, view)) ?? {}) }
  const now = Date.now()
  if (v.count > 0 && now - v.lastKeyAt >= BREAK_MS) {
    await endCombo($)
    return
  }
  if (v.count > 0) {
    const kps = times.filter(t => now - t < WINDOW_MS).length / (WINDOW_MS / 1000)
    if (levelOf(kps) !== v.level || Math.abs(kps - v.kps) >= 0.5) {
      await update($, view, s => ({ ...IDLE, ...(s ?? {}), kps, level: levelOf(kps) }))
    }
    // Only while a hit or a milestone is still moving is there anything to draw.
    const moving =
      now - v.lastKeyAt < HITSTOP_MS[v.level] + FRAME_MS * SPRING.length ||
      now - v.milestoneAt < MILESTONE_HITSTOP_MS + FRAME_MS * MILESTONE_SPRING.length
    if (moving) await update($, tick, n => ((n ?? 0) + 1) % 1_000_000)
  } else if (v.endedAt > 0) {
    if (now - v.endedAt > SHOW_END_MS) await update($, view, s => ({ ...IDLE, ...(s ?? {}), endedAt: 0, ended: 0 }))
  }
}

// ---------- the mod ----------

export const register: Register = (on, options) => {
  lang = (options as { language?: string } | undefined)?.language === 'zh' ? 'zh' : 'en'

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await loadBest($)
    await update($, view, v => ({ ...IDLE, ...(v ?? {}), best }))
    void $.clock.every(FRAME_MS, () => frame($))
    return started
  })

  // Every keystroke in the prompt box: count it, and light up what was typed.
  on('prompt.edit', async ($, e, next) => {
    const result = await next(e)
    const isPaste = e.key === undefined && e.inputText.length > 2
    if (e.inputText.length === 0 || isPaste) return result
    await keyed($, Math.min(e.inputText.length, 4))
    const v = { ...IDLE, ...((await read($, view)) ?? {}) }
    if (v.level === 0) return result
    // The characters just typed, in the combo's colour.
    const end = result.cursor
    const start = Math.max(0, end - e.inputText.length)
    return {
      ...result,
      decorations: [...(result.decorations ?? []), { start, end, color: LEVEL_COLOR[v.level], bold: true }],
    }
  }).catch(($, e, next) => next(e))

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'composer') await endCombo($)
    return next(e)
  }).catch(($, e, next) => next(e))

  // Above the prompt, on top of whatever else draws there.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Nothing may answer beneath (a test, an engine that draws nothing there).
    const below = await next(e).catch(() => null)
    if (e.props.hasSurvey) return below
    try {
      const v = { ...IDLE, ...((await read($, view)) ?? {}) }
      // Reading the tick redraws this band on every frame a hit is moving.
      await read($, tick)
      const showing = v.count > 0 ? v.count : v.endedAt > 0 ? v.ended : 0
      if (showing === 0) return below
      const { Box, Text } = $.ui.resolve(e) as any
      const now = Date.now()
      const isEnding = v.count === 0

      // Which frame of the last hit, and of the last milestone, this is.
      const f = isEnding ? SPRING.length : frameAt(now - v.lastKeyAt, HITSTOP_MS[v.level])
      const mf = isEnding ? MILESTONE_SPRING.length : frameAt(now - v.milestoneAt, MILESTONE_HITSTOP_MS)
      const isHit = f === 0
      const isMilestone = mf < MILESTONE_SPRING.length && now - v.milestoneAt < MILESTONE_HITSTOP_MS + MILESTONE_MS
      const knock = Math.round(v.hitDir * v.hitPower * (SPRING[f] ?? 0))
      const quake = isMilestone ? Math.round(-v.hitDir * 6 * (MILESTONE_SPRING[mf] ?? 0)) : 0
      const left = Math.max(0, BASE_LEFT + knock + quake)

      const level = isEnding ? 0 : v.level
      const color = isEnding ? 'subtle' : LEVEL_COLOR[level]
      // The hit frame flashes inverted, the next one white, then the level's colour.
      const flash = !isEnding && (isHit || (isMilestone && mf < 2))
      const digitColor = flash ? color : f === 1 && !isEnding ? '#FFFFFF' : color
      const digits = bigDigits(showing, isHit && !isEnding)
      const sparks =
        isMilestone || level >= 3
          ? Array.from({ length: isMilestone ? 6 : level }, () => SPARKS[Math.floor(Math.random() * SPARKS.length)]).join(' ')
          : ''
      const rank = rankOf(showing)
      const meter = '▮'.repeat(level + 1) + '▯'.repeat(4 - level)

      const combo = (
        <Box flexDirection="row" marginLeft={left}>
          <Box flexDirection="column">
            {digits.map(s => (
              <Text color={digitColor} bold inverse={flash}>
                {s}
              </Text>
            ))}
          </Box>
          <Box flexDirection="column" marginLeft={1}>
            <Box flexDirection="row">
              <Text color={color} bold inverse={isMilestone && mf < 2}>
                {isEnding ? TEXT[lang].ended : isMilestone ? ` ${v.milestone} ` : 'COMBO'}
              </Text>
              {sparks !== '' && <Text color={LEVEL_COLOR[2]}>{`  ${sparks}`}</Text>}
            </Box>
            <Text color={isEnding ? 'subtle' : color}>
              {isEnding ? `x${showing}${rank === '' ? '' : `  ${rank}`}` : `x ${rank}${rank === '' ? '' : '  '}${v.kps.toFixed(1)} ${TEXT[lang].kps}`}
            </Text>
            <Box flexDirection="row">
              {!isEnding && <Text color={color}>{meter}</Text>}
              <Text color="subtle">{`${isEnding ? '' : '  '}${TEXT[lang].best} ${Math.max(best, v.best, showing)}`}</Text>
            </Box>
          </Box>
        </Box>
      )
      if (below === null || below === undefined) return combo
      return (
        <Box flexDirection="column">
          {combo}
          {below}
        </Box>
      )
    } catch {
      return below
    }
  })
}
