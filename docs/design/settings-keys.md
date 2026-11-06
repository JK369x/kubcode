# Design — Settings page + encrypted key store + Connect YouTube/Instagram (scheduler slice 2)

Status: **approved by orchestrator 2026-11-04** (A wrap key, callback on kubcode.dev + HMAC,
boundary Deny), with notes folded into §1, §2 and §7 · 2026-11-04 · inputs: `docs/scheduler.md`,
`docs/scheduler-prd.md` (orchestrator repo), `infra/README.md`, `HANDOFF.md` §7a/§7b.

## 0. Findings that change the plan (read first)

1. **Google client is the wrong type.** The owner's existing client (`pure-album-512910-d0`) is a
   *Desktop app* client (loopback redirect only). A web "Connect" flow needs a **Web application**
   client in the same GCP project with redirect `https://kubcode.dev/api/keys/oauth/callback/youtube`.
   Owner action, not code.
2. **Google "Testing" apps get 7-day refresh tokens.** The consent screen has test users, so it is
   in Testing: every refresh token dies after 7 days, which breaks scheduling. Owner must switch the
   consent screen to **In production** (unverified is fine for personal use: warning screen, 100-user cap).
3. **YouTube unverified-project lock (slice 5 risk).** API projects created after 2020-07-28 that
   have not passed the YouTube API audit get uploads locked to private. Local receipts show some
   uploads ended `public`, so this project may be OK. Slice 5 must check it with one real upload
   before we rely on `private + publishAt`.
4. **Instagram** uses Business Login for Instagram (Meta app "Story Grids Studio", unpublished,
   accounts are testers). The code exchange and the short-to-long token exchange need the app
   secret, so they run in the Lambda. Refreshing (`ig_refresh_token`) does **not** need the secret.
   Owner adds `https://kubcode.dev/api/keys/oauth/callback/instagram` to Valid OAuth Redirect URIs.
5. **Existing tokens are not imported.** The owner reconnects through the UI: the Google tokens
   belong to the Desktop client and would expire under Testing anyway.

> **Hosting note (2026-11-05):** the web app moved from Vercel to a Lightsail box (ADR 0001).
> Where §1–§3 and §7 say "Vercel" or "Vercel env", read "the web host" and its `web.env`. The
> security argument is unchanged: the web host holds no AWS credentials.

## 1. Encryption: KMS RSA public-key hybrid (recommended), not "Vercel calls a Lambda to encrypt"

| | A. KMS asymmetric key, public key on Vercel | B. Vercel → Rust encrypt Lambda |
|---|---|---|
| AWS credentials on Vercel | none | none if HMAC/URL; IAM auth would need creds or Vercel OIDC + new IAM OIDC provider (admin) |
| Save latency / availability | local crypto, no network | +1 cross-region call (iad1→ap-southeast-1) + cold start; Lambda down = cannot save |
| Who can create valid ciphertext | anyone with the public key | anyone who can call the Lambda (= Vercel env holder) — **same power** |
| Rotation | manual (asymmetric keys cannot auto-rotate) | automatic (symmetric) |
| Extra surface | none | a public endpoint that encrypts |

Confidentiality is the same in both: Vercel can create ciphertext but can never decrypt. A has
fewer moving parts and no runtime dependency, so **pick A**. Its only real cost is manual rotation
(§6), which is acceptable for a key that wraps DEKs.

**Envelope v1** (bytea, the same format for every secret, written by TS on Vercel and by Rust in Lambdas):
`"KCE1" | key_slot u8 | len u16 | RSA-OAEP-SHA256(DEK) | nonce 12 | AES-256-GCM(ct+tag)`.
- A random 32-byte DEK per secret write. KMS key `RSA_4096`, `ENCRYPT_DECRYPT`, `RSAES_OAEP_SHA_256`.
- **AAD** = `kubcode:v1|<table>|<row id>|<user id>|<kind>|<version>`, rebuilt by the decryptor from
  row columns, never read from the envelope. This stops anyone copying a ciphertext into another
  user's row or another kind, and stops replaying an older version.
- `key_slot` maps to an **allowlisted** KMS key ARN in code, so a row cannot point Lambda at another key.
- The public key PEM is committed (`lib/keys/secrets-wrap-v1.pub.pem`). A test in `npm test`
  pins the SHA-256 fingerprint of its SPKI DER, and the Rust crate pins the same value, so a key
  swapped in the repo fails CI. The fingerprint is taken from `aws kms get-public-key` at creation.
  Changing it needs review and a deploy.
