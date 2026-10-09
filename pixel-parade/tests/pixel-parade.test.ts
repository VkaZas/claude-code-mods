import { describe, expect, test } from 'claude-code/testing'

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

// Each kind's nose color, used by nothing else: one per animal drawn.
const CAT_NOSE = 0xf48fa0
const DOG_NOSE = 0x141414
const CATS = ['orange tabby', 'tuxedo cat', 'black cat', 'ragdoll', 'brown tabby', 'calico']
const DOGS = ['shiba', 'golden retriever', 'border collie', 'samoyed', 'corgi', 'husky']

async function drawn($: any): Promise<string> {
  const ui = await $.ui.mount({ plugin: 'pixel-parade', surface: 'terminal', ...(BAND as any) })
  const tree = JSON.stringify(await ui.drawn())
  await ui.unmount()
  return tree
}

// The Raster's cells as [codePoint, fg, bg] triplets, or null when none is drawn.
function raster(tree: string): number[][] | null {
  const m = tree.match(/"cells":"([^"]+)"/)
  if (m === null) return null
  const bytes = Uint8Array.from(atob(m[1]), ch => ch.charCodeAt(0))
  const v = new DataView(bytes.buffer)
  const out: number[][] = []
  for (let o = 0; o < bytes.length; o += 12) out.push([v.getUint32(o, true), v.getUint32(o + 4, true), v.getUint32(o + 8, true)])
  return out
}

function noses(cells: number[][], color: number): number {
  return cells.filter(([, fg, bg]) => fg === color || bg === color).length
}

function quiet(on: any) {
  on('store.get', () => ({ value: undefined }) as any)
  on('store.set', () => ({ value: undefined }) as any)
  on('ui.render', { component: 'AbovePrompt' }, ($: any, e: any) => $.ui.resolve(e).Text({ children: 'drawn below' }))
}

describe('pixel-parade', () => {
  test('cats only: as many pixel cats as asked, no dogs, over what is drawn beneath', async ($, on) => {
    quiet(on)
    await $.command.run({ command: 'parade', args: 'cats' } as any)
    await $.command.run({ command: 'parade', args: '4' } as any)
    const tree = await drawn($)
    const cells = raster(tree)
    expect(cells).not.toBeNull()
    expect(noses(cells!, CAT_NOSE)).toBe(4)
    expect(noses(cells!, DOG_NOSE)).toBe(0)
    expect(tree).toContain('drawn below')
  })

  test('dogs only', async ($, on) => {
    quiet(on)
    await $.command.run({ command: 'parade', args: 'dogs' } as any)
    await $.command.run({ command: 'parade', args: '3' } as any)
    const cells = raster(await drawn($))
    expect(noses(cells!, DOG_NOSE)).toBe(3)
    expect(noses(cells!, CAT_NOSE)).toBe(0)
  })

  test('the lane is four rows the band is wide, in half blocks and plain characters only', async ($, on) => {
    quiet(on)
    await $.command.run({ command: 'parade', args: '6' } as any)
    const tree = await drawn($)
    expect(tree).toContain('"columns":98')
    expect(tree).toContain('"rows":4')
    const cells = raster(tree)!
    expect(cells.length).toBe(98 * 4)
    const odd = cells.filter(([cp]) => ![0x20, 0x2580, 0x2584, 0x2588].includes(cp) && !(cp > 0x20 && cp < 0x7f))
    expect(odd).toEqual([])
  })

  test('/parade status names who is out', async ($, on) => {
    quiet(on)
    await $.command.run({ command: 'parade', args: 'cats' } as any)
    await $.command.run({ command: 'parade', args: '2' } as any)
    const said = ((await $.command.run({ command: 'parade', args: 'status' } as any)) as any).text as string
    expect(said).toContain('2 out')
    expect(CATS.some(n => said.includes(n))).toBe(true)
    expect(DOGS.some(n => said.includes(n))).toBe(false)
  })

  test('in Chinese when the options say so', { options: { language: 'zh' } }, async ($, on) => {
    quiet(on)
    await $.command.run({ command: 'parade', args: '狗' } as any)
    const said = ((await $.command.run({ command: 'parade', args: 'status' } as any)) as any).text as string
    expect(said).toMatch(/^现在有 3 只：/)
    expect(['柴犬', '金毛', '边牧', '萨摩耶', '柯基', '哈士奇'].some(n => said.includes(n))).toBe(true)
  })

  test('ascii style draws them in characters', async ($, on) => {
    quiet(on)
    await $.command.run({ command: 'parade', args: 'ascii' } as any)
    const tree = await drawn($)
    expect(tree).toMatch(/=\^\.\.?\^=|U\^ᴥ\^U|\(ᵔᴥᵔ\)/)
    expect(raster(tree)).toBeNull()
  })

  test('off the terminal they are drawn in characters', async ($, on) => {
    quiet(on)
    await $.command.run({ command: 'parade', args: '2' } as any)
    const ui = await $.ui.mount({ plugin: 'pixel-parade', surface: 'desktop', ...(BAND as any) })
    const tree = JSON.stringify(await ui.drawn())
    await ui.unmount()
    expect(tree).toMatch(/=\^\.\.?\^=|U\^ᴥ\^U|\(ᵔᴥᵔ\)/)
    expect(raster(tree)).toBeNull()
  })

  test('/parade hides them, leaving the band to what lies beneath', async ($, on) => {
    quiet(on)
    await $.command.run({ command: 'parade', args: '2' } as any)
    expect(raster(await drawn($))).not.toBeNull()
    const said = await $.command.run({ command: 'parade', args: '' } as any)
    expect((said as any).text).toContain('put away')
    const tree = await drawn($)
    expect(raster(tree)).toBeNull()
    expect(tree).toContain('drawn below')
  })

  test('counts outside 1–12 are refused', async ($, on) => {
    quiet(on)
    const said = await $.command.run({ command: 'parade', args: '40' } as any)
    expect((said as any).text).toContain('1 to 12')
  })
})
