import http.server
import os
import sys
import urllib.parse

ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Refuses a Host that is not loopback, so a rebinding web page cannot read local PDFs.
        if self.headers.get('Host', '').rsplit(':', 1)[0] not in ('127.0.0.1', 'localhost'):
            self.send_error(403)
            return
        super().do_GET()

    def translate_path(self, path):
        url = urllib.parse.urlsplit(path)
        if url.path == '/doc.pdf':
            # shortcut: serves any local .pdf the page asks for; bound to 127.0.0.1 only.
            pdf = urllib.parse.parse_qs(url.query).get('f', [''])[0]
            return pdf if pdf.lower().endswith('.pdf') and os.path.isfile(pdf) else os.devnull
        return os.path.join(ROOT, url.path.lstrip('/'))

    def log_message(self, *args):
        pass


http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), Handler).serve_forever()
