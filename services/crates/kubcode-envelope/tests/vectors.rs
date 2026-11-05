//! Cross-language contract: envelopes sealed by lib/keys/envelope.ts (the
//! Vercel side) must open here, and tampered ones must not.
use kubcode_envelope::{open, LocalRsaUnwrapper, SecretContext};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Ctx {
    table: String,
    row_id: String,
    user_id: String,
    kind: String,
    version: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Valid {
    name: String,
    ctx: Ctx,
    plaintext: String,
    aad: String,
    envelope_hex: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Tampered {
    name: String,
    ctx: Ctx,
    envelope_hex: String,
}

#[derive(Deserialize)]
struct Vectors {
    valid: Vec<Valid>,
    tampered: Vec<Tampered>,
}

const FIXTURES: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../tests/fixtures/envelope"
);

fn vectors() -> Vectors {
    serde_json::from_str(&std::fs::read_to_string(format!("{FIXTURES}/vectors-v1.json")).unwrap())
        .unwrap()
}

fn unwrapper() -> LocalRsaUnwrapper {
    let pem = std::fs::read_to_string(format!("{FIXTURES}/test-only-wrap-key.pem")).unwrap();
    LocalRsaUnwrapper::from_pkcs8_pem(1, &pem).unwrap()
}

fn ctx(c: &Ctx) -> SecretContext {
    SecretContext::new(&c.table, &c.row_id, &c.user_id, &c.kind, c.version).unwrap()
}

#[test]
fn typescript_sealed_vectors_open_under_their_context() {
    let u = unwrapper();
    for v in vectors().valid {
        let c = ctx(&v.ctx);
        assert_eq!(String::from_utf8(c.aad()).unwrap(), v.aad, "{}", v.name);
        let envelope = hex::decode(&v.envelope_hex).unwrap();
        let plain = pollster::block_on(open(&envelope, &c, &u))
            .unwrap_or_else(|e| panic!("{}: {e}", v.name));
        assert_eq!(
            std::str::from_utf8(&plain).unwrap(),
            v.plaintext,
            "{}",
            v.name
        );
    }
}

#[test]
fn tampered_vectors_are_rejected() {
    let u = unwrapper();
    for v in vectors().tampered {
        let envelope = hex::decode(&v.envelope_hex).unwrap();
        let result = pollster::block_on(open(&envelope, &ctx(&v.ctx), &u));
        assert!(result.is_err(), "{} opened", v.name);
    }
}
