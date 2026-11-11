"""Offline tests for the What If host pipeline (run: python3 -m unittest discover -s tests)."""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

HOST = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HOST))

import host_lib  # noqa: E402
import host_root  # noqa: E402
import host_timing  # noqa: E402
import make_cover  # noqa: E402


class HostLib(unittest.TestCase):
    def test_comp_id_from_slug(self):
        self.assertEqual(host_lib.comp_id("ice-melts-overnight"), "IceMeltsOvernight")
        self.assertEqual(host_lib.comp_id("bees-vanish"), "BeesVanish")
        with self.assertRaises(ValueError):
            host_lib.comp_id("../etc")

    def test_ready_episodes_come_from_folders_and_ready(self):
        with tempfile.TemporaryDirectory() as d:
            s = Path(d)
            for slug, ok in (("alpha-one", True), ("beta", True), ("half-written", False)):
                ep = s / "src/episodes" / slug
                ep.mkdir(parents=True)
                (ep / "index.tsx").write_text("export const Episode = 1;\nexport const TOTAL = 2;\n" if ok else "// wip\n")
            (s / "READY").write_text("beta\nalpha-one\nhalf-written\nmissing\n# comment\n")
            self.assertEqual(host_lib.ready_episodes(s), [("beta", "Beta"), ("alpha-one", "AlphaOne")])

    def test_paths_follow_env(self):
        with tempfile.TemporaryDirectory() as d:
            old = dict(os.environ)
            try:
                os.environ["STUDIO_MEDIA_ROOT"] = d
                os.environ.pop("WHATIF_WORK", None)
                os.environ.pop("WHATIF_VOICE_DIR", None)
                self.assertEqual(host_lib.work_dir(), Path(d).resolve() / "work/what-if")
                self.assertEqual(host_lib.voice_dir(), Path(d).resolve() / "work/what-if/voice")
                self.assertEqual(host_lib.voice_dir(d + "/x"), Path(d).resolve() / "x")
                os.environ["CHROME"] = "/opt/any/chrome"
                self.assertEqual(host_lib.find_chrome(), "/opt/any/chrome")
            finally:
                os.environ.clear()
                os.environ.update(old)

    def test_no_machine_specific_paths(self):
        for f in list(HOST.glob("*.py")) + list(HOST.glob("*.sh")):
            src = f.read_text(encoding="utf-8")
            for bad in ("/Users/", "Documents/ChatGPT", "mac-arm64", "jakkarin"):
                self.assertNotIn(bad, src, f"{f.name} contains {bad}")


class Timing(unittest.TestCase):
    def test_plan_uses_measured_durations_and_any_line_count(self):
        voices = [{"id": f"l{i}", "text": "ก ข", "duration_s": 2.0} for i in range(1, 10)]
        cues = [{"line": "l1", "spoken": "ก", "key": "ก", "color": "amber", "en": "A"},
                {"line": "l1", "spoken": "ข", "key": "ข", "color": "amber", "en": "B"}]
        p = host_timing.plan(voices, cues)
        self.assertEqual(len(p["segments"]), 9)
        self.assertEqual(p["lines"][0]["a"], round(host_timing.LEAD * 30))
        self.assertEqual(p["segments"][-1]["b"], p["total"])
        self.assertLessEqual(p["cues"][0]["b"], p["cues"][1]["a"])
        expected = host_timing.LEAD + 9 * 2.0 + sum(host_timing.gap_for(i, 9) for i in range(9))
        self.assertAlmostEqual(p["seconds"], expected)

    def test_voice_folder_lookup(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "ep/voice").mkdir(parents=True)
            (root / "ep/voice/audio_meta.json").write_text("{}")
            self.assertEqual(host_timing.find_voice_folder(root, "ep"), root / "ep/voice")
            with self.assertRaises(SystemExit):
                host_timing.find_voice_folder(root, "other")


class RootAndCover(unittest.TestCase):
    def test_generated_root_lists_ready_episodes(self):
        out = host_root.render([("bees-vanish", "BeesVanish")])
        self.assertIn("from './bees-vanish'", out)
        self.assertIn('<Composition id="BeesVanish"', out)

    def test_cover_html_escapes_text(self):
        html = make_cover.cover_html("<k>", "h1", "h2", "q&a")
        self.assertIn("&lt;k&gt;", html)
        self.assertIn("q&amp;a", html)
        self.assertIn("fonts/ibm-plex-thai-bold.ttf", html)


if __name__ == "__main__":
    unittest.main()
