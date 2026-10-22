# Static server for the README previews with caching disabled, so a regenerated page shows up on plain reload.
# Usage: python tools/media/serve.py [port]   (run from the repository root)
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()
    def log_message(self, *a): pass

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
ThreadingHTTPServer(('127.0.0.1', port), NoCache).serve_forever()