- An interop test checks Node `publicEncrypt(oaepHash: sha256)` against KMS `Decrypt` (MGF1-SHA256)
  before anything ships.
- Plaintext is limited to 4 KiB. Structured secrets are JSON, e.g. `{"client_secret": "…"}`.

The existing symmetric `alias/kubcode-secrets` (protected, slice 1) is **reused for SSM
SecureString** (the Lambda DB URL and the HMAC key), not for user secrets. Its key spec cannot be
changed to RSA.

## 2. OAuth Connect flow (callback on kubcode.dev, exchange in Lambda)

The callback lands on **kubcode.dev**, not on the Lambda URL. Reasons: the domain is owned and
easy to register in the user's Google/Meta app, and Vercel already has the session cookie to bind
the flow to the signed-in user. Vercel sees the `code`, but it cannot use it: exchanging it needs
the client secret and the PKCE verifier, and only the Lambda can decrypt those.

1. **Start** `POST /api/keys/oauth/start {provider}` (Vercel). Checks: exact Origin + Strict
   double-submit CSRF (existing `readGuardedJson`), DB-checked session, owner gate, and the
   provider's app credentials are present. Then it creates an `oauth_connect_intents` row:
   `state` (hash stored), cookie token (hash stored), session-binding hash, PKCE verifier
   **encrypted to the public key** (Vercel forgets it), TTL 10 min, one open intent per user.
   It sets `__Host-kubcode-oauth` (HttpOnly, Secure, Lax) and returns the authorize URL.
   - Google: `access_type=offline&prompt=consent`, `code_challenge_method=S256`, scopes
     `youtube.upload youtube.readonly`, client_id read from the plaintext column.
   - IG: `www.instagram.com/oauth/authorize`, scopes `instagram_business_basic,instagram_business_content_publish`
     (insights, comments and messages are not requested in phase 1). **Business Login for
     Instagram has no PKCE.** IG intents have no verifier. Protection comes from the single-use
     `state`, the server-side intent bound to the session, and the app secret that only the Lambda
     can decrypt (without it a stolen code cannot be exchanged).
2. **Callback** `GET /api/keys/oauth/callback/{provider}` (Vercel). Checks: canonical host,
   state hash lookup, intent open and unexpired, provider matches the path, cookie hash matches,
   session user = intent user, session binding matches. Then it atomically sets
   `phase=exchanging` (single use) and calls the Lambda `POST /oauth/exchange {state, code}`,
   HMAC-signed with `KUBCODE_CONNECT_HMAC_KEY`. The signature covers method, path, timestamp,
   a random 128-bit nonce and the SHA-256 of the body. The Lambda accepts timestamps within ±5 min
   and rejects replays by inserting `sha256(nonce)` into `connect_request_nonces` (primary key,
   rows older than 10 min are pruned). The HMAC is not an AWS credential: it only stops anonymous
   internet traffic from making the Lambda hit the DB. In the threat model it is a
   **Vercel-env-level secret** (§7).
   Finally it redirects to a fixed `/account/keys?notice=…` (no open redirect). A provider
   `error=` closes the intent as failed.
3. **Exchange** (Rust Lambda `kubcode-oauth-connect`). Loads the intent by `hash(state)` in phase
   `exchanging` (younger than 60 s), then decrypts the client secret and the verifier with
   `kms:Decrypt`. Token endpoints are fixed constants, so there is no SSRF.
   - Google: it exchanges the code, then calls `channels.list mine=true` to get the channel id and title.
   - IG: it exchanges the code, calls `ig_exchange_token` to get the long-lived token, then calls
     `/me` to get the user_id and username.
   It encrypts the long-lived token (Google refresh token, IG 60-day token) with the same envelope
   and upserts `oauth_connections` on `(user, provider, external_account_id)`. Then it closes the
   intent, writes an audit row, and returns `{ok, label}` only. Google access tokens are never stored.
