import { describe, expect, test } from 'claude-code/testing'

const PANE = {
  component: 'Pane',
  requestId: 'side-chat',
  props: {
    title: 'Side',
    isFocused: true,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

// The kit raises a plugin's $.agent.spawn as the Agent tool's call, so it cannot
// hand back a live agentId: the round trip with a real fork is checked live.
describe('vkazas-side', () => {
  test('the first message asks for a fork of the main conversation', async ($, on) => {
    const spawned: { type: unknown; prompt: string }[] = []
    on('agent.spawn', ($, e) => {
      spawned.push({ type: (e as any).subagent_type ?? e.subagentType, prompt: e.prompt })
      return { model: 'claude-opus-5-5', agentId: 'agent-1234567890' }
    })
    // The kit has no agent list; the mod falls back to it when a start names no agent.
    on('agent.list', () => ({ value: [] }) as any)

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'vkazas-side', surface, ...(PANE as any) })
      expect(await ui.find({ key: 'ask' })).toBeDefined()
      expect(await ui.find({ key: 'sync' })).toBeDefined()
      expect(await ui.find({ key: 'refork' })).toBeDefined()

      if (surface === 'terminal') {
        expect(await ui.find({ type: 'Text', text: /Talk to a side fork here/ })).toBeDefined()
        await ui.input({ key: 'ask', text: '帮我查一下 SEO' })
        expect(spawned).toHaveLength(1)
        expect(spawned[0].type).toBe('fork')
        expect(spawned[0].prompt).toContain('帮我查一下 SEO')
        expect(spawned[0].prompt).toContain('in the language they write in')
        expect(await ui.find({ type: 'Text', text: /帮我查一下 SEO/ })).toBeDefined()

        await ui.press({ key: 'refork' })
        expect(await ui.find({ type: 'Text', text: /Disconnected this side fork/ })).toBeDefined()
        expect(await ui.find({ type: 'Text', text: /not forked/ })).toBeDefined()
      }
      await ui.unmount()
    }
  })

  test('a reply that arrives by SubagentStop and turn.complete shows once', async ($, on) => {
    on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'agent-xyz' }))
    on('agent.list', () =>
      ({
        value: [{ id: 'agent-xyz', spawnedBy: 'vkazas-side', status: 'running', description: '侧边分身', type: 'fork' }],
      }) as any,
    )
    on('session.send', () => ({ isDelivered: true }))
    on('turn.complete', () => ({ text: '' }))
    on('classic.SubagentStop', () => ({}) as any)

    const ui = await $.ui.mount({ plugin: 'vkazas-side', surface: 'terminal', ...(PANE as any) })
    await ui.input({ key: 'ask', text: '第一句' })
    expect(await ui.find({ type: 'Text', text: /Forked side agent agent-xy/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /answering/ })).toBeDefined()

    const stop = {
      hook_event_name: 'SubagentStop',
      stop_hook_active: false,
      agent_id: 'agent-xyz',
      agent_transcript_path: 'x.jsonl',
      agent_type: 'fork',
    }
    await $.classic.SubagentStop({ ...stop, last_assistant_message: '第一轮的回答' } as any)
    await $.turn.complete({ agentId: 'agent-xyz', answer: '第一轮的回答', reason: 'answer', durationMs: 1, isAborted: false, turnId: 't1' } as any)
    expect(await ui.findAll({ type: 'Markdown', text: /第一轮的回答/ })).toHaveLength(1)

    // The resumed run: only SubagentStop reports it.
    await ui.input({ key: 'ask', text: '追问一句' })
    await $.classic.SubagentStop({ ...stop, last_assistant_message: '第二轮的回答' } as any)
    expect(await ui.find({ type: 'Markdown', text: /第二轮的回答/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /● ready/ })).toBeDefined()

    // Another agent's stop is not the side agent's reply.
    await $.classic.SubagentStop({ ...stop, agent_id: 'agent-other', last_assistant_message: '别人的回答' } as any)
    expect(await ui.find({ type: 'Markdown', text: /别人的回答/ })).toBeUndefined()
    await ui.unmount()
  })

  test("the side agent's notifications never wake the main conversation", async ($, on) => {
    on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'agent-xyz' }))
    on('agent.list', () =>
      ({
        value: [{ id: 'agent-xyz', spawnedBy: 'vkazas-side', status: 'running', description: '侧边分身', type: 'fork' }],
      }) as any,
    )
    on('prompt.submit', ($, e) => ({ text: e.text }) as any)
    on('session.receive', ($, e) => ({ text: e.text }) as any)
    const stored: string[] = []
    on('session.append', ($, e, next) => {
      const c = e.message.content as any
      stored.push(typeof c === 'string' ? c : c.map((b: any) => b.text ?? '').join(''))
      return next(e)
    })

    const ui = await $.ui.mount({ plugin: 'vkazas-side', surface: 'terminal', ...(PANE as any) })
    await ui.input({ key: 'ask', text: '第一句' })

    const ours =
      '<task-notification><task-id>agent-xyz</task-id><status>completed</status><result>很长很长的回答</result></task-notification>'
    const theirs = ours.replace('agent-xyz', 'agent-other')

    // Where it would start a main turn: dropped.
    const dropped = await $.prompt.submit({ text: ours, origin: { kind: 'task-notification' }, wait: false } as any)
    expect((dropped as any).drop).toContain('/side')
    // Someone else's notification and your own prompt go through.
    expect((await $.prompt.submit({ text: theirs, origin: { kind: 'task-notification' }, wait: false } as any) as any).text).toBe(theirs)
    expect((await $.prompt.submit({ text: '你好', origin: { kind: 'composer' }, wait: false } as any) as any).text).toBe('你好')

    // Where it is delivered: consumed.
    const received = await $.session.receive({ origin: { kind: 'task-notification' }, text: ours } as any)
    expect((received as any).consumed).toBeDefined()

    // Appended anyway: one line.
    await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: ours }] } } as any)
    await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: theirs }] } } as any)
    expect(stored[0]).toContain('The side fork finished')
    expect(stored[0]).not.toContain('很长很长的回答')
    expect(stored[1]).toContain('很长很长的回答')

    // After a re-fork the old agent is still known.
    await ui.press({ key: 'refork' })
    const afterRefork = await $.prompt.submit({ text: ours, origin: { kind: 'task-notification' }, wait: false } as any)
    expect((afterRefork as any).drop).toBeDefined()
    await ui.unmount()
  })

  test('in Chinese when the options say so', { options: { language: 'zh' } }, async ($, on) => {
    const prompts: string[] = []
    on('agent.spawn', ($, e) => {
      prompts.push(e.prompt)
      return { model: 'claude-opus-5-5', agentId: 'agent-1234567890' }
    })
    on('agent.list', () =>
      ({
        value: [{ id: 'agent-1234567890', spawnedBy: 'vkazas-side', status: 'running', description: '侧边分身', type: 'fork' }],
      }) as any,
    )
    const ui = await $.ui.mount({ plugin: 'vkazas-side', surface: 'terminal', ...(PANE as any) })
    expect(await ui.find({ type: 'Text', text: /在这里直接和「分身」对话/ })).toBeDefined()
    await ui.input({ key: 'ask', text: '你好' })
    expect(prompts[0]).toContain('用中文')
    expect(await ui.find({ type: 'Text', text: /已从主对话 fork 出分身/ })).toBeDefined()
    await ui.unmount()
  })

  test('sync with nothing to sync appends nothing', async ($, on) => {
    const appended: unknown[] = []
    on('session.append', ($, e) => {
      appended.push(e)
      return { message: e.message, uuid: 'u1' } as any
    })
    const ui = await $.ui.mount({ plugin: 'vkazas-side', surface: 'terminal', ...(PANE as any) })
    await ui.press({ key: 'sync' })
    expect(appended).toHaveLength(0)
    await ui.unmount()
  })
})
