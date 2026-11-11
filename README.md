# pdf-citations

Clickable PDF citations for the **Claude desktop app**.

When Claude answers from a PDF, each claim ends with a citation number in square brackets, `[n]`,
and a small numbered button sits under the paragraph. Click it and a built-in PDF viewer opens (or
scrolls) to the exact passage and highlights it, so you can check the source in one click, in the
spirit of the source chips in NotebookLM.

- Buttons sit right under the paragraph that cites, not in a list at the end, and the numbers run
  in order through the whole answer.
- The viewer is a real reader: continuous scrolling, zoom, text selection, page box.
- Highlights blend with the text, so the words underneath stay readable.
- No setup per document: attach a PDF to your message, or type its path, and Claude is told how
  to cite it.
- By default, summaries are laid out like a README: a large title, `##` sections separated by horizontal
  rules, and `###` subsections, so a change of section is easy to spot. Sections are written as
  explanatory prose, and formulas come in LaTeX.

## Install

At the prompt of a terminal session:

```
/plugin install pdf-citations --marketplace BorjaManterola/pdf-citations
```

From a shell:

```
claude plugin install pdf-citations --marketplace BorjaManterola/pdf-citations
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then
**Plugins**, **Add marketplace** with `BorjaManterola/pdf-citations`, then **Add plugin**.

## Update

From a shell, refresh the marketplace, then update the plugin:

```
claude plugin marketplace update pdf-citations
claude plugin update pdf-citations@pdf-citations
```

Restart Claude (or open a new session) to load the new version.

## Use

Any of these tells Claude which PDF is active and how to cite it:

1. **Attach a PDF** to your message. The plugin saves a copy to a temporary folder and resolves the
   location for you.
2. **Type or paste the path** in your message, absolute or relative to the session folder, for
   example `D:\papers\paper.pdf`, `docs\paper.pdf` or `@"D:\my papers\paper.pdf"`.
3. **Run `/pdf-viewer <path to PDF>`** to open a PDF in the viewer yourself.

Then ask about the document. Citations in the answer appear as `[n]` with a numbered button under
the paragraph; click one to jump to the passage. If a button does not know which PDF it belongs
to, it asks for the path right there.

### Ask for the style you want

The plugin is about citations: it makes every claim traceable to its passage in the PDF. It also
gives Claude a default layout (README-style headings, prose, LaTeX), but how long, how detailed
and how the answer is written still depend on the model and on your prompt, so the same request
can come back shorter or more list-like in another session. Say what you want in the prompt, for
example:

```
Write a complete, detailed summary in explanatory paragraphs, not bullet points,
and explain the methodology and where the data comes from.
```

## Requirements and limits

- **Claude desktop app** with its built-in browser pane. Other surfaces keep Claude's normal
  rendering and show the raw citation markers.
- **Windows.** Paths, the temporary folder and the PDF-path detection assume Windows.
- **`python` on the PATH.** It runs a tiny local server (127.0.0.1:8765) that serves the viewer
  and the PDF file you ask for. Only `.pdf` files are served, and only to your own machine.
- **Internet on first use**, because the viewer loads pdf.js from cdnjs.
- Highlights need a PDF with a text layer; scanned PDFs open but cannot be highlighted.
- A table's buttons come after its last row.

## How it works

Claude is asked to cite with `[[path|p.N|verbatim quote]]`. The plugin renders those markers as
`[n]` in the text and as buttons under each paragraph. A click starts the local server if needed, then asks the built-in
browser to open `viewer.html` or, if it already shows that PDF, to scroll to page `N`, where the
quote is located in the text layer and highlighted (the neighbouring pages are tried if the page
number is off by one).

## Development

```
claude plugin validate .
claude plugin test .
```

## Credits

PDF rendering by [pdf.js](https://github.com/mozilla/pdf.js) (Mozilla, Apache-2.0), loaded from
cdnjs and not bundled in this repository.

## License

[MIT](LICENSE) © 2026 BorjaManterola