4. **Disconnect** `POST /api/keys/connections/{id}/disconnect`. Vercel marks the row `revoking`
   and calls the Lambda `/oauth/revoke`. Google: `oauth2.googleapis.com/revoke`. IG has no reliable
   revoke API for this login, so the UI links to Instagram › Apps and websites. The ciphertext is
   **wiped even if the revoke fails or the Lambda is unreachable** (Vercel can delete the row
   itself after a timeout). Every disconnect writes `oauth_disconnected`, plus
   `oauth_revoke_failed` with a fixed code when the revoke did not succeed.

### 2a. Which app a connection uses (ADR 0003 amendment, 2026-11-06)

A connection is made either through **kubcode's shared app** or through **the member's own app
(BYOK)**. The choice is made once, by the web host when the member clicks Connect, and recorded as
`app_source` (`'kubcode'` or `'member'`) on the intent and then on the connection:

| Provider | `'member'` when | else `'kubcode'` when | else |
|---|---|---|---|
| YouTube | the member saved `youtube_oauth_client` | `KUBCODE_YOUTUBE_CLIENT_ID` is set (Google project `pure-album-512910-d0`, Web client "kubcode web connect") | `APP_NOT_CONFIGURED` |
| Instagram | the member saved `instagram_app` | (later: kubcode's own Meta app, after Business Verification) | `APP_NOT_CONFIGURED` |

The member's own app wins when present, so a technical member keeps full control.

**The Lambda never guesses.** It reads `app_source` from the intent:
- `'kubcode'`: client id + secret from the SSM SecureString `/kubcode/prod/google-connect-client`
  (JSON `{"client_id","client_secret"}`, encrypted with `alias/kubcode-secrets`). They are not in
  `user_secrets`, and no member ever sees them.
- `'member'`: the member's `user_secrets` row of the matching kind (`public_value` = client/app id,
  envelope opened through KMS).

The connection keeps `app_source`, so refresh (step 6) uses the client that issued the token. Deleting
a member's app credentials disconnects only that member's `'member'` connections for that provider.
For a `'kubcode'` connection `app_secret_version` is 1.

## 3. Token refresh job

The Lambda `kubcode-token-refresh` is run by an EventBridge Scheduler schedule
`kubcode-token-refresh-daily` (`rate(1 day)`, with a retry policy).
- **IG**: refresh when the token is at least 24 h old and expires within 30 days, or was last
  refreshed more than 7 days ago. It writes the new envelope with `version+1` and stores `token_expires_at`.
- **Google**: a health check only. It does a refresh-token grant and throws the access token away.
  `invalid_grant` sets `status=needs_reconnect`. Publishers (slice 5) refresh on use.
