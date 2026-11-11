# Profile and media

Pass the account gate first. These operations read the selected account's data;
they do not provide arbitrary-account access or public Instagram search.

Use graph.instagram.com/v26.0 with a private Authorization bearer header.

| Request | Parameters / result |
| --- | --- |
| GET /me | fields=user_id,username,account_type,followers_count,follows_count,media_count |
| GET /<selected_user_id>/media | fields=id,media_type,media_product_type,permalink,timestamp; limit=25 |
| GET /<owned_media_id> | Requested documented fields, such as caption/permalink |
| GET /<selected_user_id>/content_publishing_limit | fields=config,quota_usage |

These are request recipes, not implemented starter routes or verification of this clone. Check current field/method support before execution. A Reel can have media_type=VIDEO; media_product_type
identifies REELS. Follower/media counts are snapshots, not growth histories.

A page is not the complete history. Continue with documented cursors when the task
needs all media, preserving the fixed host, selected edge and bearer header.
Do not print/store raw credential-bearing paging URLs. Report fetched coverage.

Before media Insights or existing-resource mutations, resolve ownership through the
chosen account's media listing, including relevant pagination, or a documented owner
field. A caller-supplied ID/permalink alone is not ownership evidence. Stop that
operation if ownership is unresolved.

Do not infer general profile editing, arbitrary post editing, deletion, liking,
following or search endpoints from the Instagram UI. Check actual API support for
the requested write before promising it.

Official references:
- [Getting started and fields](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/get-started)
- [Media reference](https://developers.facebook.com/documentation/instagram-platform/reference/instagram-media)
