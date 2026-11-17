//! Moon time and signed Moonmarks for Rust. Exact to the nanosecond, the same answers as
//! [api.moon369.org](https://moon369.org/api) and the `moon369` npm package, with offline verification of Moon's
//! receipts: Ed25519, post-quantum ML-DSA-65, and the public drand beacon.
//!
//! ```
//! let mark = moon369::moonmark_ns(1_794_886_514_418_000_000);
//! assert_eq!(mark, "1928.05.07 11:48:26.890049876");
//! let ns = moon369::from_moonmark(&mark).unwrap();
//! ```
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use num_bigint::BigInt;
use num_integer::Integer;
use num_traits::ToPrimitive;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const NS_PER_SECOND: i64 = 1_000_000_000;
const YEAR_DAYS: i64 = 369;
const MOONS: i64 = 13;
const LUNATION_NS: i64 = 2_551_442_876_899_200;

fn num() -> BigInt { BigInt::from(YEAR_DAYS * 86_400) * NS_PER_SECOND }
fn den() -> BigInt { BigInt::from(MOONS) * LUNATION_NS }
fn epoch_unix_ns() -> BigInt { BigInt::from(947_182_440_000_i64) * 1_000_000 - BigInt::from(24_736) * LUNATION_NS }
fn moon_day_ns() -> BigInt { BigInt::from(86_400 * NS_PER_SECOND) }
fn first_day(m: i64) -> i64 { (m * YEAR_DAYS + MOONS - 1) / MOONS }

/// Days (lunes) in moon 1 to 13: 28 or 29.
pub fn moon_length(moon: i64) -> i64 { first_day(moon) - first_day(moon - 1) }

/// One moment in Moon time.
#[derive(Debug, Clone, PartialEq)]
pub struct MoonTime { pub cycle: i64, pub moon: i64, pub day: i64, pub day_of_cycle: i64, pub hour: i64, pub minute: i64, pub second: i64, pub nanosecond: i64 }

impl MoonTime {
    /// The Moonmark: "YEAR.MM.DD HH:MM:SS.NNNNNNNNN".
    pub fn format(&self) -> String {
        format!("{}.{:02}.{:02} {:02}:{:02}:{:02}.{:09}", self.cycle, self.moon, self.day, self.hour, self.minute, self.second, self.nanosecond)
    }
}

/// Unix nanoseconds to Moon time.
pub fn to_moon(unix_ns: &BigInt) -> MoonTime {
    let moon_ns = ((unix_ns - epoch_unix_ns()) * num()).div_floor(&den());
    let day_index = moon_ns.div_floor(&moon_day_ns());
    let year = day_index.div_floor(&BigInt::from(YEAR_DAYS));
    let doy = (&day_index - &year * YEAR_DAYS).to_i64().unwrap();
    let m = doy * MOONS / YEAR_DAYS;
    let rest = (&moon_ns - &day_index * moon_day_ns()).to_i64().unwrap();
    let sec = rest / NS_PER_SECOND;
    MoonTime { cycle: year.to_i64().unwrap(), moon: m + 1, day: doy - first_day(m) + 1, day_of_cycle: doy + 1,
        hour: sec / 3600, minute: sec / 60 % 60, second: sec % 60, nanosecond: rest % NS_PER_SECOND }
}

/// The Moonmark for Unix nanoseconds.
pub fn moonmark_ns(unix_ns: i128) -> String { to_moon(&BigInt::from(unix_ns)).format() }

/// The Moonmark for this instant.
pub fn now() -> String {
    let d = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).expect("clock before 1970");
    moonmark_ns(d.as_nanos() as i128)
}

