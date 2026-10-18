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
import tempfile
import threading
import time
import webbrowser

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("SOUNDCROSSING_PORT", "8767"))  # autre port : uniquement pour les tests
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
# Copies disque : Hyrox (clé « session ») et WOD (clé « events »), chacune dans son fichier.
DATA_FILES = {"/data": (DATA_FILE, "session"), "/data/wod": (DATA_FILE.with_name("wod.json"), "events")}
# Le serveur traite les requêtes en parallèle : une seule écriture à la fois.
WRITE_LOCK = threading.Lock()


def saved_at(store) -> float:
    value = store.get("savedAt") if isinstance(store, dict) else None
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else 0


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
        if path in DATA_FILES:
            try:
                body = DATA_FILES[path][0].read_bytes()
            except FileNotFoundError:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path not in {"/", "/index.html", "/styles.css", "/club.css", "/assets/soundcrossing-logo.jpg", "/assets/soundcrossing-logo.png", "/dist/models.js", "/dist/core.js", "/dist/app.js", "/vendor/xlsx.full.min.js",
                        "/wod.html", "/wod.css", "/dist/wod-core.js", "/dist/wod-app.js", "/dist/modele.js", "/dist/saisie.js"}:
            self.send_error(404)
            return
        super().do_GET()

    def do_PUT(self):
        """Copie sur le disque des données enregistrées par le navigateur."""
        target = DATA_FILES.get(unquote(urlparse(self.path).path))
        if not target:
            self.send_error(404)
            return
        data_file, required = target
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
            if not isinstance(store, dict) or required not in store:
                raise ValueError
        except ValueError:
            self.send_error(400)
            return
        with WRITE_LOCK:
            try:
                current = json.loads(data_file.read_bytes())
            except (OSError, ValueError):
                current = None
            # Une version plus ancienne (autre navigateur, requête en retard) n’écrase jamais une plus récente.
            if current is not None and saved_at(store) < saved_at(current):
                self.send_error(409, "Une version plus récente est déjà enregistrée.")
                return
            pending = None
            try:
                data_file.parent.mkdir(parents=True, exist_ok=True)
                with tempfile.NamedTemporaryFile(dir=data_file.parent, prefix=data_file.name + ".", suffix=".tmp", delete=False) as handle:
                    pending = Path(handle.name)
                    handle.write(body)
                    handle.flush()
                    os.fsync(handle.fileno())
                if data_file.exists():  # garde la version précédente en secours
                    shutil.copyfile(data_file, data_file.with_name(data_file.stem + "-precedente.json"))
                pending.replace(data_file)
            except OSError:
                if pending is not None:
                    pending.unlink(missing_ok=True)
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
    "assets/soundcrossing-logo.jpg", "assets/soundcrossing-logo.png", "assets/ORIGINE.md",
    "dist/models.js", "dist/core.js", "dist/app.js",
    "wod.html", "wod.css", "dist/wod-core.js", "dist/wod-app.js", "dist/modele.js", "dist/saisie.js",
    "vendor/xlsx.full.min.js", "vendor/SheetJS-LICENSE.txt", "LISEZ-MOI.txt",
)


REQUIRED = ("index.html", "server.py", "dist/models.js", "dist/core.js", "dist/app.js", "wod.html", "dist/wod-core.js", "dist/wod-app.js")
BACKUP_DIR = ROOT / "maj-precedente"


def install(files, version):
    """Remplace les fichiers tous ensemble : version complète vérifiée, ancienne version gardée, retour arrière en cas d’échec."""
    if any(name not in files or not files[name] for name in REQUIRED):
        raise ValueError("version incomplète")
    staged = []
    try:
        # 1. Toute la nouvelle version est écrite à côté avant de toucher aux fichiers en service.
        for name, content in files.items():
            pending = (ROOT / name).with_name(Path(name).name + ".maj")
            pending.parent.mkdir(parents=True, exist_ok=True)
            pending.write_bytes(content)
            staged.append(pending)
            if pending.read_bytes() != content:
                raise OSError("écriture incomplète")
        # 2. L’ancienne version est copiée dans maj-precedente/ (retour arrière possible à la main aussi).
        shutil.rmtree(BACKUP_DIR, ignore_errors=True)
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        for name in files:
            if (ROOT / name).exists():
                (BACKUP_DIR / name).parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(ROOT / name, BACKUP_DIR / name)
        if VERSION_FILE.exists():
            shutil.copy2(VERSION_FILE, BACKUP_DIR / "VERSION")
        # 3. Remplacement. VERSION est écrit en dernier : une coupure avant relance la mise à jour au prochain démarrage.
        try:
            for name in files:
                (ROOT / name).with_name(Path(name).name + ".maj").replace(ROOT / name)
            VERSION_FILE.write_text(version, encoding="utf-8")
        except Exception:
            for name in files:
                saved = BACKUP_DIR / name
                if saved.exists():
                    shutil.copy2(saved, ROOT / name)
                else:
                    (ROOT / name).unlink(missing_ok=True)
            raise
    finally:
        for pending in staged:
            pending.unlink(missing_ok=True)


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
        # Un fichier ajouté par une version récente peut manquer si l’ancienne mise à jour ne le connaissait pas.
        missing = any(not (ROOT / name).exists() for name in UPDATABLE)
        if not remote or (remote == local and not missing):
            print("Soundcrossing est déjà à jour.", flush=True)
            return
        print("Nouvelle version disponible, mise à jour…", flush=True)
        with urlopen(Request(f"{RELEASE}/Soundcrossing-Windows-x64.zip?t={fresh}", headers={"Cache-Control": "no-cache"}), timeout=120) as response:
            data = response.read()
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            if archive.testzip() is not None:
                raise ValueError("archive abîmée")
            files = {name: archive.read(f"Soundcrossing/{name}") for name in UPDATABLE if f"Soundcrossing/{name}" in archive.namelist()}
        install(files, remote)
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
