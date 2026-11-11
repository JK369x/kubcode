# Insights

Select/verify the account first. Instagram Login Insights uses
instagram_business_basic plus instagram_business_manage_insights on graph.instagram.com.
Do not use Facebook Login scope spellings or the stale dashboard welcome banner.

| Scope | Request recipe |
| --- | --- |
| Account | GET /v26.0/<selected_user_id>/insights?metric=reach&period=day |
| Owned Reel | GET /v26.0/<owned_media_id>/insights?metric=reach |

These are recipes inherited from the source integration, not verification of a connection in this clone. The starter has no Insights route.
Verify media ownership using [Profile and media](profile-and-media.md) first.
For other metrics, read the current reference and choose compatible metric, period,
metric_type, timeframe/breakdown and media type. Do not blindly copy legacy
impressions/engagement examples or assume every metric supports day.

Views, interactions and audience reports depend on metric availability and access;
they were not all tested on a newly connected account. Distinguish permission,
unsupported-parameter and empty-data results. Never convert missing data to zero.

Specify requested date window/timezone; API end_time is UTC. Record the actual
returned periods. Summed daily unique reach is not unique reach across the whole
window. Check current historical retention, thresholds and media-type restrictions
when preparing reports. Report limitations instead of adding broad scopes by default.

Save requested aggregates, selected IDs, parameters and retrieval time. Exclude
credential-bearing paging URLs and unrelated personal data.

Official references:
- [Insights overview/permissions](https://developers.facebook.com/documentation/instagram-platform/insights)
- [Account Insights](https://developers.facebook.com/documentation/instagram-platform/api-reference/instagram-user/insights)
- [Media Insights](https://developers.facebook.com/documentation/instagram-platform/reference/instagram-media/insights)
