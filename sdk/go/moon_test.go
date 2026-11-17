package moon369

import (
	"encoding/json"
	"math/big"
	"os"
	"testing"
)

type vectors struct {
	Text        string            `json:"text"`
	SHA256      string            `json:"sha256"`
	Keys        map[string]string `json:"keys"`
	Conversions []struct {
		UnixNs   string `json:"unix_ns"`
		Moonmark string `json:"moonmark"`
		Earliest string `json:"earliest_unix_ns"`
	} `json:"conversions"`
	Valid []struct {
		Name    string          `json:"name"`
		Receipt json.RawMessage `json:"receipt"`
		Round   int64           `json:"not_before_round"`
		PQ      bool            `json:"post_quantum"`
	} `json:"valid"`
	Invalid []struct {
		Name    string          `json:"name"`
		Receipt json.RawMessage `json:"receipt"`
		Reason  string          `json:"reason"`
	} `json:"invalid"`
	Content struct {
		Other string `json:"other"`
	} `json:"content"`
}

func load(t *testing.T) vectors {
	b, err := os.ReadFile("../vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v vectors
	if err := json.Unmarshal(b, &v); err != nil {
		t.Fatal(err)
	}
	return v
}

func TestConversions(t *testing.T) {
	for _, c := range load(t).Conversions {
		u, _ := new(big.Int).SetString(c.UnixNs, 10)
		if got := MoonmarkNs(u); got != c.Moonmark {
			t.Errorf("%s: got %s want %s", c.UnixNs, got, c.Moonmark)
		}
		e, err := FromMoonmark(c.Moonmark)
		if err != nil || e.String() != c.Earliest {
			t.Errorf("%s: got %v want %s", c.Moonmark, e, c.Earliest)
		}
	}
}

func TestReceipts(t *testing.T) {
	v := load(t)
	for _, c := range v.Valid {
		r, _ := ParseReceipt(c.Receipt)
		res := Verify(r, v.Keys, WithSHA256(v.SHA256))
		if !res.Valid {
			t.Errorf("%s: %s", c.Name, res.Reason)
			continue
		}
		if c.Round != 0 && res.NotBeforeRound != c.Round {
			t.Errorf("%s: round %d", c.Name, res.NotBeforeRound)
		}
		if c.PQ && (res.PostQuantum == nil || !*res.PostQuantum) {
			t.Errorf("%s: not post-quantum", c.Name)
		}
	}
	for _, c := range v.Invalid {
		r, _ := ParseReceipt(c.Receipt)
		if res := Verify(r, v.Keys); res.Valid || res.Reason != c.Reason {
			t.Errorf("%s: got %v %s want %s", c.Name, res.Valid, res.Reason, c.Reason)
		}
	}
	r, _ := ParseReceipt(v.Valid[0].Receipt)
	if res := Verify(r, v.Keys, WithContent([]byte(v.Text))); !res.Valid {
		t.Errorf("content: %s", res.Reason)
	}
	if res := Verify(r, v.Keys, WithSHA256(v.Content.Other)); res.Reason != "content_mismatch" {
		t.Errorf("content mismatch: %s", res.Reason)
	}
	if MoonmarkURL("1928.05.07 11:48:26.890049876") != "https://moon369.org/m/1928.05.07-11.48.26.890049876" {
		t.Error("url")
	}
}
