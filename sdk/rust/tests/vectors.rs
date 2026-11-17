use std::collections::HashMap;

fn vectors() -> serde_json::Value {
    serde_json::from_str(&std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../vectors.json")).unwrap()).unwrap()
}
fn keys(v: &serde_json::Value) -> HashMap<String, String> { serde_json::from_value(v["keys"].clone()).unwrap() }

#[test]
fn conversions() {
    for c in vectors()["conversions"].as_array().unwrap() {
        let u: i128 = c["unix_ns"].as_str().unwrap().parse().unwrap();
        assert_eq!(moon369::moonmark_ns(u), c["moonmark"].as_str().unwrap());
        assert_eq!(moon369::from_moonmark(c["moonmark"].as_str().unwrap()).unwrap().to_string(), c["earliest_unix_ns"].as_str().unwrap());
    }
    assert_eq!(moon369::moonmark_url("1928.05.07 11:48:26.890049876"), "https://moon369.org/m/1928.05.07-11.48.26.890049876");
    assert_eq!(moon369::from_moonmark("1928.05.07-11.48.26.890049876").unwrap(), moon369::from_moonmark("1928.05.07 11:48:26.890049876").unwrap());
}

#[test]
fn receipts() {
    let v = vectors();
    let k = keys(&v);
    let sha = v["sha256"].as_str().unwrap();
    for t in v["valid"].as_array().unwrap() {
        let r = moon369::parse_receipt(&t["receipt"].to_string()).unwrap();
        let ok = moon369::verify(&r, &k, Some(sha)).unwrap_or_else(|e| panic!("{}: {}", t["name"], e.reason()));
        if let Some(round) = t["not_before_round"].as_u64() { assert_eq!(ok.not_before_round, Some(round)); }
        if t["post_quantum"].as_bool() == Some(true) { assert_eq!(ok.post_quantum, Some(true)); }
    }
    for t in v["invalid"].as_array().unwrap() {
        let r = moon369::parse_receipt(&t["receipt"].to_string()).unwrap();
        let e = moon369::verify(&r, &k, None).expect_err(t["name"].as_str().unwrap());
        assert_eq!(e.reason(), t["reason"].as_str().unwrap(), "{}", t["name"]);
    }
    let r = moon369::parse_receipt(&v["valid"][0]["receipt"].to_string()).unwrap();
    assert!(moon369::verify(&r, &k, Some(&moon369::fingerprint(v["text"].as_str().unwrap().as_bytes()))).is_ok());
    assert_eq!(moon369::verify(&r, &k, Some(v["content"]["other"].as_str().unwrap())).unwrap_err().reason(), "content_mismatch");
}