/// A Moonmark (or its link form "1928.05.07-11.48.26.890049876") to the earliest Unix nanosecond it covers.
pub fn from_moonmark(s: &str) -> Result<BigInt, String> {
    let s = s.trim();
    let s = match s.split_once('-') {
        Some((d, t)) if d.matches('.').count() == 2 && !d.is_empty() && !t.contains(':') => {
            let p: Vec<&str> = t.split('.').collect();
            match p.len() { 2 => format!("{} {}:{}", d, p[0], p[1]), 3 => format!("{} {}:{}:{}", d, p[0], p[1], p[2]), 4 => format!("{} {}:{}:{}.{}", d, p[0], p[1], p[2], p[3]), _ => return Err("bad Moonmark".into()) }
        }
        _ => s.to_string(),
    };
    let (date, time) = match s.split_once(|c| c == ' ' || c == 'T') { Some((a, b)) => (a, b), None => (s.as_str(), "") };
    let d: Vec<&str> = date.split('.').collect();
    if d.len() != 3 { return Err("a Moonmark is YEAR.MM.DD HH:MM:SS.fraction".into()); }
    let p = |x: &str| x.parse::<i64>().map_err(|_| "a Moonmark is YEAR.MM.DD HH:MM:SS.fraction".to_string());
    let (year, moon, day) = (p(d[0])?, p(d[1])?, p(d[2])?);
    let (mut hh, mut mm, mut ss, mut ns) = (0, 0, 0, 0);
    if !time.is_empty() {
        let (hms, frac) = match time.split_once('.') { Some((a, b)) => (a, b), None => (time, "") };
        let t: Vec<&str> = hms.split(':').collect();
        if t.len() < 2 || t.len() > 3 { return Err("bad time".into()); }
        hh = p(t[0])?; mm = p(t[1])?; if t.len() == 3 { ss = p(t[2])?; }
        if !frac.is_empty() {
            if frac.len() > 9 || !frac.chars().all(|c| c.is_ascii_digit()) { return Err("bad fraction".into()); }
            ns = p(&format!("{:0<9}", frac))?;
        }
    }
    if !(1..=MOONS).contains(&moon) || day < 1 || day > moon_length(moon) || hh > 23 || mm > 59 || ss > 59 { return Err("moonmark out of range".into()); }
    let day_index = BigInt::from(year) * YEAR_DAYS + (first_day(moon - 1) + day - 1);
    let moon_ns = day_index * moon_day_ns() + BigInt::from((hh * 3600 + mm * 60 + ss) * NS_PER_SECOND + ns);
    let x = moon_ns * den();
    let ceil = -((-x).div_floor(&num()));
    Ok(ceil + epoch_unix_ns())
}

/// The Moonmark's page on moon369.org.
pub fn moonmark_url(mark: &str) -> String { format!("https://moon369.org/m/{}", mark.trim().replacen(' ', "-", 1).replace(':', ".")) }

// ---------- receipts ----------

pub const V1: &str = "moonmark-receipt/1";
pub const V2: &str = "moonmark-receipt/2";
pub const V3: &str = "moonmark-receipt/3";
pub const KEYS_URL: &str = "https://api.moon369.org/v1/keys";
const QUICKNET_PK: &str = "83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a";
const QUICKNET_GENESIS: i64 = 1692803367;
const QUICKNET_PERIOD: i64 = 3;
const DST: &[u8] = b"BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_";

