# Analytics, Reporting and Live

## Analytics and Reporting
Select and verify the channel first. Use Bun fetch to the separate YouTube Analytics v2 or Reporting v1 REST services with the correct exact scopes and enabled APIs. Public videos.list counters are not retention/Analytics reports. The starter does not implement report endpoints.

For reports.query pass ids=channel==<chosen_id>, explicit date range, compatible metrics/dimensions and filters. Read columnHeaders for units. Distinguish latency, unavailable data and empty rows from zero performance. Revenue needs monetary scopes and eligibility. Bulk reports need applicable report types/jobs and report authorization; reuse matching jobs rather than duplicating them.

Do not assume every Studio chart or realtime field is exposed. Dates and video-watch-page attribution can differ from the viewer's timezone/expectations; label actual returned periods. Save sanitized JSON/CSV with parameters, channel ID and retrieval time. Do not automatically schedule recurring exports.

[Queries](https://developers.google.com/youtube/analytics/reference/reports/query), [Reporting authorization](https://developers.google.com/youtube/reporting/guides/authorization), [Bulk reports](https://developers.google.com/youtube/reporting/v1/reports).

## Live
Use Data API liveBroadcasts, liveStreams and liveChatMessages only after selected-channel ownership, feature eligibility and exact scope checks. A scheduled broadcast is not permission to start/end it. Stream ingestion secrets remain private. Live chat posting needs an explicit sending instruction. Check current method docs and read back lifecycle status after requested mutations. No live implementation ships with the starter.

[Live overview](https://developers.google.com/youtube/v3/live/getting-started).
