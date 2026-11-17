"""Moon time: exact integer conversion between Unix nanoseconds and Moonmarks. Mirrors moon.ts."""
import re

NS_PER_SECOND = 1_000_000_000
LUNATION_NS = 2_551_442_876_899_200          # 29.530588853 days in nanoseconds
YEAR_DAYS = 369
MOONS = 13
MOON_DAY_NS = 86_400 * NS_PER_SECOND        # in Moon nanoseconds
NUM = YEAR_DAYS * 86_400 * NS_PER_SECOND     # 31,881,600,000,000,000
DEN = MOONS * LUNATION_NS                    # 33,168,757,399,689,600
EPOCH_UNIX_NS = 947_182_440_000 * 1_000_000 - 24_736 * LUNATION_NS


def _first_day(m):          # first day-of-year (0-based) of moon index m (0-based)
    return -((-m * YEAR_DAYS) // MOONS)


def moon_length(moon):
    """Days in moon number 1 to 13: 28 or 29."""
    return _first_day(moon) - _first_day(moon - 1)


def unix_ns_to_moon_ns(unix_ns):
    return ((unix_ns - EPOCH_UNIX_NS) * NUM) // DEN


def moon_ns_to_unix_ns(moon_ns):
    return EPOCH_UNIX_NS + -((-moon_ns * DEN) // NUM)


class MoonTime(dict):
    """cycle, moon, day (lune), day_of_cycle, hour, minute, second, nanosecond, moon_ns. Also readable as attributes."""
    __getattr__ = dict.__getitem__


def to_moon(unix_ns):
    moon_ns = unix_ns_to_moon_ns(unix_ns)
    day_index = moon_ns // MOON_DAY_NS
    year = day_index // YEAR_DAYS
    doy = day_index - year * YEAR_DAYS
    m = (doy * MOONS) // YEAR_DAYS
    rest = moon_ns - day_index * MOON_DAY_NS
    ns = rest % NS_PER_SECOND
    sec = rest // NS_PER_SECOND
    return MoonTime(cycle=year, moon=m + 1, day=doy - _first_day(m) + 1, day_of_cycle=doy + 1,
                    hour=sec // 3600, minute=(sec // 60) % 60, second=sec % 60, nanosecond=ns, moon_ns=moon_ns)


def format_moonmark(t, digits=9):
    s = "%d.%02d.%02d %02d:%02d:%02d" % (t["cycle"], t["moon"], t["day"], t["hour"], t["minute"], t["second"])
    return s + ("." + ("%09d" % t["nanosecond"])[:digits] if digits > 0 else "")


_URL = re.compile(r"^(-?\d+\.\d{1,2}\.\d{1,2})-(\d{1,2})\.(\d{2})(?:\.(\d{2})(?:\.(\d{1,9}))?)?$")
_MARK = re.compile(r"^(-?\d+)\.(\d{1,2})\.(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?$")


def parse_moonmark(s):
    """A Moonmark ("1928.05.06 20:49:30.066087772", or the link form "1928.05.06-20.49.30.066087772") to its fields."""
    s = s.strip()
    u = _URL.match(s)
    if u:
        s = "%s %s:%s%s%s" % (u[1], u[2], u[3], ":" + u[4] if u[4] else "", "." + u[5] if u[5] else "")
    m = _MARK.match(s)
    if not m:
        raise ValueError("a Moonmark is YEAR.MM.DD HH:MM:SS.fraction")
    t = dict(cycle=int(m[1]), moon=int(m[2]), day=int(m[3]), hour=int(m[4] or 0), minute=int(m[5] or 0),
             second=int(m[6] or 0), nanosecond=int((m[7] or "0").ljust(9, "0")))
    if not 1 <= t["moon"] <= MOONS:
        raise ValueError("moon must be 1 to 13")
    if not 1 <= t["day"] <= moon_length(t["moon"]):
        raise ValueError("day must be 1 to %d in moon %d" % (moon_length(t["moon"]), t["moon"]))
    if t["hour"] > 23 or t["minute"] > 59 or t["second"] > 59:
        raise ValueError("time out of range")
    return t


def to_unix_ns(t):
    day_index = t["cycle"] * YEAR_DAYS + _first_day(t["moon"] - 1) + t["day"] - 1
    moon_ns = day_index * MOON_DAY_NS + (t["hour"] * 3600 + t["minute"] * 60 + t["second"]) * NS_PER_SECOND + t["nanosecond"]
    return moon_ns_to_unix_ns(moon_ns)
