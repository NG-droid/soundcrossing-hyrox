#!/usr/bin/env python3
"""Local-only launcher. Keep the origin stable so browser storage is reused."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError
from urllib.parse import urlparse, unquote
import hashlib
import io
import os
import shutil
import subprocess
import zipfile
import json
import sys
import time
import webbrowser

ROOT = Path(__file__).resolve().parent
PORT = 8767
URL = f"http://127.0.0.1:{PORT}"
IDENTITY = hashlib.sha256(str(ROOT).encode()).hexdigest()
MAX_DATA = 20 * 1024 * 1024


def data_dir() -> Path:
    """Dossier des données, hors du dossier de l’application : une mise à jour ou un nouveau ZIP ne l’efface pas."""
    custom = os.environ.get("SOUNDCROSSING_DATA")
    if custom:
        return Path(custom)
    documents = Path.home() / "Documents"
    return (documents if documents.is_dir() else Path.home()) / "Soundcrossing"


DATA_FILE = data_dir() / "session.json"


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
        if path == "/data":
            try:
                body = DATA_FILE.read_bytes()
            except FileNotFoundError:
                self.send_error(404)
                return
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

    def do_PUT(self):
        """Copie sur le disque de la session enregistrée par le navigateur."""
        if unquote(urlparse(self.path).path) != "/data":
            self.send_error(404)
            return
        # Seule la page de Soundcrossing peut écrire, pas un autre site ouvert dans le navigateur.
        if self.headers.get("Host") != f"127.0.0.1:{PORT}" or self.headers.get("Origin") not in (None, URL) \
                or self.headers.get("Content-Type") != "application/json":
            self.send_error(403)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= MAX_DATA:
                raise ValueError
            body = self.rfile.read(length)
            store = json.loads(body)
            if not isinstance(store, dict) or "session" not in store:
                raise ValueError
        except ValueError:
            self.send_error(400)
            return
        try:
            DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
            pending = DATA_FILE.with_name("session.json.tmp")
            pending.write_bytes(body)
            if DATA_FILE.exists():  # garde la version précédente en secours
                shutil.copyfile(DATA_FILE, DATA_FILE.with_name("session-precedente.json"))
            pending.replace(DATA_FILE)
        except OSError:
            self.send_error(500)
            return
        self.send_response(204)
        self.end_headers()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()


RELEASE = "https://github.com/NG-droid/soundcrossing-hyrox/releases/download/windows"
VERSION_FILE = ROOT / "VERSION"
# Fichiers remplacés par une mise à jour. Le lanceur .bat et runtime/ ne sont jamais touchés :
# Windows relit un .bat en cours d’exécution, et Python ne change pas d’une version à l’autre.
UPDATABLE = (
    "index.html", "styles.css", "club.css", "server.py",
    "assets/soundcrossing-logo.jpg", "assets/ORIGINE.md",
    "dist/models.js", "dist/core.js", "dist/app.js",
    "vendor/xlsx.full.min.js", "vendor/SheetJS-LICENSE.txt", "LISEZ-MOI.txt",
)


def update():
    """Récupère la dernière version publiée. Sans Internet, l’application démarre telle quelle."""
    if "--no-update" in sys.argv or os.environ.get("SOUNDCROSSING_NO_UPDATE"):
        return
    try:
        if (ROOT / ".git").exists():
            subprocess.run(["git", "pull", "--ff-only", "--quiet"], cwd=ROOT, timeout=30, check=False)
            return
        if not VERSION_FILE.exists():
            return
        local = VERSION_FILE.read_text(encoding="utf-8").strip()
        fresh = int(time.time())  # évite une ancienne copie gardée en cache
        request = Request(f"{RELEASE}/VERSION.txt?t={fresh}", headers={"Cache-Control": "no-cache"})
        with urlopen(request, timeout=5) as response:
            remote = response.read(100).decode().strip()
        if not remote or remote == local:
            print("Soundcrossing est déjà à jour.", flush=True)
            return
        print("Nouvelle version disponible, mise à jour…", flush=True)
        with urlopen(Request(f"{RELEASE}/Soundcrossing-Windows-x64.zip?t={fresh}", headers={"Cache-Control": "no-cache"}), timeout=120) as response:
            data = response.read()
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            files = {name: archive.read(f"Soundcrossing/{name}") for name in UPDATABLE if f"Soundcrossing/{name}" in archive.namelist()}
        if "dist/app.js" not in files:
            return
        for name, content in files.items():
            target = ROOT / name
            target.parent.mkdir(parents=True, exist_ok=True)
            pending = target.with_name(target.name + ".maj")
            pending.write_bytes(content)
            pending.replace(target)
        VERSION_FILE.write_text(remote, encoding="utf-8")
        print("Soundcrossing est à jour.", flush=True)
    except Exception:  # Une mise à jour ratée ne doit jamais empêcher la course.
        print("Mise à jour impossible pour le moment ; la version actuelle démarre.", flush=True)


def main():
    update()
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
    print(f"Soundcrossing — {URL}\nDonnées enregistrées dans : {DATA_FILE.parent}\nGardez cette fenêtre ouverte pendant la session. Ctrl+C pour arrêter.", flush=True)
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
