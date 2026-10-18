"""La copie disque de la session : écriture par la page, refus des autres sites, relecture."""
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
URL = "http://127.0.0.1:8767"


class ServerDataTest(unittest.TestCase):
    def setUp(self):
        self.data = tempfile.TemporaryDirectory()
        env = {**os.environ, "SOUNDCROSSING_DATA": self.data.name}
        self.server = subprocess.Popen([sys.executable, str(ROOT / "server.py"), "--no-open", "--no-update"], env=env,
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(50):
            try:
                urlopen(f"{URL}/health", timeout=1)
                break
            except OSError:
                time.sleep(0.1)

    def tearDown(self):
        self.server.terminate()
        self.server.wait()
        self.data.cleanup()

    def put(self, body, origin=URL, kind="application/json"):
        request = Request(f"{URL}/data", data=body, method="PUT", headers={"Origin": origin, "Content-Type": kind})
        try:
            return urlopen(request, timeout=2).status
        except HTTPError as error:
            return error.code

    def test_saved_session_is_read_back_and_previous_kept(self):
        with self.assertRaises(HTTPError):
            urlopen(f"{URL}/data", timeout=2)
        self.assertEqual(self.put(json.dumps({"session": {"n": 1}}).encode()), 204)
        self.assertEqual(self.put(json.dumps({"session": {"n": 2}}).encode()), 204)
        self.assertEqual(json.load(urlopen(f"{URL}/data", timeout=2)), {"session": {"n": 2}})
        previous = Path(self.data.name) / "session-precedente.json"
        self.assertEqual(json.loads(previous.read_text()), {"session": {"n": 1}})

    def test_other_sites_and_invalid_bodies_are_refused(self):
        self.assertEqual(self.put(b'{"session":{}}', origin="https://exemple.com"), 403)
        self.assertEqual(self.put(b'{"session":{}}', kind="text/plain"), 403)
        self.assertEqual(self.put(b"pas du json"), 400)
        self.assertFalse((Path(self.data.name) / "session.json").exists())


if __name__ == "__main__":
    unittest.main()
