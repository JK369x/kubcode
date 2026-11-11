# Channel selection and OAuth

Use the Bun + Elysia runtime described in [social-api/README.md](../../../../social-api/README.md). Connections are private files under JK_SOCIAL_STATE_DIR/youtube/<profile>/. Inventory reads channel.json only and checks token-file existence. Show title, exact id and profile; existence is not a verified connection. No real profiles ship with the repo.

Obtain the current task's channel choice even for one connection. POST /youtube/<profile>/verify with {channelId} after that choice. It compares channel.json.id before loading token.json and calls channels.list with mine=true. Stop on any mismatch. Never relabel an existing profile to match a different channel. The local API key and provider token are different secrets.

The starter consumes a previously connected token.json with token or access_token. It does not implement login, refresh, scope upgrades or token migration. On expiry stop and reconnect the selected profile through the owner's OAuth flow. For new OAuth work use Bun fetch with Google Desktop OAuth, PKCE, state and a loopback callback. Verify fresh live identity before replacing working credentials; request only needed scopes while retaining existing necessary grants. Preserve receipts. Do not import Python SDK snippets as the chosen runtime.

Keep profile directories 700 and credential files 600; exclude all credentials from Git. Serialize writes/refreshes per profile. Check ownership of videos, playlists and comment threads before writes; explicit read URLs confer no edit rights.

[Official Google Desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [YouTube OAuth](https://developers.google.com/youtube/v3/guides/auth/installed-apps).
