# moon369 (Go)

Moon time and signed Moonmarks for Go. Exact to the nanosecond, the same answers as
[api.moon369.org](https://moon369.org/api) and the `moon369` npm package, with offline verification of Moon's
receipts: Ed25519, post-quantum ML-DSA-65, and the public drand beacon.

```sh
go get github.com/moon369org/moon-369/sdk/go
```

```go
import moon369 "github.com/moon369org/moon-369/sdk/go"

moon369.Now()                                        // "1928.05.07 11:48:26.890049876"
moon369.Moonmark(t)                                  // any time.Time
ns, err := moon369.FromMoonmark("1928.05.07 11:48:26") // earliest Unix nanosecond (*big.Int)
moon369.MoonmarkURL("1928.05.07 11:48:26")           // "https://moon369.org/m/1928.05.07-11.48.26"
```

## Signed Moonmarks

```go
keys, _ := moon369.FetchKeys()                       // once; cache them
r, _ := moon369.ParseReceipt(receiptJSON)            // a receipt, or Moon's whole sign response
res := moon369.Verify(r, keys, moon369.WithContent(fileBytes))
if res.Valid {
	fmt.Println("existed at", res.Moonmark, "post-quantum:", *res.PostQuantum)
} else {
	fmt.Println("invalid:", res.Reason)                // same reasons as the npm package
}
```

To get a receipt, send a file's SHA-256 (`moon369.Fingerprint(b)`) to `POST https://api.moon369.org/v1/sign`.
With `keys` in hand, `Verify` makes no network calls.

## Conformance

`go test` runs Moon's shared vectors (`sdk/vectors.json`), the same ones the npm, Python and Rust SDKs pass.

If you show Moon time from this package in an app, please show the "Powered by Moon" badge: https://moon369.org/api#attribution
