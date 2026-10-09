import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ParadeCritter, ParadeFilter, ParadeKind, ParadeSettings, ParadeStyle, ParadeWorld } from '../types'

const TICK_MS = 200

const EMPTY: ParadeWorld = { frame: 0, width: 60, critters: [], nextId: 1 }
const NO_OVERRIDES: ParadeSettings = { hidden: false, count: null, kind: null, style: null }

const world = atom({ plugin: 'pixel-parade', key: 'world' } as const, EMPTY)
const settings = atom({ plugin: 'pixel-parade', key: 'settings' } as const, NO_OVERRIDES)

// ---------- pixel art ----------
//
// Each animal is 12 by 8 pixels, facing right (mirrored to face left), and
// two pixels share a terminal cell (▀ in the top's color over the bottom's),
// so it stands four rows tall. The letters are channels a look colors in:
// B body, S stripes or patches, W chest and paws, A ears, D tail, M muzzle,
// E eye, C closed eye, N nose.

const PIXEL_W = 12
const PIXEL_H = 8

const CAT_POSES = {
  walk: [
    ['.........A.A', '........BBBB', 'D.......BBEB', 'D......BBBBN', 'D..BSBSBBBW.', '.DBBSBSBBBW.', '..BBBBBBBB..', '..W.W...W.W.'],
    ['.........A.A', '........BBBB', 'D.......BBEB', 'D......BBBBN', 'D..BSBSBBBW.', '.DBBSBSBBBW.', '..BBBBBBBB..', '...WW...WW..'],
  ],
  sit: [
    ['.........A.A', '........BBBB', '........BBEB', '.......BBBBN', '......BSBBW.', '......BSBBW.', '.D...BBSBBW.', '..DDDBBBWBW.'],
    ['.........A.A', '........BBBB', '........BBEB', '.......BBBBN', '......BSBBW.', 'D.....BSBBW.', '.D...BBSBBW.', '..DDDBBBWBW.'],
  ],
  // Curled up, breathing.
  sleep: [
    ['............', '............', '............', '.........A.A', '...BSBSBBBCB', '..BBSBSBBBBN', '..BBBBBBBBB.', '.DDDDDDDDD..'],
    ['............', '............', '............', '.....BB..A.A', '...BSBSBBBCB', '..BBSBSBBBBN', '..BBBBBBBBB.', '.DDDDDDDDD..'],
  ],
}

const DOG_POSES = {
  walk: [
    ['........BB..', '.......BBBBB', 'D......AEBBN', '.D.....ABMM.', '..BBSSBBBW..', '..BBBBBBBW..', '..B.B...B.B.', '..W.W...W.W.'],
    ['........BB..', '.......BBBBB', 'D......AEBBN', '.D.....ABMM.', '..BBSSBBBW..', '..BBBBBBBW..', '...BB...BB..', '..W..W.W..W.'],
  ],
  // Sitting, tail wagging between the two.
  sit: [
    ['........BB..', '.......BBBBB', '.......AEBBN', '.......ABMM.', '......BBBW..', '..D..BBSBW..', '...DBBBSBW..', '....BBBBW.W.'],
    ['........BB..', '.......BBBBB', '.......AEBBN', '.......ABMM.', '......BBBW..', '.....BBSBW..', '.DDDBBBSBW..', '....BBBBW.W.'],
  ],
}

// One nose color per kind, which nothing else uses (the tests count them).
const CAT_NOSE = 0xf48fa0
const DOG_NOSE = 0x141414

// A look's name is at its index in the language's cat or dog names.
type Look = { pal: Record<string, number> }

// A channel a look leaves out is drawn in its body color; -1 is not drawn.
const CAT_LOOKS: Look[] = [
  { pal: { B: 0xf0a050, S: 0xd9822b, W: 0xfbe3c0, D: 0xd9822b, E: 0x2b2b2b, C: 0xb86a25 } },
  { pal: { B: 0x3c3c46, W: 0xf4f4f4, E: 0xf5d547, C: 0x8a8a96 } },
  { pal: { B: 0x34343c, S: 0x2a2a30, E: 0xf5d547, C: 0x6a6a75 } },
  { pal: { B: 0xf1e6d6, W: 0xffffff, A: 0x7a5a45, D: 0x7a5a45, E: 0x4da3ff, C: 0x7a5a45 } },
  { pal: { B: 0xa08c74, S: 0x6e5e4c, W: 0xe8dccb, D: 0x6e5e4c, E: 0x7ac36a, C: 0x4a3f33 } },
  { pal: { B: 0xf7f3ea, S: 0xe8963f, A: 0x2e2e33, D: 0x2e2e33, E: 0x2b2b2b, C: 0x2b2b2b } },
]

