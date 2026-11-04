use crate::EnvelopeError;

/// Tables whose rows carry envelopes (part of the AAD).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SecretTable {
    UserSecrets,
    OauthConnections,
    OauthConnectIntents,
}

impl SecretTable {
    pub fn as_str(self) -> &'static str {
        match self {
            SecretTable::UserSecrets => "user_secrets",
            SecretTable::OauthConnections => "oauth_connections",
            SecretTable::OauthConnectIntents => "oauth_connect_intents",
        }
    }

    fn parse(s: &str) -> Option<Self> {
        [
            SecretTable::UserSecrets,
            SecretTable::OauthConnections,
            SecretTable::OauthConnectIntents,
        ]
        .into_iter()
        .find(|t| t.as_str() == s)
    }
}

/// The row an envelope belongs to. Validated with the same rules as
/// lib/keys/envelope.ts so both sides build byte-identical AAD.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SecretContext {
    table: SecretTable,
    row_id: String,
    user_id: String,
    kind: String,
    version: u32,
}

/// Lowercase canonical UUID (8-4-4-4-12 hex).
fn is_uuid(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 36
        && b.iter().enumerate().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => *c == b'-',
            _ => c.is_ascii_digit() || (b'a'..=b'f').contains(c),
        })
}

/// `^[a-z][a-z0-9_]{1,39}$`, the DB CHECK on user_secrets.kind.
fn is_kind(s: &str) -> bool {
    let b = s.as_bytes();
    (2..=40).contains(&b.len())
        && b[0].is_ascii_lowercase()
        && b[1..]
            .iter()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'_')
}

impl SecretContext {
    pub fn new(
        table: &str,
        row_id: &str,
        user_id: &str,
        kind: &str,
        version: u32,
    ) -> Result<Self, EnvelopeError> {
        let table = SecretTable::parse(table).ok_or(EnvelopeError::BadContext)?;
        if !is_uuid(row_id) || !is_uuid(user_id) || !is_kind(kind) || version < 1 {
            return Err(EnvelopeError::BadContext);
        }
        Ok(Self {
            table,
            row_id: row_id.to_owned(),
            user_id: user_id.to_owned(),
            kind: kind.to_owned(),
            version,
        })
    }

    pub fn aad(&self) -> Vec<u8> {
        format!(
            "kubcode:v1|{}|{}|{}|{}|{}",
            self.table.as_str(),
            self.row_id,
            self.user_id,
            self.kind,
            self.version
        )
        .into_bytes()
    }
}
