"""Offline tests for the ElevenLabs narration helper. A loopback HTTP fake stands in for the API; no network."""
import io
import json
import os
import sys
import tempfile
import threading
import unittest
import wave
from contextlib import redirect_stdout
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))

import elevenlabs_voice as ev  # noqa: E402
import narrate_elevenlabs as ne  # noqa: E402

VOICES = {"voices": [
    {"voice_id": "premade-1", "name": "Rachel", "category": "premade"},
    {"voice_id": "own-123", "name": "jk", "category": "cloned"},
    {"voice_id": "own-456", "name": "Somchai", "category": "professional"},
]}


class Fake(BaseHTTPRequestHandler):
    calls = []
    count = [1000]

    def log_message(self, *a):
        pass

    def _send(self, body, ctype="application/json"):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        Fake.calls.append(("GET", self.path, self.headers.get("xi-api-key")))
        if self.path == "/v1/voices":
            self._send(json.dumps(VOICES).encode())
        elif self.path == "/v1/user/subscription":
            self._send(json.dumps({"character_count": Fake.count[0], "character_limit": 9999}).encode())
        else:
            self.send_error(404)

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        Fake.calls.append(("POST", self.path, body))
        Fake.count[0] += len(body["text"])
        self._send(b"\x00\x00" * 4800, "audio/pcm")  # 0.1 s of 48 kHz mono silence


class VoiceByName(unittest.TestCase):
    def test_name_is_required_and_has_no_default(self):
        with self.assertRaises(SystemExit):
            ev.voice_name(None, env={})
        self.assertEqual(ev.voice_name(None, env={"ELEVENLABS_VOICE_NAME": " jk "}), "jk")
        self.assertEqual(ev.voice_name("Somchai", env={"ELEVENLABS_VOICE_NAME": "jk"}), "Somchai")

    def test_pick_exact_name_never_falls_back(self):
        self.assertEqual(ev.pick_voice(VOICES["voices"], "JK")["voice_id"], "own-123")
        with self.assertRaises(SystemExit):
            ev.pick_voice(VOICES["voices"], "jkx")
        with self.assertRaises(SystemExit):
            ev.pick_voice(VOICES["voices"], "Rachel")  # stock premade voice refused
        with self.assertRaises(SystemExit):
            ev.pick_voice(VOICES["voices"] + [{"voice_id": "dup", "name": "jk", "category": "cloned"}], "jk")

    def test_no_hard_coded_voice_ids_in_sources(self):
        import re
        for f in SCRIPTS.glob("*.py"):
            src = f.read_text(encoding="utf-8")
            self.assertIsNone(re.search(r"['\"][A-Za-z0-9]{20}['\"]", src), f"{f.name} looks like it embeds a voice id")


class Narrate(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), Fake)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def setUp(self):
        self.old = dict(os.environ)
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        (self.dir / "lines.json").write_text(json.dumps([{"id": "l01", "text": "สวัสดี"}, {"id": "l02", "text": "ทะเลลึก"}]),
                                              encoding="utf-8")
        os.environ.pop("ELEVENLABS_API_KEY", None)
        os.environ["ELEVENLABS_API_BASE"] = f"http://127.0.0.1:{self.server.server_port}"
        Fake.calls.clear()

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self.old)
        self.tmp.cleanup()

    def run_main(self, *args):
        buf = io.StringIO()
        with redirect_stdout(buf):
            ne.main(["--lines", str(self.dir / "lines.json"), "--out", str(self.dir / "voice"), *args])
        return buf.getvalue()

    def test_dry_run_needs_no_key_and_makes_no_call(self):
        os.environ["ELEVENLABS_VOICE_NAME"] = "jk"
        out = json.loads(self.run_main("--dry-run"))
        self.assertEqual(out["characters_to_send"], len("สวัสดี") + len("ทะเลลึก"))
        self.assertEqual(Fake.calls, [])

    def test_missing_voice_name_fails_before_any_call(self):
        os.environ["ELEVENLABS_API_KEY"] = "test-only-key"
        with self.assertRaises(SystemExit):
            self.run_main()
        self.assertEqual(Fake.calls, [])

    def test_real_run_writes_per_line_wavs_and_meta(self):
        os.environ["ELEVENLABS_API_KEY"] = "test-only-key"
        os.environ["ELEVENLABS_VOICE_NAME"] = "jk"
        out = self.run_main("--format", "pcm_48000")
        self.assertNotIn("test-only-key", out)
        self.assertIn("credits used: 13", out)
        posts = [c for c in Fake.calls if c[0] == "POST"]
        self.assertEqual(len(posts), 2)
        self.assertTrue(all(p[1].startswith("/v1/text-to-speech/own-123?") for p in posts))
        self.assertEqual(posts[0][2]["language_code"], "th")
        meta = json.loads((self.dir / "voice/audio_meta.json").read_text(encoding="utf-8"))
        self.assertEqual([v["id"] for v in meta["voices"]], ["l01", "l02"])
        self.assertEqual(meta["voice_name"], "jk")
        v = meta["voices"][0]
        self.assertEqual((v["sample_rate"], v["channels"], v["file"]), (48000, 1, "l01.wav"))
        self.assertAlmostEqual(v["duration_s"], 0.1)
        with wave.open(str(self.dir / "voice/l01.wav")) as w:
            self.assertEqual(w.getframerate(), 48000)
        # Second run reuses the wavs: no new paid POST.
        Fake.calls.clear()
        self.run_main("--format", "pcm_48000")
        self.assertEqual([c for c in Fake.calls if c[0] == "POST"], [])

    def test_unknown_voice_name_stops_without_posting(self):
        os.environ["ELEVENLABS_API_KEY"] = "test-only-key"
        os.environ["ELEVENLABS_VOICE_NAME"] = "nobody"
        with self.assertRaises(SystemExit):
            self.run_main("--format", "pcm_48000")
        self.assertEqual([c for c in Fake.calls if c[0] == "POST"], [])


if __name__ == "__main__":
    unittest.main()
