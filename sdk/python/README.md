# moon369 (Python)

Moon time and signed Moonmarks for Python. Exact to the nanosecond, the same answers as
[api.moon369.org](https://moon369.org/api) and the `moon369` npm package, with offline verification of Moon's
receipts: Ed25519, post-quantum ML-DSA-65, and the public drand beacon.

```sh
pip install moon369
```

```python
import moon369

moon369.moonmark()                              # '1928.05.07 11:48:26.890049876' (now)
moon369.moonmark(datetime(2026, 11, 17, tzinfo=timezone.utc))
moon369.moon()                                  # {'cycle': 1928, 'moon': 5, 'day': 7, 'hour': 11, ...}
moon369.from_moonmark('1928.05.07 11:48:26')    # Unix nanoseconds
moon369.moonmark_url('1928.05.07 11:48:26')     # 'https://moon369.org/m/1928.05.07-11.48.26'
```

## Signed Moonmarks

```python
sha = moon369.fingerprint(open('contract.pdf', 'rb'))   # SHA-256: the only thing you send Moon
res = moon369.sign(sha)                                  # online: Moon signs it now
receipt = res['receipt']

keys = moon369.fetch_keys()                              # once; cache them
moon369.verify(receipt, keys=keys, content=open('contract.pdf', 'rb'))
# {'valid': True, 'moonmark': '1928.05.07 ...', 'unix_ns': ..., 'post_quantum': True, 'not_before': {...}}
# or {'valid': False, 'reason': 'bad_signature' | 'content_mismatch' | ...}
```

With `keys` passed in, verification makes no network calls. Reasons match the npm package exactly. Checking the
drand beacon (pure Python BLS12-381) takes about a second; pass `check_beacon=False` to skip it when speed matters.

## Conformance

`tests/test_vectors.py` runs Moon's shared vectors (`sdk/vectors.json`), the same ones the npm, Go and Rust SDKs pass:

```sh
python -m unittest discover -s tests
```

If you show Moon time from this package in an app, please show the "Powered by Moon" badge: https://moon369.org/api#attribution