const DOG_LOOKS: Look[] = [
  { pal: { B: 0xe58e3e, W: 0xfff0da, M: 0xfff0da, E: 0x2b2b2b } },
  { pal: { B: 0xe6bc6e, W: 0xf2d49a, A: 0xc9963f, E: 0x2b2b2b } },
  { pal: { B: 0x45454f, W: 0xf2f2f2, M: 0xf2f2f2, E: 0xc9a86a } },
  { pal: { B: 0xf7f7f2, W: 0xffffff, A: 0xdadad0, E: 0x222222 } },
  { pal: { B: 0xe8964a, W: 0xfff6ea, M: 0xfff6ea, D: -1, E: 0x2b2b2b } },
  { pal: { B: 0x8c929c, S: 0x5e646e, W: 0xf2f2f2, A: 0x5e646e, M: 0xf2f2f2, E: 0x6fb7ff } },
]

// Emotes in pixels, drawn in the free space behind the head.
const HEART = ['HH.HH', 'HHHHH', '.HHH.', '..H..']
const NOTE = ['.HH', '.H.', 'HH.', 'HH.']
const HEART_COLOR = 0xff4d6d
const NOTE_COLOR = 0xb48eff
const GLYPH_COLOR: Record<string, number> = { '!': 0xff5a5a, '?': 0x7fc8f8, z: 0x9aa0b4, Z: 0x9aa0b4 }
const DUST = [0x8a8a96, 0x5a5a66]

// The terminal's own color, for a cell's empty half.
const TERMINAL = 0x01000000

const ASCII: Record<ParadeKind, string[]> = { cat: ['=^.^=', '=^..^='], dog: ['U^ᴥ^U', '(ᵔᴥᵔ)'] }
const ASCII_COLOR: Record<ParadeKind, string> = { cat: '#F2B880', dog: '#C8A27A' }
const EMOTE_COLOR: Record<string, string> = { '♡': '#FF7A90', '!': '#FF6B6B', '?': '#7FC8F8', '♪': '#B48EFF' }

// ---------- words, in the language the options choose ----------

type Lang = 'en' | 'zh'

const TEXT = {
  en: {
    command:
      'Pixel cats and dogs above the prompt: /parade to show or hide, /parade 5 for how many, /parade cats|dogs|both, /parade pixel|ascii, /parade status for who is out',
    cats: ['orange tabby', 'tuxedo cat', 'black cat', 'ragdoll', 'brown tabby', 'calico'],
    dogs: ['shiba', 'golden retriever', 'border collie', 'samoyed', 'corgi', 'husky'],
    mode: { walk: 'strolling', idle: 'sitting', sleep: 'napping', zoom: 'zooming', leave: 'leaving' },
    countRange: 'The count goes from 1 to 12.',
    count: (n: number) => `Parade size: ${n}`,
    kind: { cats: 'Cats only.', dogs: 'Dogs only.', both: 'Cats and dogs.' },
    pixel: 'Pixel art it is.',
    ascii: 'Drawn in characters now.',
    reset: (c: Config) => `Back to the /config settings: ${c.count}, ${c.kind}, ${c.style}`,
    hidden: 'The parade is put away. Type /parade to bring it back.',
    shown: 'The parade is on.',
    none: 'Nobody is out.',
    out: (who: string[]) => `${who.length} out: ${who.join(', ')}`,
    going: (who: string[]) => `; ${who.join(', ')} leaving`,
    named: (name: string, mode: string) => `${name} (${mode})`,
  },
  zh: {
    command:
      '提示框上方的像素猫狗巡游：/parade 显示或隐藏，/parade 5 设数量，/parade cats|dogs|both，/parade pixel|ascii，/parade status 看看都有谁',
    cats: ['橘猫', '奶牛猫', '黑猫', '布偶', '狸花', '三花'],
    dogs: ['柴犬', '金毛', '边牧', '萨摩耶', '柯基', '哈士奇'],
    mode: { walk: '散步', idle: '坐着', sleep: '打盹', zoom: '疯跑', leave: '离开中' },
    countRange: '数量请在 1 到 12 之间。',
    count: (n: number) => `巡游数量：${n}`,
    kind: { cats: '只要猫了。', dogs: '只要狗了。', both: '猫狗都有。' },
    pixel: '换成像素画。',
    ascii: '换成字符样式。',
    reset: (c: Config) => `恢复 /config 里的设置：${c.count} 只，${c.kind}，${c.style}`,
    hidden: '巡游收起来了。再输入 /parade 放出来。',
    shown: '巡游开始。',
    none: '一只都没有。',
    out: (who: string[]) => `现在有 ${who.length} 只：${who.join('、')}`,
    going: (who: string[]) => `；${who.join('、')} 正在离开`,
    named: (name: string, mode: string) => `${name}（${mode}）`,
  },
}

