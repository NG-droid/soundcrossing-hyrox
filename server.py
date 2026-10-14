#!/usr/bin/env python3
"""Local-only launcher. Keep the origin stable so browser storage is reused."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import urlopen
from urllib.error import URLError
from urllib.parse import urlparse, unquote
import hashlib
import json
import sys
import webbrowser

ROOT = Path(__file__).resolve().parent
PORT = 8767
URL = f"http://127.0.0.1:{PORT}"
IDENTITY = hashlib.sha256(str(ROOT).encode()).hexdigest()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        path = unquote(urlparse(self.path).path)
        if path == "/health":
            body = json.dumps({"app": "pace-hyrox", "identity": IDENTITY}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path not in {"/", "/index.html", "/styles.css", "/club.css", "/assets/soundcrossing-logo.jpg", "/dist/models.js", "/dist/core.js", "/dist/app.js", "/vendor/xlsx.full.min.js"}:
            self.send_error(404)
            return
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()


def main():
    try:
        server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError:
        try:
            with urlopen(f"{URL}/health", timeout=2) as response:
                info = json.load(response)
            if info.get("identity") != IDENTITY:
                raise ValueError("Le port est occupé par une autre application.")
            if "--no-open" not in sys.argv:
                webbrowser.open(URL)
            print(f"Soundcrossing est déjà ouvert : {URL}")
            return
        except (URLError, ValueError, OSError):
            print(f"Le port {PORT} est occupé. Fermez l’autre application puis relancez Soundcrossing.")
            sys.exit(1)
    print(f"Soundcrossing — {URL}\nGardez cette fenêtre ouverte pendant la session. Ctrl+C pour arrêter.", flush=True)
    if "--no-open" not in sys.argv:
        webbrowser.open(URL)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
