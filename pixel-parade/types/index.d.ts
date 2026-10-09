export type ParadeKind = 'cat' | 'dog'

export type ParadeFilter = 'both' | 'cats' | 'dogs'

export type ParadeStyle = 'pixel' | 'ascii'

export type ParadeCritter = {
  id: number
  kind: ParadeKind
  // Which look of its kind (an index into the sprite lists).
  look: number
  // Column of its left edge in the lane, and which way it faces.
  x: number
  dir: number
  mode: 'walk' | 'idle' | 'sleep' | 'zoom' | 'leave'
  // The frame its mode ends on, and an emote shown above it until a frame.
  until: number
  emote: string
  emoteUntil: number
}

export type ParadeWorld = {
  frame: number
  width: number
  critters: ParadeCritter[]
  nextId: number
}

// Overrides set with /parade, kept across sessions; unset falls back to /config.
export type ParadeSettings = {
  hidden: boolean
  count: number | null
  kind: ParadeFilter | null
  style: ParadeStyle | null
}

declare module 'claude-code' {
  interface PluginState {
    'pixel-parade': {
      world: ParadeWorld
      settings: ParadeSettings
    }
  }
}
