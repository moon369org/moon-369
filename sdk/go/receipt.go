package moon369

import (
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/cloudflare/circl/sign/bls"
	"github.com/cloudflare/circl/sign/mldsa/mldsa65"
)

// Receipt is a signed Moonmark, exactly as Moon's API returns it.
type Receipt struct {
	Receipt   string  `json:"receipt"`
	SHA256    string  `json:"sha256"`
	Moonmark  string  `json:"moonmark"`
	UnixNs    string  `json:"unix_ns"`
	KeyID     string  `json:"key_id"`
	Beacon    *Beacon `json:"beacon,omitempty"`
	PQ        *PQ     `json:"pq,omitempty"`
	Signature string  `json:"signature"`
}

// Beacon is the drand quicknet round Moon had seen when it signed.
type Beacon struct {
	Network   string `json:"network"`
	Round     int64  `json:"round"`
	Signature string `json:"signature"`
}

// PQ is the post-quantum (ML-DSA-65) signature of a v3 receipt.
type PQ struct {
	Alg       string  `json:"alg"`
	KeyID     string  `json:"key_id"`
	Signature *string `json:"signature,omitempty"`
}

// Keys maps key_id to a base64url public key (Ed25519 or ML-DSA-65).
type Keys map[string]string

// Result of Verify. When Valid is false, Reason is one of the npm package's reasons.
type Result struct {
	Valid          bool
	Reason         string
	Moonmark       string
	UnixNs         *big.Int
	KeyID          string
	PostQuantum    *bool
	NotBeforeNs    *big.Int
	NotBeforeRound int64
}

const (
	V1 = "moonmark-receipt/1"
	V2 = "moonmark-receipt/2"
	V3 = "moonmark-receipt/3"
	// KeysURL lists Moon's public keys.
	KeysURL = "https://api.moon369.org/v1/keys"
)

// Quicknet is the drand network Moon's receipts use.
var Quicknet = struct {
	PublicKey   string
	Period      int64
	GenesisTime int64
}{"83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a", 3, 1692803367}

var (
	hex64  = regexp.MustCompile(`^[0-9a-f]{64}$`)
	intRe  = regexp.MustCompile(`^-?\d+$`)
	sig96  = regexp.MustCompile(`^[0-9a-f]{96}$`)
	skewNs = big.NewInt(10_000_000_000)
)

func b64(s string) ([]byte, error) {
	return base64.RawURLEncoding.DecodeString(strings.TrimRight(s, "="))
}

