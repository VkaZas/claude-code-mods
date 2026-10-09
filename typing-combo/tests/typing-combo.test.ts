import { describe, expect, test } from 'claude-code/testing'

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

// One keystroke at the end of the draft, as the composer raises it.
async function type($: any, draft: string, ch: string) {
  return $.prompt.edit({
    origin: { kind: 'composer' },
    key: { key: ch },
    text: draft,
    cursor: draft.length,
    start: draft.length,
    end: draft.length,
    inputText: ch,
  })
}

// The engine beneath: it applies the keystroke, and draws its own line in the band.
function beneath(on: any) {
  on('prompt.edit', ($: any, e: any) => ({ text: e.text + e.inputText, cursor: e.cursor + e.inputText.length }) as any)
  on('ui.render', { component: 'AbovePrompt' }, ($: any, e: any) => $.ui.resolve(e).Text({ children: 'drawn below' }))
}

async function typeFast($: any, text: string) {
  let draft = ''
  let last: any
  for (const ch of text) {
    last = await type($, draft, ch)
    draft += ch
  }
  return { draft, last }
}

describe('typing-combo', () => {
  test('typing builds a combo shown above the prompt, over what is drawn beneath', async ($, on) => {
    beneath(on)
    const { draft, last } = await typeFast($, 'hello world')
    // Fast typing lights up the character just typed.
    expect(last.decorations?.[0]).toMatchObject({ start: draft.length - 1, end: draft.length, bold: true })

    const ui = await $.ui.mount({ plugin: 'typing-combo', surface: 'terminal', ...(BAND as any) })
    const drawn = JSON.stringify(await ui.drawn())
    // The tenth key was a milestone: its rank shouts where COMBO stands.
    expect(await ui.find({ type: 'Text', text: /COMBO|GOOD/ })).toBeDefined()
    // 11 keys in big digits: the first row of "1" then "1", heavy on the hit frame.
    expect(await ui.find({ type: 'Text', text: /^(▄█|██) +(▄█|██) +$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /keys\/s/ })).toBeDefined()
    // Drawn right after a key, inside the hit-stop: the hit frame flashes inverted.
    expect(drawn).toContain('"inverse":true')
    expect(drawn).not.toContain('━')
    expect(await ui.find({ type: 'Text', text: /drawn below/ })).toBeDefined()
    await ui.unmount()
  })

  test('in Chinese when the options say so', { options: { language: 'zh' } }, async ($, on) => {
    beneath(on)
    await typeFast($, 'hello world')
    const ui = await $.ui.mount({ plugin: 'typing-combo', surface: 'terminal', ...(BAND as any) })
    expect(await ui.find({ type: 'Text', text: /键\/秒/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /keys\/s/ })).toBeUndefined()
    await ui.unmount()
  })

  test('a paste is no combo; with no combo the band is what lies beneath', async ($, on) => {
    beneath(on)
    await $.prompt.edit({
      origin: { kind: 'composer' },
      text: '',
      cursor: 0,
      start: 0,
      end: 0,
      inputText: 'a long pasted paragraph',
    } as any)
    const ui = await $.ui.mount({ plugin: 'typing-combo', surface: 'terminal', ...(BAND as any) })
    expect(await ui.find({ type: 'Text', text: /COMBO/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /drawn below/ })).toBeDefined()
    await ui.unmount()
  })
})
