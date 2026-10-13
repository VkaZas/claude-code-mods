import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { SideMessage } from '../types'

const PANE = 'side-chat'
const KEEP = 60
const SHOWN = 30
const SYNC_CHARS = 8000
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

const messages = atom({ plugin: 'vkazas-side', key: 'messages' } as const, [])
const agentId = atom({ plugin: 'vkazas-side', key: 'agentId' } as const, null)
const spawned = atom({ plugin: 'vkazas-side', key: 'spawned' } as const, [])
const isBusy = atom({ plugin: 'vkazas-side', key: 'isBusy' } as const, false)
const busySince = atom({ plugin: 'vkazas-side', key: 'busySince' } as const, null)
const activity = atom({ plugin: 'vkazas-side', key: 'activity' } as const, '')
const draft = atom({ plugin: 'vkazas-side', key: 'draft' } as const, '')
const tick = atom({ plugin: 'vkazas-side', key: 'tick' } as const, 0)

// ---------- words, in the language the options choose ----------

type Lang = 'en' | 'zh'

const TEXT = {
  en: {
    // The fork inherits the main conversation; this frames the first message it gets.
    firstMessage: [
      'You are a "side fork" forked from the main conversation. The user is talking to you directly in a side pane in Claude Code, and the main conversation may be busy with something else at the same time.',
      '- Answer what the user says in the side pane, in the language they write in.',
      '- You know the main conversation only up to the moment of the fork; you cannot see what it did after. When unsure, say so.',
      '- Avoid changing files the main conversation may be changing; say which files before you change any.',
      '- Keep answers short, and end with a one- or two-sentence conclusion.',
      '- After each answer you pause; when the user follows up in the pane you wake with the conversation so far. No need to explain this to the user.',
      '',
      'The user says in the side pane:',
    ].join('\n'),
    // The main conversation hears that the side agent finished, not what it said:
    // the reply lives in the pane, and Sync to main hands it over on request.
    shortResult:
      'The side fork finished. Its full reply is shown only in the side pane and was not passed to the main conversation; the user will press "Sync to main" if they want it. This notification needs no response.',
    dropped: 'The side fork answered; the reply is in the /side pane',
    consumed: 'vkazas-side: the side fork\'s reply stays in the side pane',
    noText: '(no text reply this round)',
    interrupted: '(this round was interrupted)',
    errored: '(this round ended with an error)',
    stillBusy: 'The side fork is still answering; send once it is done',
    spawnDescription: 'side fork',
    noFork: (why: string) => `Could not fork a side agent: ${why}`,
    noStart: 'The side fork did not seem to start; try sending again',
    forked: (id: string) => `Forked side agent ${id} from the main conversation`,
    notSent: (why: string) => `Not delivered to the side fork: ${why}. Try "Re-fork".`,
    me: 'User (side pane)',
    side: 'Side fork',
    nothingToSync: 'Nothing in the side pane to sync yet',
    omitted: '…(earlier part omitted)',
    syncHeader:
      '[Transcript of the side fork conversation: the user wants you to know what was discussed and done there. For reference only; no separate reply needed.]',
    syncFailed: (why: string) => `Sync failed: ${why}`,
    syncedNote: 'Synced into the main conversation; it sees this next turn',
    synced: 'Synced to the main conversation',
    reforked: 'Disconnected this side fork; your next message forks a new one from where the main conversation is now',
    reloaded: 'The mod reloaded; the reply to the last message was missed',
    command: 'Open the side pane: talk directly to a subagent forked from the main conversation',
    title: '✻ Side',
    opened: 'Side pane opened.',
    notOpened: (why: string) => `The side pane could not be shown: ${why}`,
    answering: '● answering',
    unforked: '○ not forked',
    ready: '● ready',
    introTitle: 'Talk to a side fork here',
    intro: [
      '· Your first message forks a subagent from the main conversation as it stands; it remembers everything up to the fork',
      '· The main conversation and the side fork work independently; neither blocks the other',
      '· Its replies stay here; press "Sync to main" to hand them over',
      '· Press "Re-fork" to catch it up with the main conversation',
    ],
    folded: (n: number) => `  …${n} earlier messages folded`,
    thinking: 'thinking',
    waitPlaceholder: 'Wait for the answer before the next message…',
    firstPlaceholder: 'Ask something; it forks a side agent first…',
    placeholder: 'Say something to the side fork…',
    send: 'Send',
    hintWide: 'enter send · tab buttons · esc back to main',
    hint: 'enter send · esc back to main',
    syncButton: 'Sync to main',
    reforkButton: 'Re-fork',
  },
  zh: {
    firstMessage: [
      '你是从主对话 fork 出来的「分身」。用户正在 Claude Code 的侧边面板里直接和你对话，主对话那边可能同时在做别的事。',
      '- 直接回答用户在侧边面板里说的话，用中文。',
      '- 你只知道 fork 那一刻之前的主对话；之后主对话做了什么你看不到，拿不准就直说。',
      '- 尽量不要改主对话可能正在改的文件；要改文件先说清楚改哪些。',
      '- 回答简洁，最后用一两句话给结论。',
      '- 每次答完你会暂停；用户在面板里追问时，你会带着之前的对话被唤醒接着聊。不用跟用户解释你是「一次性」的。',
      '',
      '用户在侧边面板说：',
    ].join('\n'),
    shortResult:
      '分身答完了。完整回复只显示在侧边面板里，没有转进主对话；用户需要时会点「同步到主对话」。这条通知不需要回应。',
    dropped: '分身答完了，回复在 /side 面板里',
    consumed: 'vkazas-side：分身的回复留在侧边面板里',
    noText: '（这一轮没有文字回复）',
    interrupted: '（这一轮被中断了）',
    errored: '（这一轮出错结束）',
    stillBusy: '分身还在回答上一句，等它说完再发',
    spawnDescription: '侧边分身',
    noFork: (why: string) => `没能 fork 出分身：${why}`,
    noStart: '分身好像没启动起来，可以再发一次试试',
    forked: (id: string) => `已从主对话 fork 出分身 ${id}`,
    notSent: (why: string) => `没送到分身：${why}。可以点「重新 fork」再试`,
    me: '用户（侧边面板）',
    side: '分身',
    nothingToSync: '侧边还没有对话可同步',
    omitted: '……（前面省略）',
    syncHeader: '[侧边分身的对话记录：用户想让你知道分身那边谈了什么、做了什么。仅供参考，不需要单独回复。]',
    syncFailed: (why: string) => `同步失败：${why}`,
    syncedNote: '已同步进主对话，主对话下一轮能看到',
    synced: '已同步到主对话',
    reforked: '已断开当前分身，下一句话会从主对话的最新状态重新 fork',
    reloaded: 'mod 重新加载了：上一句的回复没接到',
    command: '打开侧边分身面板：和一个 fork 了主对话上下文的子代理直接对话',
    title: '✻ 分身',
    opened: '侧边分身面板已打开。',
    notOpened: (why: string) => `侧边分身面板没能显示：${why}`,
    answering: '● 回答中',
    unforked: '○ 未 fork',
    ready: '● 待命',
    introTitle: '在这里直接和「分身」对话',
    intro: [
      '· 第一句话会从主对话当前状态 fork 出分身，它记得 fork 之前的一切',
      '· 主对话和分身各干各的，互不阻塞',
      '· 分身的回复只留在这里，需要时点「同步到主对话」',
      '· 想让分身跟上主对话的新进展，点「重新 fork」',
    ],
    folded: (n: number) => `  …更早的 ${n} 条已折叠`,
    thinking: '分身在想',
    waitPlaceholder: '分身回答完再发下一句…',
    firstPlaceholder: '问点什么，会先 fork 出分身…',
    placeholder: '跟分身说点什么…',
    send: '发送',
    hintWide: 'enter 发送 · tab 选按钮 · esc 回主对话',
    hint: 'enter 发送 · esc 回主对话',
    syncButton: '同步到主对话',
    reforkButton: '重新 fork',
  },
}

