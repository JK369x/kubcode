# Engagement and extensions

Select/verify the account before API/authorization work. These are catalog routes;
No DM/comment permissions or account connections ship with this clone.

| Capability | Requirement / route |
| --- | --- |
| Read/reply to comments; supported moderation | instagram_business_manage_comments; verify owned media/thread and exact method |
| Inbox, conversations, supported message replies | instagram_business_manage_messages; current recipient/window eligibility |
| Private replies from comments | Current private-replies method/eligibility; not unrestricted outbound DM |
| Real-time notifications | Applicable Webhooks, public HTTPS callback, verification/signature checks, subscriptions |
| Discovery, hashtags, ads, product tagging and advanced branded content | Specific API family; may require another login route, scopes and review |

Request only the capability needed now and obtain new access when required. Do not
select Add all required permissions by default or mechanically adapt Facebook Login
examples with different scope names. Configured permission is not granted consent.

Drafting replies is offline. Posting/sending requires an explicit instruction to the
identified thread/recipient. Inbox reading does not authorize responding to everyone.
Verify selected-account ownership and current messaging eligibility. Preserve IDs
and reconcile uncertain sends before retrying. Do not hide/delete comments as a test.

A Webhook needs an actual deployed endpoint and current Meta verification, signature
validation and subscriptions. No service exists here. Documentation routes create no
subscriptions, hosting bills or durable jobs. Deploy only when requested.

For another login family, explain account/Page linkage and consent requirements
before connecting it. Keep credentials separate and verify the same selected
Instagram user_id afterward. A general capability question needs no access changes.

Official sources:
- [Comment moderation](https://developers.facebook.com/documentation/instagram-platform/comment-moderation)
- [Private replies](https://developers.facebook.com/documentation/instagram-platform/private-replies)
- [Instagram Login/messaging](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login)
- [Meta-owned API collection / Send API](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api)
- [Platform overview](https://developers.facebook.com/documentation/instagram-platform/overview)
