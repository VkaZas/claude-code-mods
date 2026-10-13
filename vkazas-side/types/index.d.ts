export type SideMessage = { role: 'me' | 'side' | 'note'; text: string; at?: number }

declare module 'claude-code' {
  interface PluginState {
    'vkazas-side': {
      messages: SideMessage[]
      agentId: string | null
      // Every agent the pane forked, so their notifications are known after a re-fork.
      spawned: string[]
      isBusy: boolean
      busySince: number | null
      activity: string
      draft: string
      tick: number
    }
  }
}
