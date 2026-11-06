//! The two AWS calls this Lambda makes, signed with SigV4 (`aws-sigv4`):
//! KMS `Decrypt` (unwrap DEKs, RSAES_OAEP_SHA_256 only) and SSM
//! `GetParameters` (its secrets, decrypted by SSM with alias/kubcode-secrets).
//! Credentials come from the Lambda environment. Using two JSON calls instead
//! of the full SDK keeps the static musl build free of C crypto libraries.

use std::collections::HashMap;
use std::future::Future;
use std::time::SystemTime;

use aws_credential_types::Credentials;
use aws_sigv4::http_request::{sign, SignableBody, SignableRequest, SigningSettings};
use aws_sigv4::sign::v4;
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde_json::{json, Value};
use zeroize::Zeroizing;

/// Any AWS failure; no service text is kept.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AwsError;

pub trait Kms: Send + Sync {
    /// `kms:Decrypt` with `RSAES_OAEP_SHA_256` against an allowlisted key ARN.
    fn decrypt(
        &self,
        key_arn: &str,
        blob: &[u8],
    ) -> impl Future<Output = Result<Zeroizing<Vec<u8>>, AwsError>> + Send;
}

pub struct AwsClient {
    http: reqwest::Client,
    region: String,
}

impl AwsClient {
    pub fn from_env() -> Result<Self, AwsError> {
        let region = std::env::var("AWS_REGION").map_err(|_| AwsError)?;
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| AwsError)?;
        Ok(Self { http, region })
    }

    fn credentials() -> Result<Credentials, AwsError> {
        let id = std::env::var("AWS_ACCESS_KEY_ID").map_err(|_| AwsError)?;
        let secret = std::env::var("AWS_SECRET_ACCESS_KEY").map_err(|_| AwsError)?;
        let token = std::env::var("AWS_SESSION_TOKEN").ok();
        Ok(Credentials::new(id, secret, token, None, "lambda-env"))
    }

    /// One signed AWS JSON 1.1 call.
    async fn call(&self, service: &str, target: &str, body: Value) -> Result<Value, AwsError> {
        let url = format!("https://{service}.{}.amazonaws.com/", self.region);
        let body = serde_json::to_vec(&body).map_err(|_| AwsError)?;
        let headers = [
            ("content-type", "application/x-amz-json-1.1"),
            ("x-amz-target", target),
        ];
        let identity = Self::credentials()?.into();
        let params = v4::SigningParams::builder()
            .identity(&identity)
            .region(&self.region)
            .name(service)
            .time(SystemTime::now())
            .settings(SigningSettings::default())
            .build()
            .map_err(|_| AwsError)?
            .into();
        let signable = SignableRequest::new(
            "POST",
            &url,
            headers.iter().copied(),
            SignableBody::Bytes(&body),
        )
        .map_err(|_| AwsError)?;
        let (instructions, _) = sign(signable, &params).map_err(|_| AwsError)?.into_parts();
        let mut req = self.http.post(&url).body(body.clone());
        for (k, v) in headers.iter().copied().chain(instructions.headers()) {
            req = req.header(k, v);
        }
        let res = req.send().await.map_err(|_| AwsError)?;
        if !res.status().is_success() {
            return Err(AwsError);
        }
        res.json::<Value>().await.map_err(|_| AwsError)
    }

    /// Decrypted values of the named SecureStrings. Missing names are absent
    /// from the map (the caller decides which ones are required).
    pub async fn ssm_parameters(
        &self,
        names: &[&str],
    ) -> Result<HashMap<String, Zeroizing<String>>, AwsError> {
        let v = self
            .call(
                "ssm",
                "AmazonSSM.GetParameters",
                json!({ "Names": names, "WithDecryption": true }),
            )
            .await?;
        let mut out = HashMap::new();
        for p in v["Parameters"].as_array().ok_or(AwsError)? {
            let (Some(name), Some(value)) = (p["Name"].as_str(), p["Value"].as_str()) else {
                return Err(AwsError);
            };
            out.insert(name.to_owned(), Zeroizing::new(value.to_owned()));
        }
        Ok(out)
    }
}

impl Kms for AwsClient {
    async fn decrypt(&self, key_arn: &str, blob: &[u8]) -> Result<Zeroizing<Vec<u8>>, AwsError> {
        let v = self
            .call(
                "kms",
                "TrentService.Decrypt",
                json!({
                    "KeyId": key_arn,
                    "CiphertextBlob": B64.encode(blob),
                    "EncryptionAlgorithm": "RSAES_OAEP_SHA_256",
                }),
            )
            .await?;
        // KMS echoes the key it used; it must be the one we asked for.
        if v["KeyId"].as_str() != Some(key_arn) {
            return Err(AwsError);
        }
        let plain = v["Plaintext"].as_str().ok_or(AwsError)?;
        B64.decode(plain).map(Zeroizing::new).map_err(|_| AwsError)
    }
}
