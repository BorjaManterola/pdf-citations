import type { Hook, Register } from 'claude-code'

type Api = Parameters<Hook<'command.run'>>[0]
type Cite = { id: string; num: number; path?: string; page: number; quote: string }

const PORT = 8765
const BROWSER = 'Claude_Browser'
const ASK = { plugin: 'pdf-citations', key: 'ask' } as const
const CITE = /\s*\[\[(?:([^|\]]+)\|)?p\.(\d+)\|([^\]]+)\]\]/g
const LIST = /^\s*([-*+]|\d+\.)\s|^#{1,6}\s/
// Quoted or bare, absolute or relative to the session folder (resolved when the prompt is sent).
const PDF_PATH = /"([^"<>|*?\r\n]+?\.pdf)"|([^\s"'<>|*?]+?\.pdf)\b/gi
const ABSOLUTE = /^[A-Za-z]:[\\/]|^\\\\/
const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const WAIT_FOR_PORT =
  'import socket, time\n' +
  'for _ in range(60):\n' +
  `  try: socket.create_connection(("127.0.0.1", ${PORT}), 0.2).close(); raise SystemExit(0)\n` +
  '  except OSError: time.sleep(0.1)\n' +
  'raise SystemExit(1)'
const SAVE_PDF =
  'import sys, base64, os\n' +
  'os.makedirs(os.path.dirname(sys.argv[1]), exist_ok=True)\n' +
  'open(sys.argv[1], "wb").write(base64.b64decode(sys.stdin.read()))'

const INSTRUCTIONS = (path: string) =>
  `The PDF viewer has "${path}" as its active document. From now on, after every claim taken ` +
  `from that PDF, write a citation in exactly this format: [[${path}|p.N|literal quote]] — ` +
  `N is the PDF page (1 = the first) and the quote is 4 to 12 consecutive words copied ` +
  `verbatim from the PDF, with no formulas, vertical bars or square brackets. Put each ` +
  `citation at the end of the sentence or paragraph it supports, never inside a formula: the ` +
  `interface shows it as a number in square brackets, [n], in your text and as a numbered ` +
  `button under the paragraph that moves the viewer to that passage and highlights it; the ` +
  `numbers run in order through the whole answer. Lay out a summary like a README: open with ` +
  `the document title as a level-1 heading (# Title), give every section a level-2 heading ` +
  `(## Section) and every subsection a level-3 heading (### Subsection), each alone on its own ` +
  `short line with a blank line before and after, and put a horizontal rule (---, with a blank ` +
  `line above and below it) before every level-2 heading but the first, so each change of ` +
  `section stands out. Never use a bold phrase at the start of a paragraph as a title. Write ` +
  `each section as explanatory prose paragraphs that connect the ideas; use bullets only for ` +
  `short lists of parallel items, never as the whole summary. Write every formula in LaTeX: ` +
  `each displayed equation alone in a $$ … $$ block with blank lines around it, and symbols ` +
  `inside a sentence as $…$; never write a formula as plain text.`

// Both die with the module: the child is killed on reload, so the flag resets with it.
let serving = false
let lastPath = ''

const sup = (n: number) => String(n).replace(/\d/g, d => SUPERSCRIPT[+d]!)

async function serve($: Api): Promise<boolean> {
  if (!serving) {
    serving = true
    void (async () => {
      try {
        const child = $.process.spawn({
          argv: ['python', `${$.plugin.root}/viewer/serve.py`, `${PORT}`],
        })
        for await (const _ of child) continue
      } catch {
        // python missing or port taken: the wait below reports it
      } finally {
        serving = false
      }
    })()
  }

  return (await $.process.run(['python', '-c', WAIT_FOR_PORT])).exitCode === 0
}

// The browser pane may be hidden: the viewer moves either way, so showing it is best effort.
async function reveal($: Api) {
  try {
    await $.mcp.call('ccd_view', 'show_pane', { pane: 'preview' })
  } catch {
    // no pane control: the person opens the browser pane by hand
  }
}

// Moves the open viewer when it already holds this PDF, else loads it in the browser pane.
async function show($: Api, path: string, page: number, quote: string): Promise<string | null> {
  if (!(await serve($))) return 'Could not start the viewer server (is python on the PATH?)'
  const move = `window.VIEWER === 3 ? window.goTo(${page}, ${JSON.stringify(quote)}, ${JSON.stringify(path)}) : 'no'`
  try {
    const done = await $.mcp.call(BROWSER, 'javascript_tool', {
      action: 'javascript_exec',
      text: move,
    })
    if (JSON.stringify(done.content).includes('PDFVIEWER_OK')) {
      await reveal($)

      return null
    }
  } catch {
    // no browser tab to ask: load the viewer below
  }
  const url =
    `http://127.0.0.1:${PORT}/viewer.html?v=${Date.now()}&f=${encodeURIComponent(path)}` +
    `#page=${page}&q=${encodeURIComponent(quote)}`
  try {
    const opened = await $.mcp.call(BROWSER, 'navigate', { url })
    if (opened.isError) return 'The built-in browser could not open the viewer.'
    await reveal($)

    return null
  } catch (error) {
    return `The built-in browser did not respond: ${error instanceof Error ? error.message : error}`
  }
}

