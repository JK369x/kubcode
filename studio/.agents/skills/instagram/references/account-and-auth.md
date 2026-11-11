# Account selection and authentication

Use [the Bun + Elysia runtime](../../../../social-api/README.md). Private profiles live under JK_SOCIAL_STATE_DIR/instagram/<profile>/. Inventory reads account.json with exact user_id and username; only token-file existence is shown. No account/app IDs or working credentials are included in this repo.

Obtain a current-task choice even for one account. POST /instagram/<profile>/verify with {userId,username}. The service compares the local binding before reading the token, then calls GET /me?fields=user_id,username on graph.instagram.com. Compare user_id, not an app-scoped id. Only leading @ and username case are normalized. Stop on mismatches.

The starter consumes token.json with access_token and uses an explicitly configured API version (default v26.0, inherited from the original integration). Recheck current Meta version/eligibility for new operations. It does not implement login, refresh, scope inspection or reauthorization. Keep the same Instagram Login scope family; do not substitute a Facebook Page token.

Use private directories 700/files 600 and serialize writes per profile. Verify replacement credentials before replacing a working profile; retain receipts. Never print tokens, copy OAuth URLs with credentials into docs or forward bearer headers to media/CDN hosts. Do not infer expiry from a historical setup receipt.

[Getting started](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/get-started), [Instagram Login](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login), [App Review](https://developers.facebook.com/documentation/instagram-platform/app-review).
