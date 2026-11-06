//! Postgres over TLS, verified against the Supabase CA committed in
//! db/certs (the same file the web host uses). TLS is required in code, so a
//! URL without `sslmode` can never fall back to plaintext.

use std::str::FromStr;
use std::sync::Arc;

use rustls::{ClientConfig, RootCertStore};
use tokio_postgres::config::SslMode;
use tokio_postgres::{Client, Config};
use tokio_postgres_rustls::MakeRustlsConnect;

const SUPABASE_CA: &str = include_str!("../../../../db/certs/supabase-prod-ca.pem");

#[derive(Debug)]
pub struct DbError;

pub fn tls_config() -> Result<ClientConfig, DbError> {
    let mut roots = RootCertStore::empty();
    for cert in rustls_pemfile::certs(&mut SUPABASE_CA.as_bytes()) {
        roots.add(cert.map_err(|_| DbError)?).map_err(|_| DbError)?;
    }
    if roots.is_empty() {
        return Err(DbError);
    }
    Ok(
        ClientConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider()))
            .with_safe_default_protocol_versions()
            .map_err(|_| DbError)?
            .with_root_certificates(roots)
            .with_no_client_auth(),
    )
}

/// One connection for one request. The worker URL is the Supabase Session
/// pooler (port 5432), which keeps prepared statements working.
pub async fn connect(url: &str) -> Result<Client, DbError> {
    let mut config = Config::from_str(url).map_err(|_| DbError)?;
    config.ssl_mode(SslMode::Require);
    let tls = MakeRustlsConnect::new(tls_config()?);
    let (client, connection) = config.connect(tls).await.map_err(|_| DbError)?;
    tokio::spawn(async move {
        let _ = connection.await;
    });
    Ok(client)
}

#[cfg(test)]
mod tests {
    #[test]
    fn the_committed_supabase_ca_loads() {
        assert!(super::tls_config().is_ok());
    }
}