let lang: Lang = 'en'

function shorten(text: string): string {
  return text.replace(/<result>[\s\S]*?<\/result>/, `<result>${TEXT[lang].shortResult}</result>`)
}

// Is this text a notification from an agent this pane forked?
async function fromSideAgent($: EngineInterface, text: string): Promise<boolean> {
  const current = await read($, agentId)
  const ids = [...((await read($, spawned)) ?? []), ...(current === null ? [] : [current])]
  return ids.some(id => mentionsAgent(text, id))
}

function mentionsAgent(text: string, id: string): boolean {
  return text.includes(`<task-id>${id}</task-id>`) && text.includes('<result>')
}

function clockTime(at: number | undefined): string {
  return at === undefined ? '' : new Date(at).toTimeString().slice(0, 5)
}

async function add($: EngineInterface, message: SideMessage) {
  await update($, messages, list => [...(list ?? []), { ...message, at: Date.now() }].slice(-KEEP))
}

async function setIdle($: EngineInterface) {
  await update($, isBusy, () => false)
  await update($, busySince, () => null)
  await update($, activity, () => '')
}

// The pane's window starts at the top of its tree, so new messages fall below
// it: move the window once the redraw that holds the target has landed.
async function reveal($: EngineInterface, to: { key: string } | 'end', block?: 'start' | 'end') {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const moved = await $.ui.scroll({ in: PANE, to, block })
      if (moved.deny === undefined) return
    } catch {
      // not drawn yet, or no scrolling here
    }
    await $.clock.sleep(80).catch(() => undefined)
  }
}

