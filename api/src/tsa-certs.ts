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

/** Moon Timestamp Authority certificate (EKU timeStamping, critical). */
export const MOON_TSA_PEM = `-----BEGIN CERTIFICATE-----
MIIBzzCCAXSgAwIBAgIQFJsx9fO25Nz4F1ec82KQHTAKBggqhkjOPQQDAjAmMQ0w
CwYDVQQKDARNb29uMRUwEwYDVQQDDAxNb29uIFJvb3QgQ0EwHhcNMjYxMTE1MDMw
MTAzWhcNNDYxMTE1MDMwMTAzWjAyMQ0wCwYDVQQKDARNb29uMSEwHwYDVQQDDBhN
b29uIFRpbWVzdGFtcCBBdXRob3JpdHkwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNC
AASqA9Vqehl3DYGlGDb1wo7xKau4AEyyvyPqrLf7y49ktJ0jiq4DKybn2RPriDX+
noGPpxn9iObS9wjWt381WnP+o3gwdjAMBgNVHRMBAf8EAjAAMA4GA1UdDwEB/wQE
AwIHgDAWBgNVHSUBAf8EDDAKBggrBgEFBQcDCDAdBgNVHQ4EFgQURsGgolzODaHj
IgWtnQiMfcQoII4wHwYDVR0jBBgwFoAUfK+Csmjao/y9uyWk2tv2cpm/jGYwCgYI
KoZIzj0EAwIDSQAwRgIhANlcD0FnfBASXILpYHNobAWhU2/CrPHaK14oqwCvAksd
AiEApCENC8impkFV6csx22jskSpgkrgfn8vtGWVna+kACxE=
-----END CERTIFICATE-----
`;