let lang: Lang = 'en'

function nameOf(c: ParadeCritter): string {
  const names = c.kind === 'cat' ? TEXT[lang].cats : TEXT[lang].dogs
  return names[c.look % names.length]
}

// ---------- settings: /config gives the defaults, /parade overrides them ----------

type Config = { count: number; kind: ParadeFilter; style: ParadeStyle }

let defaults: Config = { count: 3, kind: 'both', style: 'pixel' }
let laneWidth = 60

// Overrides as saved, with a style from an older version dropped.
function normSettings(s: unknown): ParadeSettings {
  const v = { ...NO_OVERRIDES, ...((s ?? {}) as Partial<ParadeSettings>) }
  if (v.style !== 'pixel' && v.style !== 'ascii') v.style = null
  return v
}

function effective(s: ParadeSettings): Config {
  return {
    count: s.count ?? defaults.count,
    kind: s.kind ?? defaults.kind,
    style: s.style ?? defaults.style,
  }
}

function allowed(kind: ParadeKind, filter: ParadeFilter): boolean {
  return filter === 'both' || (filter === 'cats' ? kind === 'cat' : kind === 'dog')
}

function lookOf(c: ParadeCritter): Look {
  const looks = c.kind === 'cat' ? CAT_LOOKS : DOG_LOOKS
  return looks[c.look % looks.length]
}

function asciiSprite(c: ParadeCritter): string {
  return ASCII[c.kind][c.look % ASCII[c.kind].length]
}

function cells(text: string): number {
  return [...text].length
}

// How many columns an animal takes in a style.
function bodyWidth(c: ParadeCritter, style: ParadeStyle): number {
  return style === 'pixel' ? PIXEL_W : cells(asciiSprite(c))
}

// ---------- the world, one tick at a time ----------

const MEET_COOLDOWN = 40

function rand(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1))
}

function spawn(w: ParadeWorld, cfg: Config, entering: boolean, at?: number): ParadeCritter {
  const kinds: ParadeKind[] = cfg.kind === 'cats' ? ['cat'] : cfg.kind === 'dogs' ? ['dog'] : ['cat', 'dog']
  const kind = kinds[rand(0, kinds.length - 1)]
  const dir = Math.random() < 0.5 ? -1 : 1
  const span = cfg.style === 'pixel' ? PIXEL_W : 6
  const x = entering ? (dir > 0 ? -span : w.width) : (at ?? rand(0, Math.max(0, w.width - span)))
  return { id: w.nextId, kind, look: rand(0, 5), x, dir, mode: 'walk', until: 0, emote: '', emoteUntil: 0 }
}

// Those the settings no longer want (another kind, past the count) head for the nearest edge.
function retire(critters: ParadeCritter[], cfg: Config, width: number) {
  const send = (c: ParadeCritter) => {
    c.mode = 'leave'
    c.dir = c.x < width / 2 ? -1 : 1
  }
  for (const c of critters) if (c.mode !== 'leave' && !allowed(c.kind, cfg.kind)) send(c)
  for (const c of critters.filter(c => c.mode !== 'leave').slice(cfg.count)) send(c)
}

