# kubcode TikTok Sandbox

Use one HTTPS test installation of kubcode with working central member sign-in and the account database. Register that exact origin plus `/api/keys/oauth/callback/tiktok` in the Web Login Kit settings of the **Sandbox** in the existing kubcode TikTok app. Enable Content Posting API → Direct Post, apply changes and add a private test account under Target users.

Start the sandbox bridge with Node 22+ on the same host as Next. Set TIKTOK_SANDBOX_KEY and TIKTOK_SANDBOX_SECRET in the bridge environment only, using the Sandbox credentials. Set TIKTOK_SANDBOX_ORIGIN to the HTTPS origin without a trailing slash and TIKTOK_SANDBOX_BRIDGE to a random shared secret of at least 32 characters in both processes. Start the bridge with `node services/tiktok-sandbox/server.mjs` and run the site's normal Next server. Keep the bridge on loopback. Configure the HTTPS reverse proxy to allow the intended upload size (up to 64 MiB) and 185 seconds. Keep tokens, OAuth callback query strings and authorization headers out of logs.

Sign in at /account, open /account/tiktok, authorize the test account and select a short MP4. Check the nickname and preview, edit the caption, choose Only me, confirm and post. Wait for TikTok's PUBLISH_COMPLETE status and verify the private video in the target account. The bridge discards grants after one hour or a restart. Reconnect to continue. This sandbox service runs separately from the production OAuth Lambda.

Local contract tests: `node --import tsx --test tests/tiktok-sandbox.test.ts`. These use simulated TikTok responses.