- Rows are processed one at a time with `FOR UPDATE SKIP LOCKED`. Errors are saved as a fixed
  `last_error_code` (never the provider's text). The UI shows "ต้องเชื่อมใหม่".

## 4. Data model — migration `0004_settings_keys` (additive only)

Schema `kubcode_accounts` (the runner and ledger already exist). No DROP, UPDATE or RENAME, so it
passes the destructive gate. Grants and policies are inside the file, as in 0002.

- `user_secrets(id, user_id → users ON DELETE CASCADE, kind text CHECK ~'^[a-z][a-z0-9_]{1,39}$', public_value text NULL /*client_id, app id*/, envelope bytea, key_slot smallint, hint text CHECK len≤4 /*last 4*/, version int, created_at, updated_at, UNIQUE(user_id, kind))`.
  Phase-1 kinds (validated in TS + Rust): `youtube_oauth_client`, `instagram_app`, `elevenlabs_api_key`.
  Kinds are checked by a regex rather than an enum, so adding a kind never needs a destructive
  constraint change.
- `oauth_connections(id, user_id CASCADE, provider CHECK IN ('youtube','instagram'), external_account_id, account_label, scopes text[], app_secret_version int /*detect replaced app creds*/, envelope, key_slot, version, status CHECK IN ('active','needs_reconnect','revoking'), token_expires_at, last_refreshed_at, last_checked_at, last_error_code CHECK ~'^[a-z_]{1,40}$', created_at, updated_at, UNIQUE(user_id, provider, external_account_id))`.
- `oauth_connect_intents(id, user_id CASCADE, provider, state_hash bytea UNIQUE, cookie_hash, session_binding_hash, verifier_envelope NULL, phase CHECK IN ('await_callback','exchanging','closed'), status CHECK IN ('open','consumed','failed','expired'), created_at, expires_at, closed_at)`. It has a partial unique index allowing one open intent per user, and a CHECK that closed intents have the verifier wiped.
- `connect_request_nonces(nonce_hash bytea PRIMARY KEY CHECK len=32, created_at)`: HMAC replay
  guard. Only `kubcode_worker` can use it (INSERT, plus DELETE of rows older than 10 min).
- `secret_audit_events(id identity, user_id SET NULL, event ~'^[a-z_]{1,40}$', subject text /*kind or provider, no values*/, actor CHECK IN ('user','lambda','operator'), created_at)`.
  Events: `secret_saved|secret_replaced|secret_deleted|oauth_connect_started|oauth_connected|oauth_connect_failed|oauth_disconnected|oauth_revoke_failed|token_refreshed|token_refresh_failed|secret_used`.

**Per-user RLS (new, stricter than 0001/0002).** Policies for `kubcode_app` use
`user_id = nullif(current_setting('kubcode.user_id', true), '')::uuid`. The store runs
`set_config('kubcode.user_id', $uid, true)` in each transaction (transaction-scoped, so it is safe
with the pooler). This guards against a forgotten `WHERE`; it does **not** stop a holder of the DB
URL, who can set any id.

**Column grants.** `kubcode_app` can INSERT/UPDATE/DELETE, but may SELECT **only the metadata
columns**: never `envelope` or `verifier_envelope`, which Vercel never needs back. A new role
`kubcode_worker`, used by the Lambdas, gets SELECT on the envelopes, UPDATE on the connection,
token and intent columns, and INSERT on audit, with a policy `USING(true)` (the refresh job is
cross-user). Neither role has BYPASSRLS, DDL or DELETE on audit. 0004 creates `kubcode_worker`
itself (NOLOGIN, no password) so its grants always apply; the operator later gives it LOGIN and a
password and stores the DB URL in SSM (§5).

Deletion: deleting the user cascades. Deleting app credentials is blocked while connections use
them, unless the user confirms, which also disconnects them.

**As built (step 2, 2026-11-05).** `db/migrations/0004_settings_keys.sql` + `lib/keys/store.ts`.
- Sealed plaintext is JSON with one field per kind, which the Rust Lambdas must read the same way:
  `youtube_oauth_client` → `{"client_secret"}`, `instagram_app` → `{"app_secret"}`,
  `elevenlabs_api_key` → `{"api_key"}`. `public_value` holds the Google client id / Instagram app id.
- Secrets must be 16–512 printable ASCII characters with no spaces, so the last-4 hint never shows a
  large share of a key.
- `kubcode_app` is narrower than "INSERT/UPDATE/DELETE everywhere": on `oauth_connections` it has
  no INSERT (only the Lambda creates connections) and may UPDATE only `status`/`updated_at` (to mark
  `revoking`), plus DELETE. No access at all to `connect_request_nonces`.
- The store enforces the phase-1 owner gate (`users.is_owner`) itself, not only the route.
- **0004 creates `kubcode_worker`** (owner decision 2026-11-05): `CREATE ROLE kubcode_worker NOLOGIN`
  inside a `DO` block guarded by `IF NOT EXISTS`, then the grants, which therefore always apply. An
  existing role is left untouched (a LOGIN set by the operator survives a re-run). No owner action is
  needed before merge. Production migrations run as Supabase's `postgres` user (HANDOFF §7a), the
  role Supabase uses for creating custom roles (CREATEROLE, not superuser). If CI ever reports
  `42501` on that statement, create the role once as `postgres` in the SQL editor and re-run.

## 5. Infra (Pulumi, `infra/`) — what needs an admin local apply

**As built (step 4, 2026-11-05)**, branch `infra/settings-wrap-key`:
- KMS `alias/kubcode-secrets-wrap` (RSA_4096, ENCRYPT_DECRYPT, no rotation since asymmetric keys
  cannot rotate, 30-day deletion window, `protect`). Key policy `wrapKeyPolicy`:
  `KeyAdministration` for deploy + break-glass (no crypto, no grants), `RootUserRecovery` (root
  user only), `PublicKeyRead` (`kms:GetPublicKey` etc.) for admins and preview, and `KeyDecrypt`
  (`kms:Decrypt` with `kms:EncryptionAlgorithm=RSAES_OAEP_SHA_256`) only for the ARNs in the
  `wrapKeyDecryptArns` hook, which must match `role/kubcode-lambda-*`. Nobody encrypts through KMS.
- **Lambda roles are not created yet.** KMS rejects a key policy that names a role that does not
  exist, and roles without functions would be guesses at step 5's inline policies. Step 5 creates
  `kubcode-lambda-oauth-connect` and `kubcode-lambda-token-refresh` through CI, then an admin apply
  adds them to the `wrapKeyDecryptArns` hook (CI cannot change the wrap key policy).
- Boundary (`deployBoundaryPolicy`), only what was missing on main (Lambda functions, their log
  groups and `iam:PassRole` to Lambda already came with ADR 0002):
  - the wrap key ARN in `KubcodeKeysCeiling`;
  - `ReadKubcodeParameters`: `ssm:GetParameter`/`GetParameters` on `parameter/kubcode/*` (ceiling
    for the step-5 Lambdas; nothing in the boundary can write parameters);
  - `DenyWrapKeyDecryptOutsideLambdaRoles`: Deny `kms:Decrypt` and `kms:ReEncrypt*` on the wrap
    key unless `aws:PrincipalArn` is `role/kubcode-lambda-*` (ReEncrypt would let CI move a wrapped
    DEK under the state key, which it can decrypt);
  - `DenyWrapKeyPolicyAndGrants`: Deny `kms:PutKeyPolicy` and `kms:CreateGrant` on the wrap key to
    every kubcode role, so CI cannot name an outside principal (another account) in the policy or a
    grant. The wrap key policy is therefore admin-only, like the boundary, and the key policy carries
    its own Deny of Decrypt/ReEncrypt outside `kubcode-lambda-*` and of all grants.
  - **Not added:** EventBridge Scheduler, `lambda:InvokeFunction` and `iam:PassRole` to
    `scheduler.amazonaws.com` (step 6). They would loosen two rules the infra tests pin ("no invoke",
    "PassRole to Lambda only"), and ADR 0003 may change the refresh design. Step 6 adds them with
    its own small admin apply.
- `alias/kubcode-secrets` gains `SsmParameterWrite` for the break-glass admin: `kms:Encrypt` +
  `kms:GenerateDataKey`, only with `kms:ViaService=ssm.ap-southeast-1.amazonaws.com` and
  `kms:EncryptionContext:PARAMETER_ARN` like `parameter/kubcode/*`. The Lambda roles get `KeyUse`
  through the existing `secretsKeyUserArns` hook at step 5.
- **SSM parameters are not Pulumi resources** (changed from the original plan). A Pulumi-managed
  SecureString with `ignoreChanges: [value]` re-sends the placeholder held in state on any later
  update (e.g. a description change) and overwrites the real secret, and a refresh would pull the
  real value into Pulumi state. The admin creates `/kubcode/prod/worker-db-url` and
  `/kubcode/prod/connect-hmac-key` with `aws ssm put-parameter --type SecureString --key-id
  alias/kubcode-secrets` at step 5. Before setting the worker URL, run
  `ALTER ROLE kubcode_worker LOGIN PASSWORD '…'` once in the Supabase SQL editor (the role exists
  from 0004). Values never go in git, chat or Pulumi state.
- **Web host env** (Lightsail `web.env` on the box per ADR 0001, set with
  `infra/web/scripts/webhost.sh`; not Vercel): `KUBCODE_CONNECT_URL`, `KUBCODE_CONNECT_HMAC_KEY`,
  `KUBCODE_KEYS_ENABLED`. **No AWS credentials on the box.** kubcode's own Google/Meta app
  credentials (ADR 0003) come with the step-5 amendment, not here.

Still to come (step 5/6): the two Rust Lambdas (`provided.al2023`, built with cargo-lambda; Function
URL with HMAC for `kubcode-oauth-connect`, no URL for `kubcode-token-refresh`), their log groups
(14 days), the Scheduler schedule `kubcode-token-refresh-daily` and role
`kubcode-scheduler-invoke`.

**Admin-only local `pulumi up`** (CI cannot create KMS keys or change the boundary). Run it from
the PR branch, then merge; the CI run on main is then a no-op. Exact commands: `infra/README.md`
"Settings keys wrap key". Afterwards `npm run keys:wrap-key -- export` writes
`lib/keys/secrets-wrap-v1.pub.pem` and prints the SPKI SHA-256 fingerprint; a follow-up commit
sets `CURRENT_WRAP_KEY` and pins that fingerprint in a TS test and in the Rust crate.

**Applied 2026-11-05** (admin `pulumi up` from `fd9ff2a`: 3 created, 3 updated). Key
`arn:aws:kms:ap-southeast-1:955758449820:key/39320743-1ef2-4627-b212-df76db143dc3`, SPKI SHA-256
`3e1ff570c6db6682616c623cffbcfd84a572291462d4b564f30efd65d9268ac5`, pinned in
`tests/wrap-key.test.ts` and `services/crates/kubcode-envelope/src/keys.rs` (slot 1 → that ARN, the
only allowlisted slot). `interop --expect-denied` passed: the admin cannot Decrypt.
`npm run keys:wrap-key -- interop --expect-denied` proves the admin cannot Decrypt; the same
command without the flag, run with a step-5 Lambda role, is the Node ↔ KMS interop check.

**As built (step 5, 2026-11-06)**, branch `feat/oauth-connect`:
- Migration `0006_connect_app_source` (§2a). Web: `lib/keys/connect-{config,store,routes}.ts`,
  routes `POST /api/keys/oauth/start`, `GET /api/keys/oauth/callback/{provider}`,
  `POST /api/keys/connections/{id}/disconnect`.
- Lambda `services/crates/kubcode-oauth-connect` (Rust, `provided.al2023` x86_64, static musl,
  rustls with ring; KMS `Decrypt` and SSM `GetParameters` are two SigV4-signed JSON calls via
  `aws-sigv4` rather than the full SDK). Routes `POST /oauth/exchange` and `/oauth/revoke`;
  KUBCODE-HMAC-V1 with the path signed, ±300 s, nonce replay guard in `connect_request_nonces`.
  Secrets come from SSM (`connect-hmac-key`, `worker-db-url`, `google-connect-client`), cached 5
  minutes, so rotation needs no redeploy and the function starts before they exist (503 until then).
  DB over TLS pinned to `db/certs/supabase-prod-ca.pem`, `sslmode=require` forced in code; the
  worker URL is the Session pooler (5432).
- Infra (behind `kubcode:oauthConnect`, set true): role `kubcode-lambda-oauth-connect` (logs +
  `ssm:GetParameters` on the three exact ARNs), log group (14 days), function (256 MB, 20 s),
  Function URL auth NONE; the role is added to the secrets key's `KeyUse` and the wrap key's
  `KeyDecrypt`. The wrap key policy is admin-only (boundary Deny on CI), so **the whole change is an
  admin apply from the branch before merge**.
- Web host env (`web.env`, Lightsail): `KUBCODE_CONNECT_URL`, `KUBCODE_CONNECT_HMAC_KEY`,
  `KUBCODE_YOUTUBE_CLIENT_ID`. Set by `webhost.sh set-connect`; the worker password and URL by
  `webhost.sh set-worker-db`. No value passes through chat, argv or the screen.

## 6. Rotation

- **User secret**: replace writes a new envelope with `version+1` and an audit row. Old ciphertext is overwritten.
- **Wrap key**: asymmetric keys cannot auto-rotate. Yearly, or when compromise is suspected:
  create `secrets-wrap-v2` (admin), add it as slot 2, commit the new public key, then a re-wrap
  Lambda decrypts each DEK with v1 and re-wraps it with v2 (payloads untouched). Then disable v1,
  and schedule its deletion after 30 days. Documented now, built when first needed.
- **HMAC key / worker DB password**: put a new SSM value, update the web host env (`web.env`), restart. The
  Lambda accepts current+previous for 24 h.

## 7. Threat model

| Attacker has | Can | Cannot |
|---|---|---|
| **Vercel env** (DATABASE_URL `kubcode_app`, NEXTAUTH_SECRET, **HMAC key**, public key) | Forge sessions and act as any user in the UI. Read metadata (kinds, last 4, account labels, audit). Delete or replace secrets. **Inject** attacker-chosen secrets or connect their own accounts (substitution). With the HMAC key: sign Lambda requests, but these only complete or revoke intents and connections that they could already drive through the forged UI. The Lambda returns no secret. Rotate the HMAC key together with the other Vercel env secrets. | Decrypt any stored secret or token: no `kms:Decrypt`, no AWS creds, and no SELECT on envelope columns. Read the worker DB URL. Recover past plaintexts. |
| **Supabase DB read** (backup or a leaked privileged URL) | Metadata, last-4 hints, ciphertext, state/cookie hashes. With write access: substitution and DoS. | Decrypt envelopes or PKCE verifiers. Move ciphertext across rows (AAD fails). Use hashed state tokens. |
| **GitHub repo read** | Code, public key, ARNs, infra layout. | Anything secret: nothing secret is in git. |
| **Push to main** (owner creds, also used by agents) / CI | Ship Lambda code that decrypts and exfiltrates. **This is the trust root.** It leaves a trail (CloudTrail Decrypt, Lambda versions). | Grant itself Decrypt directly (boundary Deny), or change the boundary or GitHub trust. |
| **Other principals in the AWS account** (client roles) | — | Use the wrap key: its policy names explicit role ARNs and has no root/IAM delegation. |
| **Lambda RCE** | Decrypt every user's secrets. Mitigations: small code, fixed endpoints, no user-supplied URLs. | — |

Secrets never reach logs (fixed error codes only), browsers (status + last 4), git or chat.

## 8. UI (`/account/keys`, owner-only in phase 1: `users.is_owner` + `KUBCODE_KEYS_ENABLED`)

The page is in Thai and has four sections:
- **YouTube**: Google client (client_id shown; secret shown as "ตั้งค่าแล้ว ••••ab12"), setup
  steps (Web client, redirect URI, In production), a list of connected channels with status and
  last check, and the buttons "เชื่อมช่อง" and "ยกเลิกการเชื่อม".
- **Instagram**: Meta Instagram app ID + secret, connected @accounts, token expiry.
- **คีย์อื่น**: ElevenLabs add/replace/delete.
- **ประวัติ**: the last 20 audit events.

Every write uses the existing CSRF/Origin guards.

**As built (step 3, 2026-11-05).**
- Routes: `POST /api/keys/secrets {kind, publicValue, secret}` and
  `DELETE /api/keys/secrets/{kind} {confirmDisconnect?}`, both behind `guardWrite` (the interactions
  guard: Origin + CSRF before any body byte, streamed 2 KiB cap). There is no read API: the page is
  server-rendered from `KeyStore.overview`, so metadata never travels as a separate JSON endpoint.
- One place per rule: `lib/keys/access.ts` holds `keysEnabled(env)` (flag `KUBCODE_KEYS_ENABLED`,
  exactly `"true"`) and `canUseKeys(member)` (owner-only now). ADR 0003 (creators) changes only
  `canUseKeys`.
- The page 404s when the flag is off or the member is not allowed, redirects signed-out visitors to
  `/account`, and is `noindex`.
- `lib/keys/wrap-key.ts` held `CURRENT_WRAP_KEY = null` until step 4 (set to wrap key v1 on
  2026-11-05). With no key, saving answers
  `NOT_READY` (after the member check, so only an allowed member learns it), and the page disables
  the save buttons. Reading and deleting work.
- Connect/disconnect buttons render disabled with "เร็วๆ นี้" until step 5.

## 9. Build plan (after OK) — vertical TDD slices

1. Envelope v1: TS + Rust crates (`services/crates/kubcode-envelope`) with shared test vectors, and
   the KMS interop test (needs the wrap key, so it comes after the infra apply).
2. Migration 0004 + store (per-user RLS, column grants), integration tests on a local Postgres 17.
3. Save/replace/delete keys API + `/account/keys` UI (`next start` locally).
4. Infra PR: wrap key, boundary, SSM, roles. Admin apply.
5. `kubcode-oauth-connect` Lambda + start/callback routes (cargo-lambda locally, then a live
   connect by the owner).
6. `kubcode-token-refresh` + schedule.

**Vercel rate limit (obsolete since ADR 0001 moved the web host to Lightsail; branch pushes now run checks only):** Rust lives in `services/**`. Until the limit lifts (~2026-11-05 16:00),
only infra/docs commits are pushed. Web, migration and `services/` work stays local. Adding
`services/**` to the preview path filter edits `preview.yml`, which itself triggers Vercel, so
that change waits too.
