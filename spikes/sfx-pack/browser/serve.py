"""Static files only (same headers as the PoC serve.py); port 8791, serves browser/public."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from functools import partial
class Handler(SimpleHTTPRequestHandler):
 def end_headers(self):
  self.send_header('Cross-Origin-Opener-Policy','same-origin')
  self.send_header('Cross-Origin-Embedder-Policy','require-corp')
  self.send_header('Cache-Control','no-cache')
  super().end_headers()
if __name__=='__main__':
 root=Path(__file__).resolve().parent/'public'
 ThreadingHTTPServer(('127.0.0.1',8791),partial(Handler,directory=str(root))).serve_forever()