// Writes an attached PDF to a temp file, since the conversation holds its bytes, not a path.
async function savePdf($: Api, id: string, filename: string): Promise<string | null> {
  let base64 = ''
  let offset: number | undefined
  for (;;) {
    const part = await $.prompt.media(offset === undefined ? { id } : { id, offset })
    if (!part.base64) return null
    base64 += part.base64
    if (part.next === undefined) break
    offset = part.next
  }
  const tmp = (await $.env.get('TEMP')) ?? '.'
  const dest = `${tmp}\\pdf-citations\\${Date.now()}-${filename.replace(/[^\w.-]+/g, '_')}`
  const saved = await $.process.run(['python', '-c', SAVE_PDF, dest], { stdin: base64 })

  return saved.exitCode === 0 ? dest : null
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pdf-viewer',
      description: 'Open a PDF in the viewer and enable clickable citations',
      argumentHint: '<path to PDF>',
    })

    return next(e)
  })

  on('command.run', { command: 'pdf-viewer' }, async ($, e) => {
    const path = e.args.trim().replace(/^["']|["']$/g, '')
    if (!path) return { text: 'Usage: /pdf-viewer <path to PDF>' }
    const problem = await show($, path, 1, '')
    if (problem) return { text: problem }
    lastPath = path

    return { text: `Viewer opened: ${path}`, context: [INSTRUCTIONS(path)] }
  })

  on('prompt.submit', async ($, e, next) => {
    let path = ''
    try {
      for (const a of e.attachments ?? []) {
        const isPdf = a.mediaType?.includes('pdf') || a.filename?.toLowerCase().endsWith('.pdf')
        if (a.type !== 'document' || !a.id || !isPdf) continue
        path = (await savePdf($, a.id, a.filename ?? 'document.pdf')) ?? path
      }
      for (const m of e.text.matchAll(PDF_PATH)) {
        const written = (m[1] ?? m[2]!).replace(/^@/, '')
        const file = ABSOLUTE.test(written)
          ? written
          : `${await $.session.cwd()}\\${written.replace(/^\.[\\/]/, '')}`.replace(/\//g, '\\')
        if (await $.fs.stat(file).then(() => true, () => false)) path = file
      }
    } catch {
      // never block the prompt over a PDF that could not be resolved
    }
    if (!path) return next(e)
    lastPath = path

    return next({ ...e, context: [...(e.context ?? []), INSTRUCTIONS(path)] })
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'desktop' || ![...e.props.text.matchAll(CITE)].length) return next(e)
    const { Box, Button, Input, Markdown } = $.ui.resolve(e)
    const { value: ask = '' } = await $.state.get(ASK)
    const lines = e.props.text.split('\n')
    const nodes = []
    let buf: string[] = []
    let pending: Cite[] = []
    let fence = false
    let n = 0

    const press = (c: Cite) => async () => {
      const path = c.path ?? lastPath
      if (!path) {
        await $.state.set(ASK, c.id)

        return
      }
      const problem = await show($, path, c.page, c.quote)
      if (problem) void $.ui.toast(problem)
      else lastPath = path
    }

    const submit = (c: Cite) => async (value: string) => {
      const path = value.trim().replace(/^["']|["']$/g, '')
      if (!(await $.fs.stat(path).then(() => true, () => false))) {
        void $.ui.toast('File not found; check the path')

        return
      }
      lastPath = path
      await $.state.set(ASK, '')
      const problem = await show($, path, c.page, c.quote)
      if (problem) void $.ui.toast(problem)
    }

    const flush = () => {
      nodes.push(<Markdown text={buf.join('\n')} />)
      if (pending.length > 0) {
        nodes.push(
          <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
            {pending.map(c => (
              <Button key={c.id} label={sup(c.num)} onPress={press(c)} />
            ))}
          </Box>,
        )
        const asking = pending.find(c => c.id === ask)
        if (asking) {
          nodes.push(
            <Input
              key={`path-${asking.id}`}
              label="PDF:"
              placeholder="Paste the PDF path and press Enter"
              submitLabel="open"
              onSubmit={submit(asking)}
            />,
          )
        }
      }
      buf = []
      pending = []
    }

    // shortcut: a code fence or $$ block holding another ``` or $$ would toggle this wrongly.
    lines.forEach((raw, i) => {
      if ((raw.match(/```|\$\$/g) ?? []).length % 2) fence = !fence
      const found = [...raw.matchAll(CITE)]
      const base = n
      buf.push(raw.replace(CITE, () => ` [${++n}]`))
      found.forEach((m, k) =>
        pending.push({
          id: `${e.requestId}-${base + k}`,
          num: base + k + 1,
          path: m[1],
          page: +m[2]!,
          quote: m[3]!,
        }),
      )
      const after = lines[i + 1]
      const inTable = /^\s*\|/.test(raw)
      const tableNext = /^\s*\|/.test(after ?? '')
      const closes =
        after === undefined || !after.trim() || LIST.test(after) || (inTable && !tableNext)
      if (pending.length > 0 && !fence && closes) flush()
    })
    if (buf.some(l => l.trim())) flush()

    return <Box flexDirection="column">{nodes}</Box>
  })
}
