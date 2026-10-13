# Side Chat (vkazas-side)

A second conversation beside your main one. Type `/side` and a pane opens next to the transcript; the first thing you say there forks a subagent from the main conversation as it stands, so it already knows everything you have discussed. You talk to that fork directly in the pane while the main conversation keeps working, and neither waits for the other.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install vkazas-side --marketplace VkaZas/claude-code-mods
```

Answer `y` to add the marketplace, then pick a scope (user is the first). From your shell instead (Claude Code 2.1.292 or later):

```
claude plugin install vkazas-side --marketplace VkaZas/claude-code-mods
```

## How it works

- **`/side`** opens the pane and puts the cursor in its input box. `esc` takes you back to the main prompt.
- **The first message** forks a subagent from the main conversation. It remembers everything up to the fork, and nothing the main conversation does after.
- **Follow-ups** go to the same fork, which wakes up with the side conversation so far.
- **Replies stay in the pane.** When the fork finishes a reply, the main conversation is not woken up and does not see the reply. While it works, the pane shows a spinner and the tool it is running.
- **Sync to main** appends the side conversation (up to its last 8,000 characters) to the main conversation, for its next turn.
- **Re-fork** lets the current fork go; your next message forks a fresh one from where the main conversation is now.

The fork is a real subagent: each message is a model turn on your plan, and it can use tools like the main conversation can. It is told to avoid editing files the main conversation may be editing, and to say which files before it changes any.

## Settings

| Option | Values | Default |
| --- | --- | --- |
| Language | `en`, `zh` | `en` |

The language sets the pane's labels, and the instructions the fork gets with your first message (in `en`, it answers in the language you write in; in `zh`, in Chinese).

## What it hooks

- `session.start`: registers `/side` and starts a timer that drives the spinner while the fork works.
- `command.run`, for `/side` only: opens the pane.
- `tool.call`: when the caller is this pane's fork, notes which tool it is running, for the spinner line. Every call goes through unchanged.
- `turn.complete` and `classic.SubagentStop`: when the agent is this pane's fork, takes its answer and shows it in the pane. Everything else passes through unchanged.
- `prompt.submit`, `session.receive` and `session.append`: a notification that this pane's fork finished is dropped where it would start a main turn, consumed where it would be delivered, and cut to one line in the rare case it is appended. Notifications from any other agent, and your own prompts, go through unchanged.
- `ui.render` on its own pane: draws the conversation, the input and the two buttons.

## Notes

- Side Chat is a mod: a hooks module with a pane. It was built and tested with Claude Code 2.1.295 in Windows Terminal.
- It sends nothing anywhere but to Claude Code itself, and stores nothing on disk: the side conversation lasts for the session.

## 中文说明

`/side` 打开侧边面板，第一句话会从主对话当前状态 fork 出一个「分身」子代理，它记得 fork 之前的一切。你在面板里直接和分身对话，主对话照常干活，互不阻塞。分身的回复只留在面板里，不会唤醒主对话；需要时点「同步到主对话」把记录交给主对话，想让分身跟上主对话的新进展就点「重新 fork」。在 `/config` 里把 Language 设成 `zh`，面板就是中文，分身也会用中文回答。

## License

[MIT](LICENSE)
