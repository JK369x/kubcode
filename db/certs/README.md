# Database TLS CA

`supabase-prod-ca.pem` is a **public** CA bundle (not a secret). CI uses it to
verify the Supabase pooler certificate and hostname when it runs migrations
(`KUBCODE_DB_CA_CERT`, see `lib/accounts/config.ts`). TLS verification is never
disabled.

Provenance: official `supabase/cli` tag `v2.114.0`,
`apps/cli-go/internal/gen/types/templates/prod-ca-2021.crt` followed by
`prod-ca-2025.crt`, concatenated unchanged.

| File | SHA-256 |
|---|---|
| prod-ca-2021.crt | `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7` |
| prod-ca-2025.crt | `5865d2b26f6128e5795a13ae58b6543599bdb82d808f7f62e3c9a8d7e8527970` |
| supabase-prod-ca.pem (bundle) | `6ecd239038a7db063a6619b71742372ecfe06c0b0ec12a9993fee4445bf0d4d6` |

Both certificates are `CN=Supabase Root 2021 CA` (not after 2031-04-26 and
2035-09-01). If Supabase rotates its root, replace the bundle from the official
source and update this table in the same commit.
