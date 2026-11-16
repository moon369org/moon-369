#!/usr/bin/env python3
"""Re-sign Moon's revocation list (site/pki/moon-root.crl) with the Moon Root CA key. Run about once a year.

    python3 scripts/pki/renew-crl.py path/to/root.key [SERIAL_TO_REVOKE ...]

The root key never goes in this repo. Without serials, the list stays empty (nothing revoked).
Each run bumps the CRL number and sets the next update about 400 days ahead; commit and deploy the new file.
"""
import sys, datetime, pathlib
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization

here = pathlib.Path(__file__).resolve().parents[2] / 'site' / 'pki'
key = serialization.load_pem_private_key(pathlib.Path(sys.argv[1]).read_bytes(), None)
root = x509.load_pem_x509_certificate((here / 'moon-root.pem').read_bytes())
assert key.public_key().public_numbers() == root.public_key().public_numbers(), 'That is not the Moon Root CA key'
old = x509.load_der_x509_crl((here / 'moon-root.crl').read_bytes())
num = old.extensions.get_extension_for_class(x509.CRLNumber).value.crl_number + 1
now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)
b = (x509.CertificateRevocationListBuilder().issuer_name(root.subject).last_update(now).next_update(now + datetime.timedelta(days=400))
     .add_extension(x509.CRLNumber(num), False).add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(key.public_key()), False))
for r in old:   # keep every earlier revocation
    b = b.add_revoked_certificate(r)
for s in sys.argv[2:]:
    b = b.add_revoked_certificate(x509.RevokedCertificateBuilder().serial_number(int(s, 16)).revocation_date(now).build())
crl = b.sign(key, hashes.SHA256())
(here / 'moon-root.crl').write_bytes(crl.public_bytes(serialization.Encoding.DER))
print(f'CRL #{num}, next update {crl.next_update_utc:%Y-%m-%d}, {len(list(crl))} revoked')