// A reply can reach us twice (turn.complete and SubagentStop): show it once.
async function deliver($: EngineInterface, id: string | undefined, text: string | undefined) {
  if (id === undefined || id !== (await read($, agentId))) return
  const reply = text === undefined || text === '' ? TEXT[lang].noText : text
  const list = (await read($, messages)) ?? []
  const last = list[list.length - 1]
  if (!(last !== undefined && last.role === 'side' && last.text === reply)) {
    await add($, { role: 'side', text: reply })
  }
  await setIdle($)
  // Land on the top of the new reply, so it reads from its first line.
  const count = ((await read($, messages)) ?? []).length
  await reveal($, { key: `msg-${count - 1}` }, 'start')
}

async function ask($: EngineInterface, raw: string) {
  const text = raw.trim()
  if (text === '') return
  if (await read($, isBusy)) {
    $.ui.toast(TEXT[lang].stillBusy)
    return
  }
  await update($, draft, () => '')
  await add($, { role: 'me', text })
  await update($, isBusy, () => true)
  await update($, busySince, () => Date.now())
  await update($, activity, () => '')
  void reveal($, 'end')

  const current = await read($, agentId)
  if (current === null) {
    const started = await $.agent.spawn({
      prompt: `${TEXT[lang].firstMessage}\n${text}`,
      description: TEXT[lang].spawnDescription,
      subagentType: 'fork',
    })
    if (started.deny !== undefined) {
      await add($, { role: 'note', text: TEXT[lang].noFork(started.deny) })
      await setIdle($)
      return
    }
    // Fall back to the agent list when the start did not name the agent.
    const id =
      started.agentId ??
      (await $.agent.list().catch(() => []))
        .filter(a => a.spawnedBy === 'vkazas-side' && a.status === 'running')
        .map(a => a.id)
        .pop()
    if (id === undefined) {
      await add($, { role: 'note', text: TEXT[lang].noStart })
      await setIdle($)
      return
    }
    await update($, agentId, () => id)
    await update($, spawned, list => [...(list ?? []).filter(x => x !== id), id].slice(-50))
    await add($, { role: 'note', text: TEXT[lang].forked(id.slice(0, 8)) })
    return
  }

  const sent = await $.session.send({ to: { agentId: current }, text })
  if (!sent.isDelivered) {
    await add($, { role: 'note', text: TEXT[lang].notSent(String(sent.reason)) })
    await setIdle($)
  }
}

