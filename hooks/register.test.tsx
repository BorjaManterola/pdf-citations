import { expect, test } from 'claude-code/testing'

const MESSAGE = {
  plugin: 'pdf-citations',
  component: 'AssistantMessage',
  surface: 'desktop',
  requestId: 'm1',
} as const

const OK = { value: { exitCode: 0, stdout: '', stderr: '' } }
const ONE = '1\uFE0E\u20E3'

test('a message with no citation is left to the engine', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({
    ...MESSAGE,
    props: { text: 'Nothing to cite.', isFirstOfReply: true },
  })

  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

test('numbered squares sit under the paragraph that cites, not at the end', async ($, on) => {
  on('state.get', () => ({ value: { value: undefined, version: 0 } }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({
    ...MESSAGE,
    props: {
      text:
        'First [[a.pdf|p.5|decays geometrically at rate]].\n\nSecond [[a.pdf|p.6|converges to a ceiling]].',
      isFirstOfReply: true,
    },
  })

  expect((await ui.find({ type: 'Markdown', text: new RegExp(`First ${ONE}`) }))?.text).not.toMatch(
    /Second/,
  )
  expect((await ui.find({ type: 'Markdown', text: new RegExp(`Second ${ONE}`) }))?.text).not.toMatch(
    /First/,
  )
  expect((await ui.find({ key: 'm1-0' }))?.props.label).toBe(ONE)
  expect((await ui.find({ key: 'm1-1' }))?.props.label).toBe(ONE)
  await ui.unmount()
})

test('a table stays whole and its squares come after the last row', async ($, on) => {
  on('state.get', () => ({ value: { value: undefined, version: 0 } }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({
    ...MESSAGE,
    props: {
      text: '| A | B |\n|---|---|\n| 1 | x [[a.pdf|p.2|some quoted words here]] |\n| 2 | y |\n\nEnd.',
      isFirstOfReply: true,
    },
  })

  const table = await ui.find({ type: 'Markdown', text: /\| 2 \| y \|/ })
  expect(table?.text).toMatch(/\| A \| B \|/)
  expect((await ui.find({ key: 'm1-0' }))?.props.label).toBe(ONE)
  await ui.unmount()
})

test('pressing a square loads the viewer at that page with the quote', async ($, on) => {
  const calls: { tool: string; args: Record<string, unknown> }[] = []
  on('state.get', () => ({ value: { value: undefined, version: 0 } }))
  on('process.run', () => OK)
  on('mcp.call', (_, e) => {
    calls.push({ tool: e.tool, args: e.args })

    return { value: { content: [{ type: 'text', text: '"no"' }], isError: false } }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({
    ...MESSAGE,
    props: { text: 'State [[D:\\x\\a.pdf|p.3|knowledge state]].', isFirstOfReply: true },
  })
  await ui.press({ key: 'm1-0' })

  expect(calls.map(c => c.tool)).toEqual(['javascript_tool', 'navigate', 'show_pane'])
  const url = String(calls[1]!.args.url)
  expect(url).toContain('127.0.0.1:8765/viewer.html')
  expect(url).toContain('f=D%3A%5Cx%5Ca.pdf')
  expect(url).toContain('#page=3&q=knowledge%20state')
  await ui.unmount()
})

test('a viewer that already holds the PDF is moved without reloading', async ($, on) => {
  const calls: string[] = []
  on('state.get', () => ({ value: { value: undefined, version: 0 } }))
  on('process.run', () => OK)
  on('mcp.call', (_, e) => {
    calls.push(e.tool)

    return { value: { content: [{ type: 'text', text: '"PDFVIEWER_OK"' }], isError: false } }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({
    ...MESSAGE,
    props: { text: 'State [[D:\\x\\a.pdf|p.3|knowledge state]].', isFirstOfReply: true },
  })
  await ui.press({ key: 'm1-0' })

  expect(calls).toEqual(['javascript_tool', 'show_pane'])
  await ui.unmount()
})

test('a square with no known PDF asks for the path right there, then opens it', async ($, on) => {
  const state = new Map<string, unknown>()
  const calls: string[] = []
  on('state.get', (_, e) => ({ value: { value: state.get(e.key), version: 1 } }))
  on('state.set', (_, e) => {
    state.set(e.key, e.value)

    return { value: { isSet: true, version: 2 } }
  })
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 0, isLink: false } }))
  on('process.run', () => OK)
  on('mcp.call', (_, e) => {
    calls.push(`${e.tool}:${JSON.stringify(e.args).includes('knowledge') ? 'quote' : '-'}`)

    return { value: { content: [{ type: 'text', text: '"PDFVIEWER_OK"' }], isError: false } }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({
    ...MESSAGE,
    props: { text: 'State [[p.3|knowledge state]].', isFirstOfReply: true },
  })
  expect(await ui.find({ key: 'path-m1-0' })).toBeUndefined()
  await ui.press({ key: 'm1-0' })

  expect(state.get('ask')).toBe('m1-0')
  expect(calls).toEqual([])
  await ui.unmount()

  const again = await $.ui.mount({
    ...MESSAGE,
    props: { text: 'State [[p.3|knowledge state]].', isFirstOfReply: true },
  })
  expect((await again.find({ key: 'path-m1-0' }))?.props.placeholder).toMatch(/PDF path/)
  await again.input({ key: 'path-m1-0', text: 'D:\\x\\a.pdf', kind: 'submit' })

  expect(state.get('ask')).toBe('')
  expect(calls[0]).toBe('javascript_tool:quote')
  await again.unmount()
})

test('a PDF path typed in the prompt is announced to the model', async ($, on) => {
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 0, isLink: false } }))
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))

  const sent = await $.prompt.submit({ text: 'Summarize D:\\papers\\a.pdf please' })

  expect(JSON.stringify(sent)).toContain('[[D:\\\\papers\\\\a.pdf|p.N|literal quote]]')
  expect(JSON.stringify(sent)).toContain('a level-2 heading (## Section)')
})

test('a quoted PDF path with spaces is announced to the model', async ($, on) => {
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 0, isLink: false } }))
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))

  const sent = await $.prompt.submit({ text: '@"D:\\my papers\\BKT 2016.pdf" summary' })

  expect(JSON.stringify(sent)).toContain('[[D:\\\\my papers\\\\BKT 2016.pdf|p.N|literal quote]]')
})

test('long runs of citations are split so every square holds a single digit', async ($, on) => {
  on('state.get', () => ({ value: { value: undefined, version: 0 } }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
  const rows = Array.from({ length: 14 }, (_, i) => `| r${i} | x [[a.pdf|p.${i + 1}|quoted words ${i}]] |`)
  const text = ['| A | B |', '|---|---|', ...rows].join('\n')

  const ui = await $.ui.mount({ ...MESSAGE, props: { text, isFirstOfReply: true } })

  for (let i = 0; i < 14; i++) {
    const label = String((await ui.find({ key: `m1-${i}` }))?.props.label)
    expect(label).toMatch(/^[1-9]︎⃣$/)
  }
  await ui.unmount()
})