// The middle of the widest stretch of lane nobody stands on.
function freeSpot(critters: ParadeCritter[], width: number, span: number): number {
  let best = { start: 0, len: -1 }
  let edge = 0
  for (const x of [...critters.map(c => c.x).sort((a, b) => a - b), width]) {
    if (x - edge > best.len) best = { start: edge, len: x - edge }
    edge = Math.max(edge, x + span)
  }
  return Math.max(0, Math.min(width - span, best.start + Math.floor((best.len - span) / 2)))
}

// Fill to the count at once (on start, and when the settings change).
function populate(w: ParadeWorld, cfg: Config): ParadeWorld {
  const next = { ...w, critters: w.critters.map(c => ({ ...c })) }
  retire(next.critters, cfg, next.width)
  const span = cfg.style === 'pixel' ? PIXEL_W : 6
  while (next.critters.filter(c => c.mode !== 'leave').length < cfg.count) {
    next.critters.push(spawn(next, cfg, false, freeSpot(next.critters, next.width, span)))
    next.nextId += 1
  }
  return next
}

// Walking toward the other, or standing still beside it.
function heading(p: ParadeCritter, q: ParadeCritter): boolean {
  return p.mode === 'idle' || p.mode === 'sleep' || (q.x - p.x) * p.dir > 0
}

function stepWorld(w: ParadeWorld, cfg: Config): ParadeWorld {
  const frame = w.frame + 1
  const width = laneWidth
  let nextId = w.nextId
  let critters = w.critters.map(c => ({ ...c }))

  retire(critters, cfg, width)

  for (const c of critters) {
    const bw = bodyWidth(c, cfg.style)
    switch (c.mode) {
      case 'walk':
        if (c.kind === 'dog' || frame % 2 === 0) c.x += c.dir
        if (Math.random() < 0.02) {
          c.mode = 'idle'
          c.until = frame + rand(10, 30)
        } else if (c.kind === 'dog' && Math.random() < 0.01) {
          c.mode = 'zoom'
          c.until = frame + rand(12, 25)
        } else if (Math.random() < 0.01) c.dir = -c.dir
        break
      case 'zoom':
        c.x += c.dir * 2
        if (frame >= c.until) c.mode = 'walk'
        break
      case 'idle':
        if (frame >= c.until) {
          if (c.kind === 'cat' && Math.random() < 0.3) {
            c.mode = 'sleep'
            c.until = frame + rand(50, 120)
          } else {
            c.mode = 'walk'
            if (Math.random() < 0.4) c.dir = -c.dir
          }
        } else if (frame > c.emoteUntil && Math.random() < 0.015) {
          c.emote = Math.random() < 0.5 ? '♪' : '?'
          c.emoteUntil = frame + 8
        }
        break
      case 'sleep':
        if (frame >= c.until) c.mode = 'walk'
        break
      case 'leave':
        c.x += c.dir * (c.kind === 'dog' ? 1 : frame % 2)
        break
    }
    // The edges, reached going outward (a newcomer walks in from beyond one):
    // mostly turn back, sometimes wander off for good.
    const outward = (c.x < 0 && c.dir < 0) || (c.x + bw > width && c.dir > 0)
    if (c.mode !== 'leave' && outward) {
      if (Math.random() < 0.6) {
        c.dir = -c.dir
        c.x = Math.max(0, Math.min(width - bw, c.x))
      } else c.mode = 'leave'
    }
  }

  // Meetings: a dog near a cat sends the cat running (and sometimes gives
  // chase); two of a kind sit down face to face and share a heart.
  for (let i = 0; i < critters.length; i++) {
    for (let j = i + 1; j < critters.length; j++) {
      const a = critters[i]
      const b = critters[j]
      if (a.mode === 'leave' || b.mode === 'leave') continue
      if (Math.abs(a.x - b.x) > Math.max(bodyWidth(a, cfg.style), bodyWidth(b, cfg.style)) + 1) continue
      if (frame < a.emoteUntil + MEET_COOLDOWN || frame < b.emoteUntil + MEET_COOLDOWN) continue
      if (a.kind !== b.kind) {
        const cat = a.kind === 'cat' ? a : b
        const dog = a.kind === 'dog' ? a : b
        if (!heading(dog, cat)) continue
        cat.emote = '!'
        cat.emoteUntil = frame + 8
        cat.mode = 'zoom'
        cat.dir = cat.x >= dog.x ? 1 : -1
        cat.until = frame + 12
        dog.emote = '♪'
        dog.emoteUntil = frame + 8
        if (Math.random() < 0.4) {
          dog.mode = 'zoom'
          dog.dir = cat.dir
          dog.until = frame + 8
        }
      } else if (a.mode !== 'sleep' && b.mode !== 'sleep' && heading(a, b) && heading(b, a)) {
        a.dir = b.x >= a.x ? 1 : -1
        b.dir = -a.dir
        for (const c of [a, b]) {
          c.emote = '♡'
          c.emoteUntil = frame + 10
          c.mode = 'idle'
          c.until = frame + 10
        }
      }
    }
  }

  // Gone off the edge, gone; and now and then someone new wanders in.
  critters = critters.filter(c => !(c.mode === 'leave' && (c.x + bodyWidth(c, cfg.style) < -1 || c.x > width + 1)))
  if (critters.filter(c => c.mode !== 'leave').length < cfg.count && Math.random() < 0.1) {
    critters.push(spawn({ ...w, width, nextId }, cfg, true))
    nextId += 1
  }
  return { frame, width, critters, nextId }
}

