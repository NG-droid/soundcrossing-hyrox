"""Distribution checks on any host; these do not replace a Windows launch test."""
from contextlib import contextmanager
from hashlib import sha256
from http.server import ThreadingHTTPServer
import importlib.util
from io import BytesIO
import json
from pathlib import Path
import struct
import tempfile
from threading import Thread
import unittest
from urllib.error import HTTPError
from urllib.request import urlopen
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "livraison" / "Soundcrossing-Windows-x64.zip"
PREFIX = "Soundcrossing/"


@contextmanager
def extracted_server():
    with tempfile.TemporaryDirectory(prefix="Soundcrossing salle é ") as folder:
        with ZipFile(ARCHIVE) as archive:
            archive.extractall(folder)
        path = Path(folder) / "Soundcrossing" / "server.py"
        spec = importlib.util.spec_from_file_location("isolated_soundcrossing_server", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        server = ThreadingHTTPServer(("127.0.0.1", 0), module.Handler)
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f"http://127.0.0.1:{server.server_port}", module
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)


class WindowsDistributionTests(unittest.TestCase):
    def test_official_runtime_and_x64_executable_are_included(self):
        with ZipFile(ARCHIVE) as archive:
            self.assertIsNone(archive.testzip())
            manifest = json.loads(archive.read(f"{PREFIX}DISTRIBUTION.json"))
            source = ROOT / "runtime-cache" / "python-3.14.8-embed-amd64.zip"
            self.assertEqual(sha256(source.read_bytes()).hexdigest(), manifest["runtime_sha256"])
            with ZipFile(source) as runtime:
                # All runtime files, including the DLLs, isolation file and license, stay intact.
                for name in runtime.namelist():
                    self.assertEqual(archive.read(f"{PREFIX}runtime/{name}"), runtime.read(name), name)
            executable = archive.read(f"{PREFIX}runtime/python.exe")
            self.assertEqual(executable[:2], b"MZ")
            offset = struct.unpack_from("<I", executable, 0x3C)[0]
            self.assertEqual(executable[offset:offset + 4], b"PE\0\0")
            self.assertEqual(struct.unpack_from("<H", executable, offset + 4)[0], 0x8664)
            with ZipFile(BytesIO(archive.read(f"{PREFIX}runtime/python314.zip"))) as library:
                for name in ["http/server.pyc", "socketserver.pyc", "webbrowser.pyc", "urllib/request.pyc", "json/__init__.pyc", "pathlib/__init__.pyc"]:
                    self.assertIn(name, library.namelist())

    def test_launch_uses_bundled_python_and_package_contains_no_participants(self):
        with ZipFile(ARCHIVE) as archive:
            names = archive.namelist()
            self.assertFalse(any("sauvegardes/" in name or "node_modules/" in name or "src/" in name for name in names))
            self.assertNotIn(f"{PREFIX}Lancer Soundcrossing.command", names)
            self.assertNotIn(f"{PREFIX}DEMARRER.md", names)
            launcher = archive.read(f"{PREFIX}Lancer Soundcrossing.bat").decode()
            # Le .bat passe la main à Soundcrossing.exe s’il est là, sinon il garde l’ancienne fenêtre noire.
            self.assertLess(launcher.index('start "" "%~dp0Soundcrossing.exe"'), launcher.index('"runtime\\python.exe" -I "%~dp0server.py"'))
            self.assertLess(launcher.index('"runtime\\python.exe" -I "%~dp0server.py"'), launcher.index("py -3"))
            guide = archive.read(f"{PREFIX}LISEZ-MOI.txt").decode("utf-8-sig")
            self.assertIn("Python est déjà inclus", guide)
            self.assertIn("n’a pas encore été testé", guide)

    def test_launcher_is_a_windows_x64_program_without_console(self):
        with ZipFile(ARCHIVE) as archive:
            executable = archive.read(f"{PREFIX}Soundcrossing.exe")
        self.assertEqual(executable[:2], b"MZ")
        offset = struct.unpack_from("<I", executable, 0x3C)[0]
        self.assertEqual(executable[offset:offset + 4], b"PE\0\0")
        self.assertEqual(struct.unpack_from("<H", executable, offset + 4)[0], 0x8664)
        # En-tête optionnel PE32+ : sous-système 2 = programme graphique, donc aucune fenêtre d’invite de commande.
        self.assertEqual(struct.unpack_from("<H", executable, offset + 24)[0], 0x20B)
        self.assertEqual(struct.unpack_from("<H", executable, offset + 24 + 68)[0], 2)
        self.assertIn("runtime\\python.exe".encode("utf-16-le"), executable)
        self.assertIn("--lanceur".encode("utf-16-le"), executable)

    def test_update_replaces_the_launchers_shipped_in_the_package(self):
        spec = importlib.util.spec_from_file_location("package_server", ROOT / "server.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with ZipFile(ARCHIVE) as archive:
            names = set(archive.namelist())
        for name in ("Soundcrossing.exe", "Lancer Soundcrossing.bat"):
            self.assertIn(name, module.UPDATABLE)
        for name in module.UPDATABLE:
            self.assertIn(f"{PREFIX}{name}", names)

    def test_extracted_application_serves_assets_with_spaces_and_unicode_paths(self):
        with extracted_server() as (base, module):
            with urlopen(f"{base}/health", timeout=5) as response:
                self.assertEqual(json.load(response)["identity"], module.IDENTITY)
            for path in ["/", "/styles.css", "/club.css", "/assets/soundcrossing-logo.jpg", "/assets/soundcrossing-logo.png", "/dist/models.js", "/dist/core.js", "/dist/app.js", "/vendor/xlsx.full.min.js"]:
                with urlopen(f"{base}{path}", timeout=5) as response:
                    self.assertEqual(response.status, 200)
                    self.assertTrue(response.read(), path)
            for path in ["/runtime/python.exe", "/server.py", "/DISTRIBUTION.json", "/sauvegardes/session.json"]:
                with self.assertRaises(HTTPError) as result:
                    urlopen(f"{base}{path}", timeout=5)
                self.assertEqual(result.exception.code, 404)


if __name__ == "__main__":
    unittest.main()
