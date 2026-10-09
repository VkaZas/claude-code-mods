# Pixel Parade

![Pixel cats and dogs strolling, napping and sharing hearts above the prompt](assets/preview.gif)

Hand-drawn pixel-art cats and dogs wander in a lane above your Claude Code prompt while you work. They stroll, sit down, nap, zoom about, fall in love and chase each other, and now and then one wanders off the edge while a new one wanders in. You choose how many there are and whether you want cats, dogs or both.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install pixel-parade --marketplace VkaZas/claude-code-mods
```

Answer `y` to add the marketplace, then pick a scope (user is the first). From your shell instead (Claude Code 2.1.292 or later):

```
claude plugin install pixel-parade --marketplace VkaZas/claude-code-mods
```

## What you will see

- **Six cats and six dogs.** Orange tabby, tuxedo, black cat, ragdoll, brown tabby and calico; shiba, golden retriever, border collie, samoyed, tailless corgi and blue-eyed husky. Each one is 12 by 8 pixels, two pixels to a terminal cell, so the lane is four rows tall.
- **Little lives.** Legs swap as they walk; a sitting cat flicks its tail and a sitting dog wags (faster when it is happy). Cats curl up and nap under a drifting `zZz`; dogs break into a zoom and kick up dust.
- **Meetings.** Two of a kind who walk up face to face sit down and share a pixel heart. A dog that walks up to a cat sends it running with a red `!`, and sometimes gives chase.
- **Comings and goings.** At an edge an animal usually turns back and sometimes walks off for good; a newcomer walks in from the side to keep the count.

## Settings

Set the defaults in `/config` (or when you install):

| Option | Values | Default |
| --- | --- | --- |
| Count | 1–6 or 8 | 3 |
| Animals | `both`, `cats`, `dogs` | `both` |
| Style | `pixel` (the art), `ascii` (`=^.^=` and `U^ᴥ^U`) | `pixel` |
| Language | `en`, `zh` | `en` |

And change them on the fly; these overrides are remembered across sessions:

| Command | Does |
| --- | --- |
| `/parade` | Show or hide the parade |
| `/parade 5` | Set how many (1–12) |
| `/parade cats` · `dogs` · `both` | Cats only, dogs only, or both; the ones you no longer want walk off |
| `/parade pixel` · `ascii` | Switch the style |
| `/parade status` | Who is out and what each one is doing |
| `/parade reset` | Back to the `/config` defaults |

## Notes

- Pixel Parade is a mod: a hooks module that draws in the band above the prompt. It was built and tested with Claude Code 2.1.295 in Windows Terminal.
- It shares that band: whatever else draws there (another mod, a hint) still shows, below the lane.
- The pixels need a terminal. On other surfaces the animals are drawn in characters.
- It reads nothing and sends nothing anywhere. The only thing it stores is your `/parade` overrides, in the plugin's own store.
- The preview above was rendered from the plugin's own drawing code; the colors in your terminal depend on its theme and font.

## 中文说明

在 Claude Code 提示框上方，一群手绘像素小猫小狗走来走去：散步、坐下甩尾/摇尾巴、猫趴着打盹冒 `zZz`、狗疯跑扬灰；同类面对面会坐下冒爱心，狗朝猫走过去猫会冒 `!` 逃跑。猫 6 种（橘猫、奶牛猫、黑猫、布偶、狸花、三花），狗 6 种（柴犬、金毛、边牧、萨摩耶、柯基、哈士奇）。

在 `/config` 里把 Language 设成 `zh` 就是中文提示。命令：`/parade` 显示或隐藏，`/parade 5` 设数量，`/parade cats|dogs|both`（也可以用 `猫`、`狗`、`都要`），`/parade pixel|ascii`，`/parade status` 看看都有谁，`/parade reset` 恢复默认。

## License

[MIT](LICENSE)
