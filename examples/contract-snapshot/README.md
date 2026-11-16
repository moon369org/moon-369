# Contract and page snapshots

Lock the exact wording everyone agreed to: a contract, a terms page, a price list, a policy. Change one character
later and it no longer matches.

```sh
node snapshot.mjs https://example.com/terms      # saves the page exactly as served, then signs it
node snapshot.mjs contract-final.pdf            # signs a file you already have
```

You get the snapshot file, `<snapshot>.moonmark.json` with Moon's signed receipt, and a proof link. Keep the snapshot:
it is the evidence. Anyone can drop it on [moon369.org/verify](https://moon369.org/verify) to see when it was signed.

- **No code:** [moon369.org/notarize](https://moon369.org/notarize) does the same in the browser and prints a certificate with a QR code. [moon369.org/sign](https://moon369.org/sign) signs any file or pasted text in one click.
- **For court or an auditor:** turn the receipt into an evidence pack at [moon369.org/evidence](https://moon369.org/evidence), with the Tideline proof and Bitcoin anchor.
- **PDF tools:** to put a standard timestamp inside the PDF itself, see [the PDF guide](../pdf-timestamp).

A page snapshot proves what this script received from that address at that moment. It doesn't prove who runs the site.
