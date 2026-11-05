use lambda_http::{run, service_fn, Error, Request};
use package_signer::{handler::Config, lambda};
use std::time::{SystemTime, UNIX_EPOCH};

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Error> {
    let cfg = Config::from_env();
    if let Err(e) = &cfg {
        // Logged once at cold start; each request then answers 500.
        println!("outcome=config_error missing={}", e.0);
    }
    let cfg = &cfg;

    run(service_fn(move |req: Request| async move {
        let reply = lambda::reply(cfg, &req, unix_now());
        println!("{}", reply.log);
        Ok::<_, Error>(lambda::into_response(reply))
    }))
    .await
}
