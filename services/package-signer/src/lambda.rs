//! Thin adapter between `lambda_http` types and the pure handler.

use crate::handler::{handle, Config, ConfigError, Reply, Req};
use lambda_http::{Body, Request, Response};

pub fn reply(cfg: &Result<Config, ConfigError>, req: &Request, now: u64) -> Reply {
    handle(
        cfg,
        &Req {
            method: req.method().as_str(),
            // Path only: the query string never takes part in routing or signing.
            path: req.uri().path(),
            headers: req.headers(),
            // Exactly the bytes that were signed, whether Text or Binary.
            body: req.body().as_ref(),
        },
        now,
    )
}

pub fn into_response(reply: Reply) -> Response<Body> {
    Response::builder()
        .status(reply.status)
        .header("content-type", "application/json")
        .header("cache-control", "no-store")
        .body(Body::Text(reply.body))
        .expect("static headers and a valid status code")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::verify::sign;

    const KEY: &str = "test-key-0123456789abcdef0123456789abcdef";
    const NONCE: &str = "00112233445566778899aabbccddeeff";
    const BODY: &str = r#"{"key":"packages/x/1.0.0.zip","filename":"x-1.0.0.zip","user":"11111111-2222-4333-8444-555555555555"}"#;

    fn config() -> Result<Config, ConfigError> {
        Config::from_lookup(|name| {
            let value = match name {
                "KUBCODE_PACKAGE_SIGNER_KEY" => KEY,
                "KUBCODE_PACKAGE_BUCKET" => "bkt",
                "AWS_REGION" => "us-east-1",
                "AWS_ACCESS_KEY_ID" => "AKID",
                "AWS_SECRET_ACCESS_KEY" => "secret",
                _ => return None,
            };
            Some(value.to_string())
        })
    }

    fn request(method: &str, uri: &str, body: Body, signed_body: &str) -> Request {
        let ts = "1700000000";
        let mut req = lambda_http::http::Request::builder()
            .method(method)
            .uri(uri)
            .header("x-kubcode-timestamp", ts)
            .header("x-kubcode-nonce", NONCE)
            .header(
                "x-kubcode-signature",
                sign(KEY.as_bytes(), ts, NONCE, signed_body.as_bytes()),
            )
            .body(body)
            .unwrap();
        req.headers_mut()
            .insert("content-type", "application/json".parse().unwrap());
        req
    }

    #[test]
    fn signs_bytes_whether_lambda_http_hands_them_over_as_text_or_binary() {
        for body in [
            Body::Text(BODY.to_string()),
            Body::Binary(BODY.as_bytes().to_vec()),
        ] {
            let r = reply(
                &config(),
                &request("POST", "/sign", body, BODY),
                1_700_000_000,
            );
            assert_eq!(r.status, 200, "{}", r.body);
        }
    }

    #[test]
    fn ignores_the_query_string_when_routing_and_rejects_an_empty_body() {
        let ok = reply(
            &config(),
            &request("POST", "/sign?x=1", Body::Text(BODY.into()), BODY),
            1_700_000_000,
        );
        assert_eq!(ok.status, 200);
        let empty = reply(
            &config(),
            &request("POST", "/sign", Body::Empty, BODY),
            1_700_000_000,
        );
        assert_eq!(empty.status, 401);
    }

    #[test]
    fn response_is_json_with_the_reply_status_and_body() {
        let resp = into_response(Reply {
            status: 401,
            body: r#"{"error":"unauthorized"}"#.into(),
            log: String::new(),
        });
        assert_eq!(resp.status(), 401);
        assert_eq!(resp.headers()["content-type"], "application/json");
        assert_eq!(resp.headers()["cache-control"], "no-store");
        assert_eq!(
            resp.body(),
            &Body::Text(r#"{"error":"unauthorized"}"#.into())
        );
    }
}
