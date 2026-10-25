"""La copie disque : écriture par la page, refus des autres sites et des versions anciennes, relecture, mise à jour récupérable.

Chaque test lance son propre serveur sur un port libre, avec un dossier de données temporaire :
le serveur réel (port 8767) et les vraies données ne sont jamais touchés.
"""
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
import importlib.util
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
IDENTITY = sha256(str(ROOT).encode()).hexdigest()


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class ServerDataTest(unittest.TestCase):
    def setUp(self):
        self.data = tempfile.TemporaryDirectory()
        self.url = f"http://127.0.0.1:{free_port()}"
        env = {**os.environ, "SOUNDCROSSING_DATA": self.data.name, "SOUNDCROSSING_PORT": self.url.rsplit(":", 1)[1]}
        self.server = subprocess.Popen([sys.executable, str(ROOT / "server.py"), "--no-open", "--no-update"], env=env,
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                info = json.load(urlopen(f"{self.url}/health", timeout=1))
                break
            except OSError:
                time.sleep(0.1)
        else:
            self.fail("Le serveur de test n’a pas démarré.")
        # On parle bien à notre propre serveur, pas à un autre programme sur ce port.
        self.assertEqual(info.get("identity"), IDENTITY)

    def tearDown(self):
        self.server.terminate()
        self.server.wait()
        self.data.cleanup()

    def put(self, body, origin=None, kind="application/json", path="/data", base=""):
        headers = {"Origin": origin or self.url, "Content-Type": kind}
        if base is not None:
            headers["X-Base-Revision"] = base
        request = Request(f"{self.url}{path}", data=body, method="PUT", headers=headers)
        try:
            return urlopen(request, timeout=5).status
        except HTTPError as error:
            return error.code

    def test_saved_session_is_read_back_and_previous_kept(self):
        with self.assertRaises(HTTPError):
            urlopen(f"{self.url}/data", timeout=2)
        self.assertEqual(self.put(json.dumps({"session": {"n": 1}, "revision": "r1"}).encode()), 204)
        self.assertEqual(self.put(json.dumps({"session": {"n": 2}, "revision": "r2"}).encode(), base="r1"), 204)
        self.assertEqual(json.load(urlopen(f"{self.url}/data", timeout=2))["session"], {"n": 2})
        previous = Path(self.data.name) / "session-precedente.json"
        self.assertEqual(json.loads(previous.read_text())["session"], {"n": 1})

    def test_stale_copy_never_replaces_the_current_one_even_with_a_newer_time(self):
        # Les deux navigateurs partent de r1. Le premier enregistre r2 ; le second, plus tard, arrive avec une copie périmée.
        self.assertEqual(self.put(json.dumps({"session": {"n": "départ"}, "revision": "r1", "savedAt": 100}).encode()), 204)
        self.assertEqual(self.put(json.dumps({"session": {"n": "ajout A"}, "revision": "r2", "savedAt": 200}).encode(), base="r1"), 204)
        self.assertEqual(self.put(json.dumps({"session": {"n": "périmé B"}, "revision": "r3", "savedAt": 300}).encode(), base="r1"), 409)
        self.assertEqual(self.put(json.dumps({"session": {"n": "sans révision"}, "revision": "r4"}).encode(), base=None), 428)
        self.assertEqual(json.load(urlopen(f"{self.url}/data", timeout=2))["session"], {"n": "ajout A"})

    def test_wod_has_its_own_disk_copy(self):
        self.assertEqual(self.put(json.dumps({"session": {}, "revision": "h1"}).encode()), 204)
        self.assertEqual(self.put(json.dumps({"session": {}}).encode(), path="/data/wod"), 400)
        self.assertEqual(self.put(json.dumps({"version": 2, "events": [], "revision": "w1"}).encode(), path="/data/wod"), 204)
        self.assertEqual(json.load(urlopen(f"{self.url}/data/wod", timeout=2))["events"], [])
        self.assertEqual(json.load(urlopen(f"{self.url}/data", timeout=2))["revision"], "h1")

    def test_parallel_writes_from_the_same_start_keep_only_one_and_leave_no_temporary_file(self):
        bodies = [json.dumps({"session": {"n": n}, "revision": f"r{n}"}).encode() for n in range(1, 31)]
        with ThreadPoolExecutor(max_workers=10) as pool:
            codes = list(pool.map(self.put, bodies))
        self.assertEqual(codes.count(204), 1)
        self.assertEqual(codes.count(409), 29)
        winner = codes.index(204) + 1
        self.assertEqual(json.load(urlopen(f"{self.url}/data", timeout=2))["revision"], f"r{winner}")
        self.assertEqual([p.name for p in Path(self.data.name).glob("*.tmp")], [])

    def test_other_sites_and_invalid_bodies_are_refused(self):
        self.assertEqual(self.put(b'{"session":{}}', origin="https://exemple.com"), 403)
        self.assertEqual(self.put(b'{"session":{}}', kind="text/plain"), 403)
        self.assertEqual(self.put(b"pas du json"), 400)
        self.assertFalse((Path(self.data.name) / "session.json").exists())


    def stop(self, headers):
        request = Request(f"{self.url}/stop", data=b"", method="POST", headers=headers)
        try:
            return urlopen(request, timeout=5).status
        except HTTPError as error:
            return error.code

    def test_only_a_launch_from_the_same_folder_can_stop_the_server(self):
        self.assertEqual(self.stop({"X-Identity": "autre"}), 403)
        self.assertEqual(self.stop({"X-Identity": IDENTITY, "Origin": self.url}), 403)
        self.assertIsNone(self.server.poll())
        self.assertEqual(self.stop({"X-Identity": IDENTITY}), 204)
        self.assertEqual(self.server.wait(timeout=5), 0)

    def launch(self, code=None):
        """Nouveau lancement du même dossier ; code : version simulée de server.py (mise à jour arrivée entre-temps)."""
        script = ("import sys; sys.argv = ['server.py', '--no-open', '--no-update']; sys.path.insert(0, %r)\n"
                  "import server\n" % str(ROOT)) + (f"server.CODE = {code!r}\n" if code else "") + "server.main()"
        env = {**os.environ, "SOUNDCROSSING_DATA": self.data.name, "SOUNDCROSSING_PORT": self.url.rsplit(":", 1)[1]}
        return subprocess.Popen([sys.executable, "-c", script], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def test_same_version_launched_again_keeps_the_running_server(self):
        self.assertEqual(self.launch().wait(timeout=10), 0)
        self.assertIsNone(self.server.poll())

    def test_launch_after_an_update_replaces_the_previous_version(self):
        newer = self.launch("nouvelle-version")
        try:
            self.assertEqual(self.server.wait(timeout=10), 0)  # l’ancien serveur s’est arrêté seul
            for _ in range(50):
                try:
                    info = json.load(urlopen(f"{self.url}/health", timeout=1))
                    break
                except OSError:
                    time.sleep(0.1)
            self.assertEqual(info["code"], "nouvelle-version")
            self.assertIsNone(newer.poll())
        finally:
            newer.terminate()
            newer.wait()


class UpdateInstallTest(unittest.TestCase):
    """La mise à jour remplace tout ou rien, et garde la version précédente."""

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        root = Path(self.folder.name)
        spec = importlib.util.spec_from_file_location("isolated_update_server", ROOT / "server.py")
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.module.ROOT, self.module.VERSION_FILE, self.module.BACKUP_DIR = root, root / "VERSION", root / "maj-precedente"
        self.names = list(self.module.REQUIRED)
        for name in self.names:
            (root / name).parent.mkdir(parents=True, exist_ok=True)
            (root / name).write_text("ancien")
        (root / "VERSION").write_text("v1")

    def tearDown(self):
        self.folder.cleanup()

    def contents(self):
        return {name: (Path(self.folder.name) / name).read_text() for name in self.names}

    def test_complete_version_is_installed_and_previous_kept(self):
        self.module.install({name: b"nouveau" for name in self.names}, "v2")
        self.assertEqual(set(self.contents().values()), {"nouveau"})
        self.assertEqual((Path(self.folder.name) / "VERSION").read_text(), "v2")
        self.assertEqual((Path(self.folder.name) / "maj-precedente" / "dist" / "app.js").read_text(), "ancien")
        self.assertEqual(list(Path(self.folder.name).rglob("*.maj")), [])

    def test_incomplete_version_is_refused_without_touching_files(self):
        files = {name: b"nouveau" for name in self.names if name != "dist/app.js"}
        with self.assertRaises(ValueError):
            self.module.install(files, "v2")
        self.assertEqual(set(self.contents().values()), {"ancien"})

    def test_failure_in_the_middle_restores_the_previous_version(self):
        real_replace, calls = Path.replace, []

        def failing_replace(path, target):
            calls.append(path)
            if len(calls) == 3:
                raise OSError("coupure simulée")
            return real_replace(path, target)

        with mock.patch.object(Path, "replace", failing_replace), self.assertRaises(OSError):
            self.module.install({name: b"nouveau" for name in self.names}, "v2")
        self.assertEqual(set(self.contents().values()), {"ancien"})
        self.assertEqual((Path(self.folder.name) / "VERSION").read_text(), "v1")
        self.assertEqual(list(Path(self.folder.name).rglob("*.maj")), [])

    def test_running_launcher_is_renamed_then_replaced(self):
        """Comme Windows : impossible d’écraser Soundcrossing.exe en marche, mais on peut le renommer."""
        root = Path(self.folder.name)
        (root / "Soundcrossing.exe").write_text("ancien lanceur")
        real_replace, running = Path.replace, {"inode": (root / "Soundcrossing.exe").stat().st_ino}

        def windows_replace(path, target):
            target = Path(target)
            if target.exists() and target.stat().st_ino == running["inode"]:
                raise PermissionError("fichier en cours d’utilisation")
            return real_replace(path, target)

        files = {name: b"nouveau" for name in [*self.names, "Soundcrossing.exe"]}
        with mock.patch.object(Path, "replace", windows_replace):
            self.module.install(files, "v2")
        self.assertEqual((root / "Soundcrossing.exe").read_text(), "nouveau")
        self.assertEqual((root / "Soundcrossing.exe.ancien").read_text(), "ancien lanceur")
        self.assertEqual(set(self.contents().values()), {"nouveau"})
        self.assertEqual((root / "VERSION").read_text(), "v2")
        # Version suivante avec le même lanceur : il n’est pas renommé une nouvelle fois.
        (root / "Soundcrossing.exe.ancien").unlink()
        running["inode"] = (root / "Soundcrossing.exe").stat().st_ino
        with mock.patch.object(Path, "replace", windows_replace):
            self.module.install(files, "v3")
        self.assertFalse((root / "Soundcrossing.exe.ancien").exists())
        self.assertEqual((root / "VERSION").read_text(), "v3")

    def test_unchanged_server_is_not_restarted(self):
        with mock.patch.object(self.module.os, "execv") as execv, mock.patch.object(self.module.subprocess, "call") as call:
            self.module.restart_if_changed()
        execv.assert_not_called()
        call.assert_not_called()

    def test_mac_restarts_on_the_new_server_after_an_update(self):
        self.module.CODE = "ancien"
        with mock.patch.object(self.module, "WINDOWS", False), mock.patch.object(self.module.os, "execv") as execv, \
                mock.patch.dict(os.environ):
            self.module.restart_if_changed()
            self.assertEqual(os.environ["SOUNDCROSSING_NO_UPDATE"], "1")
        self.assertIn(str(ROOT / "server.py"), execv.call_args.args[1])

    def test_windows_waits_for_the_new_server_after_an_update(self):
        """Soundcrossing.exe surveille ce processus : il doit rester en vie tant que le nouveau serveur tourne."""
        self.module.CODE = "ancien"
        with mock.patch.object(self.module, "WINDOWS", True), mock.patch.object(self.module.os, "execv") as execv, \
                mock.patch.object(self.module.subprocess, "CREATE_NO_WINDOW", 0x08000000, create=True), \
                mock.patch.object(self.module, "WITHOUT_WINDOW", True), \
                mock.patch.object(self.module.subprocess, "call", return_value=3) as call, mock.patch.dict(os.environ), \
                self.assertRaises(SystemExit) as stop:
            self.module.restart_if_changed()
        execv.assert_not_called()
        self.assertEqual(stop.exception.code, 3)
        self.assertIn(str(ROOT / "server.py"), call.call_args.args[0])
        self.assertEqual(call.call_args.kwargs["creationflags"], 0x08000000)


if __name__ == "__main__":
    unittest.main()