// ---------- effects on $ (top level, as the loader asks) ----------

async function step($: EngineInterface) {
  const s = normSettings(await read($, settings))
  if (s.hidden) return
  const cfg = effective(s)
  await update($, world, w => stepWorld({ ...EMPTY, ...(w ?? {}) }, cfg))
}

async function applySettings($: EngineInterface, change: Partial<ParadeSettings>) {
  await update($, settings, s => ({ ...normSettings(s), ...change }))
  const s = normSettings(await read($, settings))
  try {
    await $.store.set('settings', s)
  } catch {
    // remembering is best effort
  }
  await update($, world, w => populate({ ...EMPTY, ...(w ?? {}), width: laneWidth }, effective(s)))
  return effective(s)
}

async function start($: EngineInterface) {
  try {
    const saved = await $.store.get('settings')
    if (saved !== undefined && typeof saved === 'object') await update($, settings, () => normSettings(saved))
  } catch {
    // no saved overrides
  }
  const s = normSettings(await read($, settings))
  await update($, world, w => populate({ ...EMPTY, ...(w ?? {}), width: laneWidth }, effective(s)))
  void $.clock.every(TICK_MS, () => step($))
}

// ---------- drawing pixels ----------

function pose(c: ParadeCritter, frame: number): string[] {
  if (c.kind === 'cat' && c.mode === 'sleep') return CAT_POSES.sleep[(frame >> 3) & 1]
  const poses = c.kind === 'cat' ? CAT_POSES : DOG_POSES
  if (c.mode === 'idle' || c.mode === 'sleep') {
    // A dog wags, faster when happy; a cat's tail flicks now and then.
    const happy = frame < c.emoteUntil && (c.emote === '♡' || c.emote === '♪')
    const beat = c.kind === 'dog' ? (happy ? frame : frame >> 1) : frame >> 3
    return poses.sit[beat & 1]
  }
  // Legs swap on each step: a cat steps every other tick, a dog every tick.
  const beat = c.mode === 'zoom' || c.kind === 'dog' ? frame : frame >> 1
  return poses.walk[beat & 1]
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// Standard padded base64.
function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63]
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '='
    out += i + 2 < bytes.length ? B64[n & 63] : '='
  }
  return out
}

