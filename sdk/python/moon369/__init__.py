"""moon369: Moon time and signed Moonmarks for Python. Exact to the nanosecond, the same answers as
api.moon369.org and the moon369 npm package, and offline verification of Moon's receipts.

    import moon369
    moon369.moonmark()                              # '1928.05.07 11:48:26.890049876' (now)
    moon369.from_moonmark('1928.05.07 11:48:26')    # Unix nanoseconds (int)
    keys = moon369.fetch_keys()                     # once; cache them
    moon369.verify(receipt, keys=keys, content=open('file.pdf', 'rb'))
"""
import json, time, urllib.request, urllib.error
from datetime import datetime
from ._moon import to_moon, format_moonmark, parse_moonmark, to_unix_ns, moon_length, MoonTime
from ._receipt import verify, verify_beacon, fingerprint, fetch_keys, signed_bytes, beacon_round_time, KEYS_URL, QUICKNET

__all__ = ["moonmark", "moon", "from_moonmark", "moonmark_url", "verify", "verify_beacon", "fingerprint", "fetch_keys",
           "sign", "signed_bytes", "to_moon", "format_moonmark", "parse_moonmark", "to_unix_ns", "moon_length", "MoonTime"]
__version__ = "1.0.0"
API = "https://api.moon369.org"


def _ns(moment=None):
    if moment is None:
        return time.time_ns()
    if isinstance(moment, datetime):
        if moment.tzinfo is None:
            raise ValueError("use a timezone-aware datetime")
        return int(moment.timestamp()) * 1_000_000_000 + moment.microsecond * 1000
    if isinstance(moment, int):
        return moment                  # Unix nanoseconds
    if isinstance(moment, float):
        return int(round(moment * 1e9))  # Unix seconds
    raise TypeError("moment must be a datetime, Unix nanoseconds (int) or Unix seconds (float)")


def moonmark(moment=None, digits=9):
    """The Moonmark for a moment (default now): '1928.05.07 11:48:26.890049876'."""
    return format_moonmark(to_moon(_ns(moment)), digits)


def moon(moment=None):
    """The Moon date and time for a moment: cycle, moon, day (lune), hour, minute, second, nanosecond."""
    return to_moon(_ns(moment))


def from_moonmark(mark):
    """A Moonmark back to Unix nanoseconds (the earliest nanosecond it covers)."""
    return to_unix_ns(parse_moonmark(mark))


def moonmark_url(mark):
    """The Moonmark's page: https://moon369.org/m/1928.05.07-11.48.26.890049876"""
    return "https://moon369.org/m/" + mark.strip().replace(" ", "-").replace(":", ".")


def sign(sha256, key=None, label=None, api=API):
    """Have Moon sign a fingerprint (online). Returns Moon's response: receipt, signed_url, utc. Only the hash is sent."""
    body = {"sha256": sha256}
    if label:
        body["label"] = label[:120]
    headers = {"Content-Type": "application/json", "User-Agent": "moon369-py/" + __version__}
    if key:
        headers["Authorization"] = "Bearer " + key
    req = urllib.request.Request(api + "/v1/sign", data=json.dumps(body).encode(), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError("Moon returned %s: %s" % (e.code, e.read().decode("utf-8", "replace")[:200])) from None
