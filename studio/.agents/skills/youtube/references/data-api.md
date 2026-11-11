# YouTube Data API

Select and verify the channel first. Use Bun native fetch inside Elysia service code, with fixed HTTPS provider origins, Authorization bearer headers, timeouts, encoded query/body and sanitized errors. Never accept an arbitrary authenticated proxy URL from a caller. The starter supplies verification, not the operations in this table.

| Work | REST resource/method | Scope/ownership |
| --- | --- | --- |
| Channel and videos | channels.list, videos.list | readonly; distinguish unavailable counters from zero |
| Upload inventory | channel contentDetails → uploads playlist → playlistItems.list → videos.list | paginate cursors and batch within documented limits |
| Search | search.list | use selected channelId where appropriate |
| Titles, description, tags, visibility | videos.update | exact accepted management scope; preserve unaffected writable fields |
| Cover | thumbnails.set | retain existing video ID on failure |
| Playlists/membership | playlists.*, playlistItems.* | verify owner and method scope |
| Comments | commentThreads.list, comments.list/insert | explicit instruction before posting; verify thread owner/canReply |
| Captions | captions.list/download/insert/update | caption rights/scopes; readonly alone is insufficient |

Before an update, read the actual owned resource. Fields omitted in an included update part can be cleared; preserve required title/categoryId and unaffected writable fields, excluding read-only fields. Validate native scheduling restrictions in current docs.

After a mutation, save resource IDs/receipt then read back. Preserve uncertain outcomes and reconcile before retrying inserts. Stop on missing scopes, invalid grants or quota errors instead of repeated mutations. Do not delete/post as a test.

[Official REST reference](https://developers.google.com/youtube/v3/docs), [videos.update](https://developers.google.com/youtube/v3/docs/videos/update).
