# moon369 (Rust)

Moon time and signed Moonmarks for Rust. Exact to the nanosecond, the same answers as
[api.moon369.org](https://moon369.org/api) and the `moon369` npm package, with offline verification of Moon's
receipts: Ed25519, post-quantum ML-DSA-65, and the public drand beacon.

```toml
[dependencies]
moon369 = "1"
```

```rust
moon369::now();                                          // "1928.05.07 11:48:26.890049876"
moon369::moonmark_ns(1_794_886_514_418_000_000);         // any Unix nanosecond
let ns = moon369::from_moonmark("1928.05.07 11:48:26")?;  // earliest Unix nanosecond (BigInt)
moon369::moonmark_url("1928.05.07 11:48:26");            // "https://moon369.org/m/1928.05.07-11.48.26"
```

## Signed Moonmarks

```rust
let receipt = moon369::parse_receipt(&json)?;            // a receipt, or Moon's whole sign response
let keys = /* fetch https://api.moon369.org/v1/keys once and cache: key_id -> public_key */;
match moon369::verify(&receipt, &keys, Some(&moon369::fingerprint(&file_bytes))) {
    Ok(v) => println!("existed at {} (post-quantum: {:?})", v.moonmark, v.post_quantum),
    Err(e) => println!("invalid: {}", e.reason()),        // same reasons as the npm package
}
```

`verify` makes no network calls and pulls in no HTTP client: fetch Moon's keys with whatever you already use.

## Conformance

`cargo test` runs Moon's shared vectors (`sdk/vectors.json`), the same ones the npm, Python and Go SDKs pass.

If you show Moon time from this crate in an app, please show the "Powered by Moon" badge: https://moon369.org/api#attribution