// The lane as a Raster's cells: PIXEL_H / 2 rows of `width` cells.
function paint(w: ParadeWorld, width: number): string {
  const px = new Int32Array(width * PIXEL_H).fill(-1)
  const glyphs = new Map<number, { ch: number; fg: number }>()
  const dot = (x: number, y: number, color: number) => {
    if (color >= 0 && x >= 0 && x < width && y >= 0 && y < PIXEL_H) px[y * width + x] = color
  }
  const glyph = (x: number, row: number, ch: string) => {
    if (x >= 0 && x < width) glyphs.set(row * width + x, { ch: ch.charCodeAt(0), fg: GLYPH_COLOR[ch] ?? 0xffffff })
  }
  // Where a shape `size` wide, at `col` of a right-facing sprite, falls for this one.
  const at = (c: ParadeCritter, col: number, size: number) => c.x + (c.dir < 0 ? PIXEL_W - col - size : col)
  const shape = (x: number, rows: string[], color: number) =>
    rows.forEach((row, y) => [...row].forEach((ch, i) => ch !== '.' && dot(x + i, y, color)))

  for (const c of w.critters) {
    const look = lookOf(c)
    const nose = c.kind === 'cat' ? CAT_NOSE : DOG_NOSE
    pose(c, w.frame).forEach((row, y) => {
      for (let i = 0; i < PIXEL_W; i++) {
        const ch = row[i]
        if (ch === '.') continue
        const color = ch === 'N' ? nose : (look.pal[ch] ?? look.pal.B)
        dot(c.x + (c.dir < 0 ? PIXEL_W - 1 - i : i), y, color)
      }
    })
    if (c.mode === 'zoom') {
      // Dust kicked up behind.
      const back = c.dir > 0 ? c.x - 2 : c.x + PIXEL_W + 1
      dot(back, PIXEL_H - 1, DUST[0])
      dot(back - c.dir * 2, PIXEL_H - 1 - (w.frame & 1), DUST[1])
    }
  }

  // Emotes go over everyone.
  for (const c of w.critters) {
    if (c.kind === 'cat' && c.mode === 'sleep') {
      const zs = ['z', 'zZ', 'zZz'][(w.frame >> 2) % 3]
      ;[...zs].forEach((ch, i) => glyph(at(c, 8, 3) + i, 0, ch))
      continue
    }
    if (w.frame >= c.emoteUntil) continue
    if (c.emote === '♡') shape(at(c, 2, 5), HEART, HEART_COLOR)
    else if (c.emote === '♪') shape(at(c, 4, 3), NOTE, NOTE_COLOR)
    else if (c.emote === '!' || c.emote === '?') glyph(at(c, 6, 1), 0, c.emote)
  }

  const rows = PIXEL_H / 2
  const view = new DataView(new ArrayBuffer(width * rows * 12))
  let o = 0
  for (let r = 0; r < rows; r++) {
    for (let x = 0; x < width; x++) {
      const top = px[2 * r * width + x]
      const bottom = px[(2 * r + 1) * width + x]
      const g = glyphs.get(r * width + x)
      let cell = [0x20, TERMINAL, TERMINAL]
      if (g !== undefined) cell = [g.ch, g.fg, TERMINAL]
      else if (top >= 0 && bottom >= 0) cell = top === bottom ? [0x2588, top, TERMINAL] : [0x2580, top, bottom]
      else if (top >= 0) cell = [0x2580, top, TERMINAL]
      else if (bottom >= 0) cell = [0x2584, bottom, TERMINAL]
      for (const v of cell) {
        view.setUint32(o, v, true)
        o += 4
      }
    }
  }
  return base64(new Uint8Array(view.buffer))
}

// ---------- drawing characters (the ascii style) ----------

type Seg = { text: string; color?: string }

// Place items on a row of `width` cells; anything not wholly inside is left out.
function place(items: { x: number; text: string; color?: string }[], width: number): Seg[] {
  const out: Seg[] = []
  let at = 0
  for (const i of [...items].sort((a, b) => a.x - b.x)) {
    const w = cells(i.text)
    if (i.x < at || i.x < 0 || i.x + w > width) continue
    if (i.x > at) out.push({ text: ' '.repeat(i.x - at) })
    out.push({ text: i.text, color: i.color })
    at = i.x + w
  }
  if (at < width) out.push({ text: ' '.repeat(width - at) })
  return out
}

function asciiRows(w: ParadeWorld): { emotes: Seg[]; bodies: Seg[] } {
  const emotes: { x: number; text: string; color?: string }[] = []
  const bodies: { x: number; text: string; color?: string }[] = []
  for (const c of w.critters) {
    const look = asciiSprite(c)
    bodies.push({ x: c.x, text: look, color: ASCII_COLOR[c.kind] })
    if (c.mode === 'zoom') bodies.push({ x: c.dir > 0 ? c.x - 3 : c.x + cells(look) + 1, text: '··', color: 'subtle' })
    const emote =
      c.mode === 'sleep' ? ['z', 'zZ', 'zZz'][Math.floor(w.frame / 4) % 3] : w.frame < c.emoteUntil ? c.emote : ''
    if (emote !== '') emotes.push({ x: c.x + 1, text: emote, color: EMOTE_COLOR[emote] ?? 'subtle' })
  }
  return { emotes: place(emotes, laneWidth), bodies: place(bodies, laneWidth) }
}