async function syncToMain($: EngineInterface) {
  const list = (await read($, messages)) ?? []
  const lines = list
    .filter(m => m.role !== 'note')
    .map(m => `${m.role === 'me' ? TEXT[lang].me : TEXT[lang].side}: ${m.text}`)
  if (lines.length === 0) {
    $.ui.toast(TEXT[lang].nothingToSync)
    return
  }
  let body = lines.join('\n\n')
  if (body.length > SYNC_CHARS) body = `${TEXT[lang].omitted}\n${body.slice(-SYNC_CHARS)}`
  const appended = await $.session.append({
    message: {
      type: 'user',
      content: [
        {
          type: 'text',
          text: `${TEXT[lang].syncHeader}\n\n${body}`,
        },
      ],
    },
  })
  if ('deny' in appended && appended.deny !== undefined) {
    $.ui.toast(TEXT[lang].syncFailed(String(appended.deny)))
    return
  }
  await add($, { role: 'note', text: TEXT[lang].syncedNote })
  $.ui.toast(TEXT[lang].synced)
}

async function refork($: EngineInterface) {
  await update($, agentId, () => null)
  await setIdle($)
  await add($, { role: 'note', text: TEXT[lang].reforked })
}

function describeTool(e: unknown): string {
  const call = e as { tool?: unknown; command?: unknown; file_path?: unknown; pattern?: unknown; url?: unknown }
  const detail = [call.command, call.file_path, call.pattern, call.url].find(v => typeof v === 'string')
  const short = typeof detail === 'string' ? ` ${detail.replace(/\s+/g, ' ').slice(0, 48)}` : ''
  return `${String(call.tool)}${short}`
}