/// A signed Moonmark, exactly as Moon's API returns it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Receipt {
    pub receipt: String,
    pub sha256: String,
    pub moonmark: String,
    pub unix_ns: String,
    pub key_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub beacon: Option<Beacon>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pq: Option<Pq>,
    pub signature: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Beacon { pub network: String, pub round: u64, pub signature: String }
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pq { pub alg: String, pub key_id: String, #[serde(default, skip_serializing_if = "Option::is_none")] pub signature: Option<String> }

/// key_id to base64url public key (Ed25519 or ML-DSA-65).
pub type Keys = HashMap<String, String>;

/// A valid receipt's details.
#[derive(Debug, Clone, PartialEq)]
pub struct Verified { pub moonmark: String, pub unix_ns: BigInt, pub key_id: String, pub post_quantum: Option<bool>, pub not_before_round: Option<u64> }

/// Why a receipt didn't check out: the same reasons as the npm package (`reason()` gives the string).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Invalid { UnknownVersion, Malformed, UnknownKey, BadSignature, BadPqSignature, BadBeacon, BeaconAfterMoment, MoonmarkMismatch, ContentMismatch }
impl Invalid {
    pub fn reason(&self) -> &'static str {
        match self { Invalid::UnknownVersion => "unknown_version", Invalid::Malformed => "malformed", Invalid::UnknownKey => "unknown_key",
            Invalid::BadSignature => "bad_signature", Invalid::BadPqSignature => "bad_pq_signature", Invalid::BadBeacon => "bad_beacon",
            Invalid::BeaconAfterMoment => "beacon_after_moment", Invalid::MoonmarkMismatch => "moonmark_mismatch", Invalid::ContentMismatch => "content_mismatch" }
    }
}

/// The exact bytes Moon signs: one field per line, fixed order.
pub fn signed_bytes(r: &Receipt) -> Vec<u8> {
    let mut lines = vec![r.receipt.clone(), format!("sha256:{}", r.sha256), r.moonmark.clone(), r.unix_ns.clone(), r.key_id.clone()];
    if (r.receipt == V2 || r.receipt == V3) && r.beacon.is_some() { let b = r.beacon.as_ref().unwrap(); lines.push(format!("{}:{}:{}", b.network, b.round, b.signature)); }
    if r.receipt == V3 { if let Some(p) = &r.pq { lines.push(format!("ml-dsa-65:{}", p.key_id)); } }
    lines.join("\n").into_bytes()
}

/// SHA-256 hex of some bytes: the only thing you send Moon.
pub fn fingerprint(data: &[u8]) -> String { use sha2::Digest; hex::encode(sha2::Sha256::digest(data)) }

/// When a drand round is first published, in Unix nanoseconds.
pub fn beacon_round_time(round: u64) -> BigInt { BigInt::from(QUICKNET_GENESIS + (round as i64 - 1) * QUICKNET_PERIOD) * NS_PER_SECOND }

/// Check a drand quicknet round against the network's public key (BLS12-381, signature on G1). Offline.
pub fn verify_beacon(b: &Beacon) -> bool {
    use bls12_381::hash_to_curve::{ExpandMsgXmd, HashToCurve};
    use bls12_381::{pairing, G1Affine, G1Projective, G2Affine};
    if b.round < 1 || b.signature.len() != 96 { return false; }
    let (Ok(sig), Ok(pk)) = (hex::decode(&b.signature), hex::decode(QUICKNET_PK)) else { return false };
    let (Ok(sig48), Ok(pk96)) = (<[u8; 48]>::try_from(sig.as_slice()), <[u8; 96]>::try_from(pk.as_slice())) else { return false };
    let sig = G1Affine::from_compressed(&sig48);
    let pk = G2Affine::from_compressed(&pk96);
    if bool::from(sig.is_none()) || bool::from(pk.is_none()) { return false; }
    let msg = { use sha2_09::Digest; sha2_09::Sha256::digest(&b.round.to_be_bytes()) };
    let hm = <G1Projective as HashToCurve<ExpandMsgXmd<sha2_09::Sha256>>>::hash_to_curve(msg, DST);
    pairing(&sig.unwrap(), &G2Affine::generator()) == pairing(&G1Affine::from(hm), &pk.unwrap())
}

fn b64(s: &str) -> Option<Vec<u8>> { URL_SAFE_NO_PAD.decode(s.trim_end_matches('=')).ok() }

