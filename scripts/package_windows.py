"""Build a Windows x64 portable ZIP with the official embedded Python runtime."""
from hashlib import sha256
from io import BytesIO
import json
import os
import re
import subprocess
from pathlib import Path, PurePosixPath
from urllib.request import urlopen
from zipfile import ZipFile, ZIP_DEFLATED

from package_files import APP_FILES

ROOT = Path(__file__).resolve().parents[1]
VERSION = "3.14.8"
FILENAME = f"python-{VERSION}-embed-amd64.zip"
URL = f"https://www.python.org/ftp/python/{VERSION}/{FILENAME}"
SHA256 = "a93abe456ab01bd96d7a085b3cdb6566b3063f4241360d114142fbdb07f0a310"
PREFIX = "Soundcrossing/"


def runtime_bytes() -> bytes:
    cache = ROOT / "runtime-cache" / FILENAME
    if cache.is_file():
        data = cache.read_bytes()
    else:
        with urlopen(URL, timeout=60) as response:
            data = response.read(30 * 1024 * 1024 + 1)
        if len(data) > 30 * 1024 * 1024:
            raise ValueError("Archive Python trop volumineuse.")
    if sha256(data).hexdigest() != SHA256:
        raise ValueError("L’empreinte du runtime Python ne correspond pas à la version officielle.")
    cache.parent.mkdir(exist_ok=True)
    if not cache.exists():
        cache.write_bytes(data)
    return data


def launcher() -> Path:
    """Compile Soundcrossing.exe (windows/lanceur.c) : lance le serveur sans fenêtre noire, icône près de l’horloge.
    Nécessite MinGW (paquet Ubuntu gcc-mingw-w64-x86-64), installé par la CI."""
    output = ROOT / "livraison" / "Soundcrossing.exe"
    output.parent.mkdir(exist_ok=True)
    resources = output.with_name("lanceur.res")
    source = ROOT / "windows"
    subprocess.run(["x86_64-w64-mingw32-windres", "lanceur.rc", "-O", "coff", "-o", str(resources)], cwd=source, check=True)
    subprocess.run(["x86_64-w64-mingw32-gcc", "-Os", "-s", "-municode", "-mwindows", "-Wall", "-Wextra", "-Werror", "-Wl,--no-insert-timestamp",
                    "-o", str(output), "lanceur.c", str(resources), "-lshell32", "-luser32"], cwd=source, check=True)
    resources.unlink()
    return output


def version_text() -> str:
    """« commit numéro date » : le commit sert à la mise à jour, le numéro et la date à l’affichage (voir app_version)."""
    def git(*args):
        return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    sha = os.environ.get("GITHUB_SHA") or git("rev-parse", "HEAD")
    merge = re.match(r"Merge pull request #(\d+)", git("log", "-1", "--first-parent", "--format=%s", "--grep=^Merge pull request #"))
    return f"{sha} {merge.group(1) if merge else '-'} {git('log', '-1', '--format=%cs')}"


def build() -> Path:
    data = runtime_bytes()
    exe = launcher()
    output = ROOT / "livraison" / "Soundcrossing-Windows-x64.zip"
    output.parent.mkdir(exist_ok=True)
    pending = output.with_suffix(".zip.tmp")
    try:
        with ZipFile(BytesIO(data)) as runtime, ZipFile(pending, "w", ZIP_DEFLATED) as archive:
            if runtime.testzip() is not None:
                raise ValueError("Archive Python endommagée.")
            for info in runtime.infolist():
                path = PurePosixPath(info.filename)
                if path.is_absolute() or ".." in path.parts or "\\" in info.filename:
                    raise ValueError("Chemin non autorisé dans le runtime.")
                archive.writestr(f"{PREFIX}runtime/{info.filename}", runtime.read(info))
            for name in (*APP_FILES, "Lancer Soundcrossing.bat"):
                archive.write(ROOT / name, f"{PREFIX}{name}")
            archive.write(exe, f"{PREFIX}Soundcrossing.exe")
            # Windows users can read this guide with Notepad, without another app.
            guide = (ROOT / "WINDOWS.md").read_text(encoding="utf-8")
            archive.writestr(f"{PREFIX}LISEZ-MOI.txt", guide.replace("\n", "\r\n").encode("utf-8-sig"))
            manifest = {"application": "Soundcrossing", "platform": "Windows x64", "python": VERSION,
                        "runtime_source": URL, "runtime_sha256": SHA256,
                        "release": f"https://www.python.org/downloads/release/python-{VERSION.replace('.', '')}/",
                        "validation": "Archive et serveur vérifiés sur Mac ; lancement Windows à vérifier sur un PC."}
            archive.writestr(f"{PREFIX}VERSION", version_text())
            archive.writestr(f"{PREFIX}DISTRIBUTION.json", json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8"))
        pending.replace(output)
        # Même texte que le VERSION du ZIP : la mise à jour compare les deux.
        (output.parent / "VERSION.txt").write_text(version_text(), encoding="utf-8")
    except Exception:
        pending.unlink(missing_ok=True)
        raise
    return output


if __name__ == "__main__":
    result = build()
    print(f"{result.name} : {result.stat().st_size:,} octets. Python intégré, aucune donnée de participant.")
