// Package moon369 gives Moon time and signed Moonmarks to Go programs: exact to the nanosecond, the same answers as
// api.moon369.org and the moon369 npm package, with offline verification of Moon's receipts (Ed25519,
// post-quantum ML-DSA-65 and the public drand beacon).
//
//	moon369.Moonmark(time.Now())                    // "1928.05.07 11:48:26.890049876"
//	ns, _ := moon369.FromMoonmark("1928.05.07 11:48:26")
//	keys, _ := moon369.FetchKeys()                  // once; cache them
//	res := moon369.Verify(receipt, keys, moon369.WithContent(fileBytes))
package moon369

import (
	"fmt"
	"math/big"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	nsPerSecond = 1_000_000_000
	yearDays    = 369
	moons       = 13
)

var (
	lunationNs  = big.NewInt(2_551_442_876_899_200)
	moonDayNs   = big.NewInt(86_400 * nsPerSecond)
	num         = new(big.Int).Mul(big.NewInt(yearDays*86_400), big.NewInt(nsPerSecond))
	den         = new(big.Int).Mul(big.NewInt(moons), lunationNs)
	epochUnixNs = new(big.Int).Sub(new(big.Int).Mul(big.NewInt(947_182_440_000), big.NewInt(1_000_000)), new(big.Int).Mul(big.NewInt(24_736), lunationNs))
)

func firstDay(m int) int { return (m*yearDays + moons - 1) / moons } // ceil(m*369/13), m >= 0

// MoonLength is the number of days (lunes) in moon 1 to 13: 28 or 29.
func MoonLength(moon int) int { return firstDay(moon) - firstDay(moon-1) }

// MoonTime is one moment in Moon time.
type MoonTime struct {
	Cycle, Moon, Day, DayOfCycle, Hour, Minute, Second, Nanosecond int
	MoonNs                                                         *big.Int
}

// floorDiv divides rounding toward negative infinity.
func floorDiv(a, b *big.Int) *big.Int {
	q, m := new(big.Int).QuoRem(a, b, new(big.Int))
	if m.Sign() != 0 && (m.Sign() < 0) != (b.Sign() < 0) {
		q.Sub(q, big.NewInt(1))
	}
	return q
}

// ToMoon converts Unix nanoseconds to Moon time.
func ToMoon(unixNs *big.Int) MoonTime {
	moonNs := floorDiv(new(big.Int).Mul(new(big.Int).Sub(unixNs, epochUnixNs), num), den)
	dayIndex := floorDiv(moonNs, moonDayNs)
	year := floorDiv(dayIndex, big.NewInt(yearDays))
	doy := int(new(big.Int).Sub(dayIndex, new(big.Int).Mul(year, big.NewInt(yearDays))).Int64())
	m := doy * moons / yearDays
	rest := new(big.Int).Sub(moonNs, new(big.Int).Mul(dayIndex, moonDayNs)).Int64()
	sec := rest / nsPerSecond
	return MoonTime{Cycle: int(year.Int64()), Moon: m + 1, Day: doy - firstDay(m) + 1, DayOfCycle: doy + 1,
		Hour: int(sec / 3600), Minute: int(sec / 60 % 60), Second: int(sec % 60), Nanosecond: int(rest % nsPerSecond), MoonNs: moonNs}
}

// Format renders a Moonmark: "YEAR.MM.DD HH:MM:SS.NNNNNNNNN".
func (t MoonTime) Format() string {
	return fmt.Sprintf("%d.%02d.%02d %02d:%02d:%02d.%09d", t.Cycle, t.Moon, t.Day, t.Hour, t.Minute, t.Second, t.Nanosecond)
}

// MoonmarkNs is the Moonmark for Unix nanoseconds.
func MoonmarkNs(unixNs *big.Int) string { return ToMoon(unixNs).Format() }

// Moonmark is the Moonmark for a time.Time.
func Moonmark(t time.Time) string { return MoonmarkNs(big.NewInt(t.UnixNano())) }

// Now is the Moonmark for this instant.
func Now() string { return Moonmark(time.Now()) }

var (
	urlForm  = regexp.MustCompile(`^(-?\d+\.\d{1,2}\.\d{1,2})-(\d{1,2})\.(\d{2})(?:\.(\d{2})(?:\.(\d{1,9}))?)?$`)
	markForm = regexp.MustCompile(`^(-?\d+)\.(\d{1,2})\.(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?$`)
)

// FromMoonmark turns a Moonmark (or its link form "1928.05.07-11.48.26.890049876") into the earliest Unix
// nanosecond it covers.
func FromMoonmark(s string) (*big.Int, error) {
	s = strings.TrimSpace(s)
	if u := urlForm.FindStringSubmatch(s); u != nil {
		s = u[1] + " " + u[2] + ":" + u[3]
		if u[4] != "" {
			s += ":" + u[4]
		}
		if u[5] != "" {
			s += "." + u[5]
		}
	}
	m := markForm.FindStringSubmatch(s)
	if m == nil {
		return nil, fmt.Errorf("a Moonmark is YEAR.MM.DD HH:MM:SS.fraction")
	}
	n := func(x string) int { v, _ := strconv.Atoi(x); return v }
	year, moon, day, hh, mm, ss := n(m[1]), n(m[2]), n(m[3]), n(m[4]), n(m[5]), n(m[6])
	ns := 0
	if m[7] != "" {
		ns = n(m[7] + strings.Repeat("0", 9-len(m[7])))
	}
	if moon < 1 || moon > moons || day < 1 || day > MoonLength(moon) || hh > 23 || mm > 59 || ss > 59 {
		return nil, fmt.Errorf("moonmark out of range")
	}
	dayIndex := new(big.Int).Add(new(big.Int).Mul(big.NewInt(int64(year)), big.NewInt(yearDays)), big.NewInt(int64(firstDay(moon-1)+day-1)))
	moonNs := new(big.Int).Add(new(big.Int).Mul(dayIndex, moonDayNs), big.NewInt(int64(hh*3600+mm*60+ss)*nsPerSecond+int64(ns)))
	// earliest Unix nanosecond in this Moon nanosecond: epoch + ceil(moonNs * den / num)
	x := new(big.Int).Mul(moonNs, den)
	ceil := new(big.Int).Neg(floorDiv(new(big.Int).Neg(x), num))
	return ceil.Add(ceil, epochUnixNs), nil
}

// MoonmarkURL is the Moonmark's page on moon369.org.
func MoonmarkURL(mark string) string {
	return "https://moon369.org/m/" + strings.ReplaceAll(strings.Replace(strings.TrimSpace(mark), " ", "-", 1), ":", ".")
}