// FetchKeys gets Moon's public keys. Fetch once and cache: verification is then fully offline.
func FetchKeys() (Keys, error) {
	c := &http.Client{Timeout: 15 * time.Second}
	r, err := c.Get(KeysURL)
	if err != nil {
		return nil, err
	}
	defer r.Body.Close()
	var b struct {
		Keys []struct {
			KeyID     string `json:"key_id"`
			PublicKey string `json:"public_key"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		return nil, err
	}
	k := Keys{}
	for _, x := range b.Keys {
		k[x.KeyID] = x.PublicKey
	}
	return k, nil
}

// SignedBytes are the exact bytes Moon signs: one field per line, fixed order.
func SignedBytes(r *Receipt) []byte {
	lines := []string{r.Receipt, "sha256:" + r.SHA256, r.Moonmark, r.UnixNs, r.KeyID}
	if (r.Receipt == V2 || r.Receipt == V3) && r.Beacon != nil {
		lines = append(lines, fmt.Sprintf("%s:%d:%s", r.Beacon.Network, r.Beacon.Round, r.Beacon.Signature))
	}
	if r.Receipt == V3 && r.PQ != nil {
		lines = append(lines, "ml-dsa-65:"+r.PQ.KeyID)
	}
	return []byte(strings.Join(lines, "\n"))
}

// BeaconRoundTime is when a drand round is first published, in Unix nanoseconds.
func BeaconRoundTime(round int64) *big.Int {
	return new(big.Int).Mul(big.NewInt(Quicknet.GenesisTime+(round-1)*Quicknet.Period), big.NewInt(1_000_000_000))
}

// VerifyBeacon checks a drand quicknet round against the network's public key (BLS12-381, signature on G1). Offline.
func VerifyBeacon(b *Beacon) bool {
	if b == nil || b.Round < 1 || !sig96.MatchString(b.Signature) {
		return false
	}
	pkb, _ := hex.DecodeString(Quicknet.PublicKey)
	var pk bls.PublicKey[bls.KeyG2SigG1]
	if pk.UnmarshalBinary(pkb) != nil {
		return false
	}
	sig, _ := hex.DecodeString(b.Signature)
	var rb [8]byte
	binary.BigEndian.PutUint64(rb[:], uint64(b.Round))
	msg := sha256.Sum256(rb[:])
	return bls.Verify(&pk, msg[:], sig)
}

// Option adds a content check to Verify.
type Option func(*opts)
type opts struct{ sha string }

// WithContent checks that the receipt is for these exact bytes.
func WithContent(b []byte) Option {
	return func(o *opts) { h := sha256.Sum256(b); o.sha = hex.EncodeToString(h[:]) }
}

// WithSHA256 checks that the receipt is for this fingerprint.
func WithSHA256(h string) Option { return func(o *opts) { o.sha = strings.ToLower(h) } }

// Fingerprint is the SHA-256 hex of some bytes: the only thing you send Moon.
func Fingerprint(b []byte) string { h := sha256.Sum256(b); return hex.EncodeToString(h[:]) }

// Verify checks a signed Moonmark receipt against Moon's keys, offline. Pass WithContent or WithSHA256 to also
// check what it covers.
func Verify(r *Receipt, keys Keys, options ...Option) Result {
	bad := func(reason string) Result { return Result{Reason: reason} }
	if r == nil {
		return bad("not_a_receipt")
	}
	if r.Receipt != V1 && r.Receipt != V2 && r.Receipt != V3 {
		return bad("unknown_version")
	}
	b := r.Beacon
	beaconOK := b != nil && b.Network == "drand-quicknet"
	if r.Receipt == V2 && !beaconOK {
		return bad("malformed")
	}
	if r.Receipt == V3 && ((b != nil && !beaconOK) || r.PQ == nil || r.PQ.Alg != "ML-DSA-65" || r.PQ.KeyID == "") {
		return bad("malformed")
	}
	if !hex64.MatchString(r.SHA256) || !intRe.MatchString(r.UnixNs) || r.Moonmark == "" || r.KeyID == "" || r.Signature == "" {
		return bad("malformed")
	}
	pkS, ok := keys[r.KeyID]
	if !ok {
		return bad("unknown_key")
	}
	body := Receipt{Receipt: r.Receipt, SHA256: r.SHA256, Moonmark: r.Moonmark, UnixNs: r.UnixNs, KeyID: r.KeyID}
	if r.Receipt != V1 && b != nil {
		body.Beacon = b
	}
	if r.Receipt == V3 {
		body.PQ = &PQ{Alg: "ML-DSA-65", KeyID: r.PQ.KeyID}
	}
	msg := SignedBytes(&body)
	pk, err1 := b64(pkS)
	sig, err2 := b64(r.Signature)
	if err1 != nil || err2 != nil || len(pk) != ed25519.PublicKeySize || !ed25519.Verify(pk, msg, sig) {
		return bad("bad_signature")
	}
	res := Result{Valid: true, Moonmark: r.Moonmark, KeyID: r.KeyID}
	if r.Receipt == V3 {
		pq := false
		if r.PQ.Signature != nil {
			ppkS, ok := keys[r.PQ.KeyID]
			if !ok {
				return bad("unknown_key")
			}
			ppk, e1 := b64(ppkS)
			psig, e2 := b64(*r.PQ.Signature)
			var key mldsa65.PublicKey
			if e1 != nil || e2 != nil || key.UnmarshalBinary(ppk) != nil || !mldsa65.Verify(&key, msg, nil, psig) {
				return bad("bad_pq_signature")
			}
			pq = true
		}
		res.PostQuantum = &pq
	}
	ns, _ := new(big.Int).SetString(r.UnixNs, 10)
	res.UnixNs = ns
	if body.Beacon != nil {
		if !VerifyBeacon(b) {
			return bad("bad_beacon")
		}
		nb := BeaconRoundTime(b.Round)
		if new(big.Int).Add(ns, skewNs).Cmp(nb) < 0 {
			return bad("beacon_after_moment")
		}
		res.NotBeforeNs, res.NotBeforeRound = nb, b.Round
	}
	if MoonmarkNs(ns) != r.Moonmark {
		return bad("moonmark_mismatch")
	}
	var o opts
	for _, f := range options {
		f(&o)
	}
	if o.sha != "" && o.sha != r.SHA256 {
		return bad("content_mismatch")
	}
	return res
}

// ParseReceipt reads a receipt from JSON: the receipt itself, or Moon's sign response ({"receipt": {...}}).
func ParseReceipt(data []byte) (*Receipt, error) {
	var wrap struct {
		Receipt json.RawMessage `json:"receipt"`
	}
	if json.Unmarshal(data, &wrap) == nil && len(wrap.Receipt) > 0 && wrap.Receipt[0] == '{' {
		data = wrap.Receipt
	}
	var r Receipt
	d := json.NewDecoder(bytes.NewReader(data))
	if err := d.Decode(&r); err != nil {
		return nil, err
	}
	return &r, nil
}
