# Art certificates

Sign the master file of an artwork and print a certificate of authenticity for each piece. Collectors scan the QR
code to see the signed details (artist, title, year, edition) on their phone.

**No code:** [moon369.org/certificate](https://moon369.org/certificate). Drop the master file, fill in the details,
print one certificate per piece. The file never leaves your device.

**From your own shop or studio software:** sign the master file, then register the edition.

```sh
# 1. sign the master file (only its SHA-256 is sent)
curl -s https://api.moon369.org/v1/sign -H 'Content-Type: application/json' \
  -d "{\"sha256\":\"$(sha256sum master.tif | cut -c1-64)\", \"label\":\"Jane Doe, Night Harbor, 2026\"}"
```

The response's `signed_url` is the certificate's QR target, and `receipt` is the proof to keep with the work. For a
numbered edition, the certificate page signs a `moon-coa/1` statement and registers it with `POST /v1/editions`, so
each print gets its own ID that collectors can check: see the [API reference](https://moon369.org/api).

The master file's fingerprint and look-alike hash also let anyone match the original exactly, or find edited
copies, at [moon369.org/verify](https://moon369.org/verify).
