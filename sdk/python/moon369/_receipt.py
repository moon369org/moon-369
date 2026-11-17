"""Offline verification of signed Moonmark receipts: Ed25519, ML-DSA-65 (v3) and the drand beacon. Mirrors receipt.ts."""
import base64, hashlib, json, re, urllib.request
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives.asymmetric import mldsa
from cryptography.exceptions import InvalidSignature
from ._moon import to_moon, format_moonmark

V1, V2, V3 = "moonmark-receipt/1", "moonmark-receipt/2", "moonmark-receipt/3"
PQ_ALG = "ML-DSA-65"
KEYS_URL = "https://api.moon369.org/v1/keys"
QUICKNET = {
    "public_key": "83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a",
    "period": 3, "genesis_time": 1692803367, "dst": b"BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_",
}
SKEW_NS = 10_000_000_000
_HEX64 = re.compile(r"^[0-9a-f]{64}$")


def b64url(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def fingerprint(data):
    """SHA-256 hex of bytes, text, or a file path (pathlib.Path / open file): the only thing you ever send Moon."""
    if isinstance(data, str):
        data = data.encode("utf-8")
    if hasattr(data, "read"):
        h = hashlib.sha256()
        for block in iter(lambda: data.read(1 << 20), b""):
            h.update(block)
        return h.hexdigest()
    if hasattr(data, "open"):
        with data.open("rb") as f:
            return fingerprint(f)
    return hashlib.sha256(data).hexdigest()


def fetch_keys(url=KEYS_URL):
    """Moon's public keys as {key_id: public_key}. Fetch once and cache: verification is then fully offline."""
    with urllib.request.urlopen(url, timeout=15) as r:
        return {k["key_id"]: k["public_key"] for k in json.load(r)["keys"]}


def signed_bytes(r):
    lines = [r["receipt"], "sha256:" + r["sha256"], r["moonmark"], r["unix_ns"], r["key_id"]]
    if r["receipt"] in (V2, V3) and r.get("beacon"):
        b = r["beacon"]
        lines.append("%s:%d:%s" % (b["network"], b["round"], b["signature"]))
    if r["receipt"] == V3 and r.get("pq"):
        lines.append("ml-dsa-65:" + r["pq"]["key_id"])
    return "\n".join(lines).encode("utf-8")


def beacon_round_time(rnd, chain=QUICKNET):
    """Unix nanoseconds when a drand round is first published."""
    return (chain["genesis_time"] + (rnd - 1) * chain["period"]) * 1_000_000_000


def verify_beacon(b, chain=QUICKNET):
    """Check a drand quicknet round against the network's public key (BLS12-381, signature on G1). Offline."""
    try:
        from py_ecc.bls.hash_to_curve import hash_to_G1
        from py_ecc.bls.point_compression import decompress_G1, decompress_G2
        from py_ecc.optimized_bls12_381 import pairing, G2, neg, is_inf, multiply, curve_order, normalize, eq
        if not isinstance(b.get("round"), int) or b["round"] < 1 or not re.match(r"^[0-9a-f]{96}$", b.get("signature", "")):
            return False
        sig = decompress_G1(int.from_bytes(bytes.fromhex(b["signature"]), "big"))
        pk_b = bytes.fromhex(chain["public_key"])
        pk = decompress_G2((int.from_bytes(pk_b[:48], "big"), int.from_bytes(pk_b[48:], "big")))
        if is_inf(sig) or not is_inf(multiply(sig, curve_order)):
            return False
        msg = hashlib.sha256(b["round"].to_bytes(8, "big")).digest()
        hm = hash_to_G1(msg, chain["dst"], hashlib.sha256)
        return pairing(G2, sig) == pairing(pk, hm)
    except Exception:
        return False


def verify(receipt, keys=None, content=None, sha256=None, check_beacon=True):
    """Check a signed Moonmark receipt. Returns {"valid": True, "moonmark", "unix_ns", "key_id", ...} or
    {"valid": False, "reason": ...} with the same reasons as the npm package. Offline when you pass keys."""
    r = receipt
    if not isinstance(r, dict):
        return {"valid": False, "reason": "not_a_receipt"}
    if r.get("receipt") not in (V1, V2, V3):
        return {"valid": False, "reason": "unknown_version"}
    b = r.get("beacon")
    beacon_ok = isinstance(b, dict) and b.get("network") == "drand-quicknet" and isinstance(b.get("round"), int) and isinstance(b.get("signature"), str)
    if r["receipt"] == V2 and not beacon_ok:
        return {"valid": False, "reason": "malformed"}
    pq = r.get("pq")
    if r["receipt"] == V3 and ((b is not None and not beacon_ok) or not isinstance(pq, dict) or pq.get("alg") != PQ_ALG
                               or not isinstance(pq.get("key_id"), str) or ("signature" in pq and not isinstance(pq["signature"], str))):
        return {"valid": False, "reason": "malformed"}
    for f in ("sha256", "moonmark", "unix_ns", "key_id", "signature"):
        if not isinstance(r.get(f), str):
            return {"valid": False, "reason": "malformed"}
    if not _HEX64.match(r["sha256"]) or not re.match(r"^-?\d+$", r["unix_ns"]):
        return {"valid": False, "reason": "malformed"}
    keys = keys if keys is not None else fetch_keys()
    pk = keys.get(r["key_id"])
    if not pk:
        return {"valid": False, "reason": "unknown_key"}
    body = {k: r[k] for k in ("receipt", "sha256", "moonmark", "unix_ns", "key_id")}
    if r["receipt"] != V1 and b:
        body["beacon"] = b
    if r["receipt"] == V3:
        body["pq"] = {"alg": PQ_ALG, "key_id": pq["key_id"]}
    msg = signed_bytes(body)
    try:
        Ed25519PublicKey.from_public_bytes(b64url(pk)).verify(b64url(r["signature"]), msg)
    except (InvalidSignature, ValueError):
        return {"valid": False, "reason": "bad_signature"}
    out = {"valid": True, "moonmark": r["moonmark"], "unix_ns": int(r["unix_ns"]), "key_id": r["key_id"]}
    if r["receipt"] == V3:
        out["post_quantum"] = False
        if "signature" in pq:
            ppk = keys.get(pq["key_id"])
            if not ppk:
                return {"valid": False, "reason": "unknown_key"}
            try:
                mldsa.MLDSA65PublicKey.from_public_bytes(b64url(ppk)).verify(b64url(pq["signature"]), msg)
            except (InvalidSignature, ValueError):
                return {"valid": False, "reason": "bad_pq_signature"}
            out["post_quantum"] = True
    ns = int(r["unix_ns"])
    if "beacon" in body:
        if check_beacon and not verify_beacon(b):
            return {"valid": False, "reason": "bad_beacon"}
        nb = beacon_round_time(b["round"])
        if ns + SKEW_NS < nb:
            return {"valid": False, "reason": "beacon_after_moment"}
        out["not_before"] = {"unix_ns": nb, "round": b["round"]}
    if format_moonmark(to_moon(ns)) != r["moonmark"]:
        return {"valid": False, "reason": "moonmark_mismatch"}
    want = sha256.lower() if sha256 is not None else (fingerprint(content) if content is not None else None)
    if want is not None and want != r["sha256"]:
        return {"valid": False, "reason": "content_mismatch"}
    return out
