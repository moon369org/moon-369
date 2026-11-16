#!/usr/bin/env python3
"""Timestamp or sign PDFs with Moon's RFC 3161 time-stamp authority, and check them. Needs: pip install pyhanko

  python3 moon_pdf.py stamp contract.pdf                          # a Moon document timestamp, no personal certificate
  python3 moon_pdf.py sign contract.pdf --key me.key --cert me.crt # your signature + Moon timestamp, long-term (PAdES-LTA)
  python3 moon_pdf.py verify contract-moon.pdf                    # check it, trusting Moon's root

Writes <name>-moon.pdf next to the input. The PDF never leaves your computer: only its hash goes to Moon.
"""
import argparse, sys, urllib.request
from pyhanko.sign import signers, timestamps, fields
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.validation import validate_pdf_signature, validate_pdf_timestamp
from pyhanko.sign.validation.dss import DocumentSecurityStore
from pyhanko_certvalidator import ValidationContext
from pyhanko.keys import load_cert_from_pemder
from asn1crypto import crl as acrl, pem

TSA = 'https://api.moon369.org/v1/tsa'
ROOT = 'https://moon369.org/pki/moon-root.pem'
CRL = 'https://moon369.org/pki/moon-root.crl'

def fetch(url_or_path):
    if url_or_path.startswith('http'):
        with urllib.request.urlopen(url_or_path, timeout=20) as r: return r.read()
    return open(url_or_path, 'rb').read()

def root_cert(src):
    data = fetch(src)
    if pem.detect(data): _, _, data = pem.unarmor(data)
    from asn1crypto import x509
    return x509.Certificate.load(data)

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('action', choices=['stamp', 'sign', 'verify']); ap.add_argument('pdf')
    ap.add_argument('--key'); ap.add_argument('--cert'); ap.add_argument('--out')
    ap.add_argument('--tsa', default=TSA); ap.add_argument('--root', default=ROOT); ap.add_argument('--crl', default=CRL)
    a = ap.parse_args()
    root = root_cert(a.root)
    out = a.out or a.pdf[:-4] + '-moon.pdf' if a.pdf.lower().endswith('.pdf') else a.pdf + '-moon.pdf'
    tst = timestamps.HTTPTimeStamper(a.tsa)
    if a.action == 'stamp':
        with open(a.pdf, 'rb') as f, open(out, 'wb') as o:
            signers.PdfTimeStamper(tst).timestamp_pdf(IncrementalPdfFileWriter(f), 'sha256', output=o)
        print('Timestamped by Moon:', out)
    elif a.action == 'sign':
        if not (a.key and a.cert): sys.exit('sign needs --key and --cert (your own signing key and certificate)')
        crl = acrl.CertificateList.load(fetch(a.crl))
        me = load_cert_from_pemder(a.cert)
        vc = ValidationContext(trust_roots=[root, me], crls=[crl], allow_fetching=False, revocation_mode='soft-fail')
        meta = signers.PdfSignatureMetadata(field_name='Signature1', subfilter=fields.SigSeedSubFilter.PADES,
                                            embed_validation_info=True, use_pades_lta=True, validation_context=vc)
        with open(a.pdf, 'rb') as f, open(out, 'wb') as o:
            signers.PdfSigner(meta, signer=signers.SimpleSigner.load(a.key, a.cert), timestamper=tst).sign_pdf(IncrementalPdfFileWriter(f), output=o)
        print('Signed, timestamped by Moon, long-term validation data embedded:', out)
    else:
        r = PdfFileReader(open(a.pdf, 'rb'))
        sigs = r.embedded_signatures
        if not sigs: sys.exit('No signatures or timestamps in this PDF')
        extra = [load_cert_from_pemder(a.cert)] if a.cert else []
        try: vc = DocumentSecurityStore.read_dss(r).as_validation_context({'trust_roots': [root, *extra], 'allow_fetching': False})
        except Exception: vc = ValidationContext(trust_roots=[root, *extra], allow_fetching=False)
        ok = True
        if sigs[-1].evaluate_signature_coverage().name != 'ENTIRE_FILE':
            print('! The file was changed after its last signature or timestamp. The signed part checks below; the rest is not covered.'); ok = False
        for s in sigs:
            if s.sig_object.get('/Type') == '/DocTimeStamp':
                st = validate_pdf_timestamp(s, validation_context=vc)
                good = st.valid and st.intact and st.trusted
                print(('✓' if good else '✕'), 'Document timestamp', st.timestamp, '·', st.signing_cert.subject.human_friendly)
            else:
                st = validate_pdf_signature(s, signer_validation_context=vc, ts_validation_context=vc)
                tsv = st.timestamp_validity
                good = st.intact and st.valid and (tsv is None or (tsv.valid and tsv.trusted))
                print(('✓' if good else '✕'), 'Signature by', st.signing_cert.subject.human_friendly, '· trusted' if st.trusted else '· signer not in your trusted list',
                      '· Moon timestamp ' + str(tsv.timestamp) if tsv else '')
            ok &= good
        sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
