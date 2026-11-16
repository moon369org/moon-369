// Public certificates for Moon's RFC 3161 Time-Stamp Authority. Public by design.
// The matching private keys are never in this repo: the TSA key is MOON_TSA_KEY in the
// deployment's environment, and the root key is kept offline.

/** Moon Root CA: issues the TSA certificate. Trust this to verify Moon timestamps. */
export const MOON_ROOT_PEM = `-----BEGIN CERTIFICATE-----
MIIBkDCCATegAwIBAgIQGQrF9SuZFZOKrVsjRMw/ATAKBggqhkjOPQQDAjAmMQ0w
CwYDVQQKDARNb29uMRUwEwYDVQQDDAxNb29uIFJvb3QgQ0EwIBcNMjYxMTE1MDMw
MTAzWhgPMjA1MTExMTUwMzAxMDNaMCYxDTALBgNVBAoMBE1vb24xFTATBgNVBAMM
DE1vb24gUm9vdCBDQTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABHAlVzro54Ba
kFVtM7bK+gulrinK6namyjxbYQ2WNjCe7DhE+5enjb0rH+pyWfqc2lCjd9zr6rfJ
xNF5pn6Pd8ajRTBDMBIGA1UdEwEB/wQIMAYBAf8CAQAwDgYDVR0PAQH/BAQDAgEG
MB0GA1UdDgQWBBR8r4KyaNqj/L27JaTa2/Zymb+MZjAKBggqhkjOPQQDAgNHADBE
AiBOQj9NyR38NaXEQIlwOoK7YPSCgJOqOxWxAWrH5gHr9wIgAq4CaHNSM2dLMX1N
xAVSzUcYluLcAzyvQH4pux4AUOY=
-----END CERTIFICATE-----
`;

/** Moon Timestamp Authority certificate (EKU timeStamping, critical). Reissued 2026-11-16 with the same key, adding
 *  where to find the root (https://moon369.org/pki/moon-root.cer) and its revocation list (…/moon-root.crl). */
export const MOON_TSA_PEM = `-----BEGIN CERTIFICATE-----
MIICTzCCAfWgAwIBAgIUCBHFdKNQO1d2srgWEPuYNcIOYGAwCgYIKoZIzj0EAwIw
JjENMAsGA1UECgwETW9vbjEVMBMGA1UEAwwMTW9vbiBSb290IENBMB4XDTI2MTEx
NjAwMDAwMFoXDTQ2MTExNTAzMDEwM1owMjENMAsGA1UECgwETW9vbjEhMB8GA1UE
AwwYTW9vbiBUaW1lc3RhbXAgQXV0aG9yaXR5MFkwEwYHKoZIzj0CAQYIKoZIzj0D
AQcDQgAEqgPVanoZdw2BpRg29cKO8SmruABMsr8j6qy3+8uPZLSdI4quAysm59kT
64g1/p6Bj6cZ/Yjm0vcI1rd/NVpz/qOB9DCB8TAMBgNVHRMBAf8EAjAAMA4GA1Ud
DwEB/wQEAwIHgDAWBgNVHSUBAf8EDDAKBggrBgEFBQcDCDAdBgNVHQ4EFgQURsGg
olzODaHjIgWtnQiMfcQoII4wHwYDVR0jBBgwFoAUfK+Csmjao/y9uyWk2tv2cpm/
jGYwNgYDVR0fBC8wLTAroCmgJ4YlaHR0cHM6Ly9tb29uMzY5Lm9yZy9wa2kvbW9v
bi1yb290LmNybDBBBggrBgEFBQcBAQQ1MDMwMQYIKwYBBQUHMAKGJWh0dHBzOi8v
bW9vbjM2OS5vcmcvcGtpL21vb24tcm9vdC5jZXIwCgYIKoZIzj0EAwIDSAAwRQIh
ALXxJHlkKdbcYnKlB32OOiPKHKsnTTX+4t2h6taj3/wnAiAqb+Q8h1+kZfVqlmsG
/rxwxn94d6VVkto/zbLO+ZmnDQ==
-----END CERTIFICATE-----
`;