// ---------- the mod ----------

type Options = { count?: string; kind?: string; style?: string; language?: string }

export const register: Register = (on, options) => {
  const opt = (options ?? {}) as Options
  defaults = {
    count: Math.max(1, Math.min(8, Number(opt.count ?? '3') || 3)),
    kind: opt.kind === 'cats' || opt.kind === 'dogs' ? opt.kind : 'both',
    style: opt.style === 'ascii' ? 'ascii' : 'pixel',
  }
  lang = opt.language === 'zh' ? 'zh' : 'en'
  const t = TEXT[lang]

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'parade',
      description: t.command,
    })
    await start($)
    return started
  })

  on('command.run', { command: 'parade' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const n = Number(arg)
    if (arg !== '' && Number.isInteger(n)) {
      if (n < 1 || n > 12) return { text: t.countRange }
      const cfg = await applySettings($, { count: n, hidden: false })
      return { text: t.count(cfg.count) }
    }
    if (arg === 'cats' || arg === '猫' || arg === 'dogs' || arg === '狗' || arg === 'both' || arg === '都要') {
      const kind: ParadeFilter = arg === 'cats' || arg === '猫' ? 'cats' : arg === 'dogs' || arg === '狗' ? 'dogs' : 'both'
      await applySettings($, { kind, hidden: false })
      return { text: t.kind[kind] }
    }
    if (arg === 'pixel' || arg === '像素' || arg === 'emoji') {
      await applySettings($, { style: 'pixel', hidden: false })
      return { text: t.pixel }
    }
    if (arg === 'ascii' || arg === '字符') {
      await applySettings($, { style: 'ascii', hidden: false })
      return { text: t.ascii }
    }
    if (arg === 'reset') {
      const cfg = await applySettings($, { count: null, kind: null, style: null })
      return { text: t.reset(cfg) }
    }
    if (arg === 'status' || arg === 'list' || arg === '谁') {
      const w = { ...EMPTY, ...((await read($, world)) ?? {}) } as ParadeWorld
      const s = normSettings(await read($, settings))
      if (s.hidden) return { text: t.hidden }
      const out = w.critters.filter(c => c.mode !== 'leave')
      const going = w.critters.filter(c => c.mode === 'leave').map(nameOf)
      const text = out.length === 0 ? t.none : t.out(out.map(c => t.named(nameOf(c), t.mode[c.mode])))
      return { text: going.length === 0 ? text : text + t.going(going) }
    }
    const s = normSettings(await read($, settings))
    const hidden = arg === 'hide' ? true : arg === 'show' ? false : !s.hidden
    await applySettings($, { hidden })
    return { text: hidden ? t.hidden : t.shown }
  })

  // Above the prompt, on top of whatever else draws there.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Nothing may answer beneath (a test, an engine that draws nothing there).
    const below = await next(e).catch(() => null)
    if (e.props.hasSurvey) return below
    try {
      laneWidth = Math.max(20, Math.min(512, e.props.bodyColumns - 2))
      const s = normSettings(await read($, settings))
      const w = { ...EMPTY, ...((await read($, world)) ?? {}) } as ParadeWorld
      if (s.hidden || w.critters.length === 0) return below
      const ui = $.ui.resolve(e) as any
      const { Box, Text } = ui

      let lane
      // Pixels need a terminal; anywhere else the animals are drawn in characters.
      if (effective(s).style === 'pixel' && e.surface === 'terminal' && ui.Raster !== undefined) {
        lane = (
          <Box flexDirection="column" paddingX={1}>
            {ui.Raster({ key: 'parade-lane', columns: laneWidth, rows: PIXEL_H / 2, cells: paint(w, laneWidth) })}
          </Box>
        )
      } else {
        const { emotes, bodies } = asciiRows(w)
        const row = (segs: Seg[]) => (
          <Box flexDirection="row">
            {segs.map(seg => (
              <Text color={seg.color}>{seg.text}</Text>
            ))}
          </Box>
        )
        lane = (
          <Box flexDirection="column" paddingX={1}>
            {row(emotes)}
            {row(bodies)}
          </Box>
        )
      }
      if (below === null || below === undefined) return lane
      return (
        <Box flexDirection="column">
          {lane}
          {below}
        </Box>
      )
    } catch {
      return below
    }
  })
}
