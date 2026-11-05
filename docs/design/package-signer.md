# Package signer contract (web ↔ `kubcode-package-signer`)

See ADR 0002. The web app authorizes the member, applies the download limit and
logs the download; the Lambda only checks that the request came from the web app
and turns an allowed object key into a 60-second presigned URL.

## Request

`POST {KUBCODE_PACKAGE_SIGNER_URL}sign` — the Function URL, so the path the
Lambda sees (`rawPath`) is `/sign`.

Headers:

| Header | Value |
|---|---|
| `content-type` | `application/json` |
| `x-kubcode-timestamp` | Unix time in seconds, decimal |
| `x-kubcode-nonce` | 32 lowercase hex characters (128 random bits) |
| `x-kubcode-signature` | lowercase hex HMAC-SHA256 (below) |

Body (UTF-8 JSON, sent byte-for-byte as signed):

```json
{"key":"packages/freshstack-what-if/0.1.0.zip","filename":"freshstack-what-if-0.1.0.zip","user":"11111111-2222-4333-8444-555555555555"}
```

- `key` must match `^packages/[a-z0-9]+(-[a-z0-9]+)*/[0-9]+\.[0-9]+\.[0-9]+\.zip$`.
- `filename` must match `^[a-z0-9]+(-[a-z0-9]+)*-[0-9]+\.[0-9]+\.[0-9]+\.zip$`.
- `user` is the internal user UUID, logged by the Lambda for audit only.

String to sign (fields joined with `\n`, no trailing newline):

```
KUBCODE-HMAC-V1
POST
/sign
<timestamp>
<nonce>
<lowercase hex SHA-256 of the body bytes>
```

The HMAC key is the UTF-8 bytes of `KUBCODE_PACKAGE_SIGNER_KEY` (generate with
`openssl rand -hex 32`; both sides reject keys shorter than 32 bytes).

The Lambda accepts a timestamp within ±60 s of its clock and compares the
signature in constant time.

## Response

| Status | Body | When |
|---|---|---|
| 200 | `{"url":"https://…","expires_in":60}` | signed |
| 400 | `{"error":"bad_request"}` | body not JSON, or `key`/`filename`/`user` invalid |
| 401 | `{"error":"unauthorized"}` | missing/bad signature, timestamp outside the window |
| 404 | `{"error":"not_found"}` | any method/path other than `POST /sign` |
| 500 | `{"error":"internal"}` | missing config/credentials |

Errors never echo input.

The URL is a SigV4 query-presigned `GET` on
`https://<bucket>.s3.<region>.amazonaws.com/<key>` with `X-Amz-Expires=60`,
`X-Amz-Security-Token` when the Lambda has a session token, and
`response-content-disposition=attachment; filename="<filename>"`.

## Shared test vector (both implementations must pass it)

- key: `test-key-0123456789abcdef0123456789abcdef`
- timestamp: `1700000000`, nonce: `00112233445566778899aabbccddeeff`
- body: the JSON above, exactly
- body SHA-256: `772928b7b151bd7adf26655845780b9d86dd819c0525f303f251f2d017030ce5`
- signature: `67bf738902a1cb865dec0c72499ffe52b4d30fe4247afc2399677eaa9db8f9be`
