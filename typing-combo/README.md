# Typing Combo

![A combo counter above the prompt, its digits knocked about by each keystroke](assets/preview.gif)

A fighting-game combo counter for your Claude Code prompt. Every keystroke lands as a hit: big digits above the prompt count the combo and get knocked left and right, harder the faster you type, with a moment of hit-stop on each hit. Keep typing and the counter heats up; pause or send the prompt and the combo ends.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install typing-combo --marketplace VkaZas/claude-code-mods
```

Answer `y` to add the marketplace, then pick a scope (user is the first). From your shell instead (Claude Code 2.1.292 or later):

```
claude plugin install typing-combo --marketplace VkaZas/claude-code-mods
```

## What you will see

- **Hits.** Each key knocks the three-row digits the other way and springs them back. The hit frame holds for a beat (longer at higher speeds), drawn inverted and heavy, then flashes white.
- **Heat.** Five speed levels, from under two keys a second to over nine, take the color from white through blue, yellow and orange to red, fill a meter and throw sparks. The characters you just typed light up in the prompt in the same color.
- **Milestones.** Every ten keys, and each new rank (GOOD at 10, NICE! at 25, AMAZING!! at 50, INSANE!!! at 100, GODLIKE!!!! at 200), shakes the whole band and shouts it.
- **Your best.** Keys per second and your best combo sit under the count; the best is remembered across sessions.
- **The end.** A pause of a second and a half, or sending the prompt, ends the combo and shows how far it went. Pastes don't count.

## Settings

| Option | Values | Default |
| --- | --- | --- |
| Language | `en`, `zh` | `en` |

## Notes

- Typing Combo is a mod: a hooks module that draws in the band above the prompt and colors what you type. It was built and tested with Claude Code 2.1.295 in Windows Terminal.
- It shares that band: whatever else draws there (another mod, a hint) still shows, below the counter.
- It reads nothing but your keystrokes in the prompt box, counts them, and sends nothing anywhere. The only thing it stores is your best combo, in the plugin's own store.
- The preview above was rendered from a replay of the plugin's drawing rules; the colors in your terminal depend on its theme and font.

## 中文说明

打字连击：在提示框里打字，提示框上方出现格斗游戏式的大号连击数。每按一个键就是一次打击，数字被左右击退再弹回，打得越快震得越狠，并有停顿帧；速度分五档，颜色从白到蓝、黄、橙、红，刚打的字也会跟着变色；每 10 连和每个新段位整排震动。停 1.5 秒或发送就结束连击，粘贴不算。最高纪录跨会话保存。在 `/config` 里把 Language 设成 `zh` 就是中文。

## License

[MIT](LICENSE)
