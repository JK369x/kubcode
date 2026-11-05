// The KMS RSA public key that seals user secrets (docs/design/settings-keys.md §1):
// alias/kubcode-secrets-wrap, arn:aws:kms:ap-southeast-1:955758449820:key/39320743-1ef2-4627-b212-df76db143dc3,
// created 2026-11-05. This is a copy of lib/keys/secrets-wrap-v1.pub.pem kept as a
// string so the web host needs no file read; tests/wrap-key.test.ts checks it is
// byte-identical to that file and pins its SPKI SHA-256 (also pinned in Rust).
// Rotation adds slot 2 here (design §6).
import type { WrapKey } from "./envelope";

const WRAP_KEY_V1_PEM =
  "-----BEGIN PUBLIC KEY-----\n" +
  "MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA62piGSR13v4FTlOPG2Hs\n" +
  "5EpFafOhPw+ZQu7Nsr7z7qaMkVQ69jSx4xK75A3k5lGe91F8E/XG5trBQMwl8l1+\n" +
  "z9xUv4rtfBShPDy24WSiKXaKkRW7E/bkGd/hwr2gsR8UKxpaml3sQQJGF8bRE9ee\n" +
  "DY7cHkC+q3oVe3sTwnVJwQCZvYOzN02APsj9FfBzIuVYGBxCYbKoi96wExEfaHn/\n" +
  "hnpqSO1Za04qyDs7Y2UREnZOKc9L451Gfs9tnYXN81y3mb4R2BaTHv1LRCBYwtAw\n" +
  "/r+zQDZLvyqqNCnDWYxPMYj9KUb/tC2wHHdB/mlbW488yJBarX1yoDQLNlcQACd3\n" +
  "4ojGei+5G17SFZbe8sK3ah0ouoFO5lhtujofBoCBl1e4QZO2bTtiUoLb3gzvk5nR\n" +
  "N20fbYZgonXEspV4Mc7i4Lm8XJ1rvY2KjGBZSLNKeh5dAr2Gz3ZlhB7JY5wXz8Nm\n" +
  "OQpbsZwb1fpMq1YrR4eXXbSfgeIh0JvhUOmXktaMWfR6fJtAGw0ppKe9ne+li4l+\n" +
  "fyXizCOpUd9Q3ajGRRty/5H9t7VsSoVfPmT+Q+bcxmqJM63rm38wODFwY6SeEmAS\n" +
  "dZMnVy+9hx4T9WCXnaPFFtMnLagczue6l94RCYEqiTNUMafVK4RgIptVyAAHA0/i\n" +
  "BLX+kgP73OvHFCD71xOcZK0CAwEAAQ==\n" +
  "-----END PUBLIC KEY-----\n";

export const CURRENT_WRAP_KEY: WrapKey | null = { slot: 1, publicKeyPem: WRAP_KEY_V1_PEM };
