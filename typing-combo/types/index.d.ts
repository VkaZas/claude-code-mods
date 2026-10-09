export type ComboView = {
  // Keys in the running combo; 0 when none runs.
  count: number
  best: number
  // Keys per second over the last second, and the level it maps to (0–4).
  kps: number
  level: number
  lastKeyAt: number
  // The last hit's knockback: which way (1 right, -1 left) and how far, in cells.
  hitDir: number
  hitPower: number
  // A milestone (every 10, or a new rank): when, and what it shouts.
  milestoneAt: number
  milestone: string
  // When the last combo ended, and how many it reached (shown briefly).
  endedAt: number
  ended: number
}

declare module 'claude-code' {
  interface PluginState {
    'typing-combo': {
      view: ComboView
      tick: number
    }
  }
}