export const register: Register = (on, options) => {
  lang = (options as { language?: string } | undefined)?.language === 'zh' ? 'zh' : 'en'
  const t = TEXT[lang]

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    // A reload must not leave the pane waiting on a reply it can no longer catch.
    if (await read($, isBusy)) {
      await setIdle($)
      await add($, { role: 'note', text: t.reloaded })
    }
    // Show where the conversation stands, not its first lines.
    const count = ((await read($, messages)) ?? []).length
    if (count > 0) void reveal($, { key: `msg-${count - 1}` }, 'start')
    // Drives the spinner while the side agent works; idle ticks cost a read.
    void $.clock.every(120, async () => {
      if (await read($, isBusy)) await update($, tick, n => ((n ?? 0) + 1) % 1000)
    })
    await $.command.register({
      name: 'side',
      description: t.command,
    })
    return started
  })

  on('command.run', { command: 'side' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: t.title, focus: true })
    return {
      text: opened.isPlaced ? t.opened : t.notOpened(String(opened.reason)),
    }
  })

  // Show what the side agent is doing while it works.
  on('tool.call', async ($, e, next) => {
    const caller = (e as { agentId?: string }).agentId
    if (caller !== undefined && caller === (await read($, agentId))) {
      await update($, activity, () => describeTool(e))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // A turn of the side agent ended: its answer is the reply in the pane.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) {
      const reply =
        e.answer !== ''
          ? e.answer
          : e.isAborted
            ? t.interrupted
            : e.reason === 'error'
              ? t.errored
              : undefined
      await deliver($, e.agentId, reply)
    }
    return result
  })

  // A resumed run may end without a turn.complete reaching us: SubagentStop
  // carries the agent and its last message either way.
  on('classic.SubagentStop', async ($, e, next) => {
    const result = await next(e)
    await deliver($, e.agent_id, e.last_assistant_message)
    return result
  }).catch(($, e, next) => next(e))

  // The side agent's notifications never wake the main conversation: its
  // replies live in the pane. A notification is dropped where it would start
  // (or join) a main turn, consumed where it is delivered, and cut to one line
  // in the rare case it is appended anyway.
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'task-notification' && (await fromSideAgent($, e.text))) {
      return { drop: t.dropped }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.receive', async ($, e, next) => {
    if (e.agentId === undefined && (await fromSideAgent($, e.text))) {
      return { consumed: t.consumed }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.append', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const content = e.message.content as unknown
    if (typeof content === 'string') {
      if (!(await fromSideAgent($, content))) return next(e)
      return next({ ...e, message: { ...e.message, content: shorten(content) } as typeof e.message })
    }
    if (!Array.isArray(content)) return next(e)
    const blocks = content as { type: string; text?: string }[]
    const texts = blocks.filter(b => b.type === 'text' && typeof b.text === 'string').map(b => b.text as string)
    if (!(await fromSideAgent($, texts.join(' ')))) return next(e)
    const shortened = blocks.map(b => (b.type === 'text' && typeof b.text === 'string' ? { ...b, text: shorten(b.text) } : b))
    return next({ ...e, message: { ...e.message, content: shortened } as typeof e.message })
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Markdown, Input, Button } = $.ui.resolve(e)
    const list = (await read($, messages)) ?? []
    const id = await read($, agentId)
    const busy = await read($, isBusy)
    const since = await read($, busySince)
    const now = await read($, activity)
    const typed = await read($, draft)
    const frame = busy ? await read($, tick) : 0

    const columns = Math.max(24, e.props.bodyColumns)
    const isWide = columns >= 56
    const shown = list.slice(-SHOWN)
    const first = list.length - shown.length
    const hasReplies = list.some(m => m.role === 'side')
    const seconds = busy && since !== null ? Math.max(0, Math.round((Date.now() - since) / 1000)) : 0
    const state = busy
      ? { color: 'warning', label: t.answering }
      : id === null
        ? { color: 'inactive', label: t.unforked }
        : { color: 'success', label: t.ready }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="row">
            <Text color="claude" bold>
              {t.title}
            </Text>
            {id !== null && <Text color="subtle">{`  ${id.slice(0, 8)}`}</Text>}
          </Box>
          <Text color={state.color}>{state.label}</Text>
        </Box>
        <Text color="subtle">{'─'.repeat(columns)}</Text>

        {list.length === 0 ? (
          <Box flexDirection="column" marginTop={1} paddingX={1}>
            <Text bold>{t.introTitle}</Text>
            <Box flexDirection="column" marginTop={1}>
              {t.intro.map(line => (
                <Text color="subtle">{line}</Text>
              ))}
            </Box>
          </Box>
        ) : (
          first > 0 && <Text color="subtle" italic>{t.folded(first)}</Text>
        )}

        {shown.map((m, i) => (
          // Keyed by place in the whole list, so reveal() can scroll to one.
          <Box key={`msg-${first + i}`} flexDirection="column" marginTop={1}>
            {m.role === 'me' ? (
              <Box flexDirection="row">
                <Text color="suggestion" bold>
                  {'❯ '}
                </Text>
                <Box flexDirection="column" flexShrink={1}>
                  <Text>{m.text}</Text>
                </Box>
              </Box>
            ) : m.role === 'side' ? (
              <Box flexDirection="column">
                <Box flexDirection="row">
                  <Text color="claude" bold>
                    {t.title}
                  </Text>
                  <Text color="subtle">{`  ${clockTime(m.at)}`}</Text>
                </Box>
                <Box flexDirection="column" paddingLeft={2}>
                  <Markdown text={m.text} />
                </Box>
              </Box>
            ) : (
              <Text color="subtle" italic>{`  · ${m.text}`}</Text>
            )}
          </Box>
        ))}

        {busy && (
          <Box flexDirection="row" marginTop={1}>
            <Text color="claude">{`${SPINNER[(frame ?? 0) % SPINNER.length]} `}</Text>
            <Text color="subtle" wrap="truncate-end">
              {`${t.thinking} · ${seconds}s${now === '' ? '' : ` · ${now}`}`}
            </Text>
          </Box>
        )}

        <Box marginTop={1} borderStyle="round" borderColor={busy ? 'inactive' : 'promptBorder'} paddingX={1}>
          <Input
            key="ask"
            label="❯"
            placeholder={busy ? t.waitPlaceholder : id === null ? t.firstPlaceholder : t.placeholder}
            value={typed ?? ''}
            submitLabel={t.send}
            autoFocus
            onInput={value => {
              void update($, draft, () => value)
            }}
            onSubmit={value => {
              void ask($, value)
            }}
          />
        </Box>
        <Box flexDirection={isWide ? 'row' : 'column'} justifyContent="space-between">
          <Text color="subtle">{isWide ? t.hintWide : t.hint}</Text>
          <Box flexDirection="row" gap={1}>
            <Button
              key="sync"
              label={t.syncButton}
              variant={hasReplies ? 'primary' : 'secondary'}
              onPress={() => syncToMain($)}
            />
            <Button key="refork" label={t.reforkButton} onPress={() => refork($)} />
          </Box>
        </Box>
      </Box>
    )
  })
}