/// Check a signed Moonmark receipt against Moon's keys, offline. Pass `sha256` to also check what it covers
/// (use `fingerprint(bytes)` for a file).
pub fn verify(r: &Receipt, keys: &Keys, sha256: Option<&str>) -> Result<Verified, Invalid> {
    if r.receipt != V1 && r.receipt != V2 && r.receipt != V3 { return Err(Invalid::UnknownVersion); }
    let beacon_ok = r.beacon.as_ref().map_or(false, |b| b.network == "drand-quicknet");
    if r.receipt == V2 && !beacon_ok { return Err(Invalid::Malformed); }
    if r.receipt == V3 && ((r.beacon.is_some() && !beacon_ok) || r.pq.as_ref().map_or(true, |p| p.alg != "ML-DSA-65")) { return Err(Invalid::Malformed); }
    if r.sha256.len() != 64 || !r.sha256.chars().all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c)) { return Err(Invalid::Malformed); }
    let ns: BigInt = r.unix_ns.parse().map_err(|_| Invalid::Malformed)?;
    let pk = keys.get(&r.key_id).ok_or(Invalid::UnknownKey)?;
    let body = Receipt { receipt: r.receipt.clone(), sha256: r.sha256.clone(), moonmark: r.moonmark.clone(), unix_ns: r.unix_ns.clone(), key_id: r.key_id.clone(),
        beacon: if r.receipt != V1 { r.beacon.clone() } else { None },
        pq: if r.receipt == V3 { r.pq.as_ref().map(|p| Pq { alg: p.alg.clone(), key_id: p.key_id.clone(), signature: None }) } else { None },
        signature: String::new() };
    let msg = signed_bytes(&body);
    let ok = (|| {
        let pk: [u8; 32] = b64(pk)?.try_into().ok()?;
        let sig: [u8; 64] = b64(&r.signature)?.try_into().ok()?;
        let vk = ed25519_dalek::VerifyingKey::from_bytes(&pk).ok()?;
        vk.verify_strict(&msg, &ed25519_dalek::Signature::from_bytes(&sig)).ok()
    })().is_some();
    if !ok { return Err(Invalid::BadSignature); }
    let mut post_quantum = None;
    if r.receipt == V3 {
        let p = r.pq.as_ref().unwrap();
        post_quantum = Some(false);
        if let Some(sig) = &p.signature {
            let ppk = keys.get(&p.key_id).ok_or(Invalid::UnknownKey)?;
            let ok = (|| {
                use ml_dsa::{EncodedVerifyingKey, MlDsa65, Signature, VerifyingKey};
                let enc = EncodedVerifyingKey::<MlDsa65>::try_from(b64(ppk)?.as_slice()).ok()?;
                let vk = VerifyingKey::<MlDsa65>::decode(&enc);
                let s = Signature::<MlDsa65>::try_from(b64(sig)?.as_slice()).ok()?;
                vk.verify_with_context(&msg, &[], &s).then_some(())
            })().is_some();
            if !ok { return Err(Invalid::BadPqSignature); }
            post_quantum = Some(true);
        }
    }
    let mut not_before_round = None;
    if let Some(b) = &body.beacon {
        if !verify_beacon(b) { return Err(Invalid::BadBeacon); }
        if &ns + BigInt::from(10_000_000_000_i64) < beacon_round_time(b.round) { return Err(Invalid::BeaconAfterMoment); }
        not_before_round = Some(b.round);
    }
    if to_moon(&ns).format() != r.moonmark { return Err(Invalid::MoonmarkMismatch); }
    if let Some(want) = sha256 { if want.to_lowercase() != r.sha256 { return Err(Invalid::ContentMismatch); } }
    Ok(Verified { moonmark: r.moonmark.clone(), unix_ns: ns, key_id: r.key_id.clone(), post_quantum, not_before_round })
}

/// Read a receipt from JSON: the receipt itself, or Moon's sign response (`{"receipt": {...}}`).
pub fn parse_receipt(json: &str) -> Result<Receipt, serde_json::Error> {
    let v: serde_json::Value = serde_json::from_str(json)?;
    match v.get("receipt") { Some(inner) if inner.is_object() => serde_json::from_value(inner.clone()), _ => serde_json::from_value(v) }
}
