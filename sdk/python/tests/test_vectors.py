"""Moon SDK conformance: every vector in sdk/vectors.json must pass."""
import json, pathlib, unittest
import moon369

V = json.loads((pathlib.Path(__file__).resolve().parents[2] / "vectors.json").read_text())


class Vectors(unittest.TestCase):
    def test_conversions(self):
        for c in V["conversions"]:
            self.assertEqual(moon369.moonmark(int(c["unix_ns"])), c["moonmark"], c)
            self.assertEqual(moon369.from_moonmark(c["moonmark"]), int(c["earliest_unix_ns"]), c)

    def test_valid(self):
        for t in V["valid"]:
            r = moon369.verify(t["receipt"], keys=V["keys"], sha256=V["sha256"])
            self.assertTrue(r["valid"], (t["name"], r))
            if "not_before_round" in t:
                self.assertEqual(r["not_before"]["round"], t["not_before_round"])
            if t.get("post_quantum"):
                self.assertTrue(r["post_quantum"])

    def test_invalid(self):
        for t in V["invalid"]:
            r = moon369.verify(t["receipt"], keys=V["keys"])
            self.assertFalse(r["valid"], t["name"])
            self.assertEqual(r["reason"], t["reason"], t["name"])

    def test_content(self):
        r = moon369.verify(V["valid"][0]["receipt"], keys=V["keys"], content=V["text"])
        self.assertTrue(r["valid"])
        r = moon369.verify(V["valid"][0]["receipt"], keys=V["keys"], sha256=V["content"]["other"])
        self.assertEqual(r["reason"], "content_mismatch")

    def test_url(self):
        self.assertEqual(moon369.moonmark_url("1928.05.07 11:48:26.890049876"), "https://moon369.org/m/1928.05.07-11.48.26.890049876")


if __name__ == "__main__":
    unittest.main()
