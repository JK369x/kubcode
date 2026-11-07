# kubcode · TikTok web app review

**Prepared 7 November 2026.** Production app ID: 7705252738728216583. Sandbox: kubcode Web, 7705234121026471954. The Production revision was submitted and TikTok confirmed In review on 7 November 2026.

## App configuration

- App name: kubcode. Category: Photo & Video. Platform: Web.
- Icon: public/kubcode-icon.png. Website: https://kubcode.dev/
- Terms: https://kubcode.dev/terms · Privacy: https://kubcode.dev/privacy
- Login Kit Web redirect: https://kubcode.dev/api/keys/oauth/callback/tiktok
- Sandbox Webhooks callback: https://kubcode.dev/webhooks/tiktok. Production and Sandbox both passed signed portal test events with HTTP 200.
- Entry for signed-in members: https://kubcode.dev/account/tiktok. The reviewer needs a kubcode member session and access to a Sandbox target account for hands-on testing. Arrange reviewer access on request. Do not supply the owner's credentials.
- Site ownership: TikTok confirmed the https://kubcode.dev/ prefix after fetching the signature file. Use the trailing slash in the website field.
- Proposed short description: Thai creators can connect their own TikTok account, view their profile and public videos, and choose a video, caption and audience to post.

## Product and permission explanation for the reviewer

kubcode is a Thai creator website. A signed-in member connects their own TikTok account with Login Kit. For posting, video.publish lets the member preview a local MP4, choose an audience, edit a caption and interaction settings, confirm music usage and deliberately publish through Content Posting API. kubcode displays TikTok’s processing result. The Sandbox supports Only me. The creator can separately authorize the account dashboard. user.info.basic displays the account name, user.info.profile displays the username and bio, user.info.stats displays follower, following, like and video counts, and video.list lists up to 20 recent public videos with a link and view count. Private posts are outside this list. Webhooks processes signed authorization.removed events to clear matching temporary account grants. Posting progress uses the status API. The app does not store a creator analytics history.

**Portal scope check.** Content Posting API includes video.upload by default in this app's portal. The application currently uses Direct Post only. Do not describe an inbox draft workflow as implemented. Confirm with TikTok whether the included scope can remain unused or add and demonstrate an actual draft workflow if it is part of the submission. Share Kit is a native handoff feature. Data Portability, video.manage, Minis and Local Service have no demonstrated feature in this web release.

## Review attachment

Upload [kubcode-tiktok-sandbox-demo.mp4](tiktok-review-assets/kubcode-tiktok-sandbox-demo.mp4) as the demonstration video. The recording is from the deployed website with a real Sandbox target. H.264 MP4, 1920 × 1046, 57.93 seconds, 904740 bytes. English labels describe the Thai interface. A brief idle interval was removed. The recording shows connection, TikTok’s Continue screen, the authenticated dashboard, file selection and preview, caption, Only me, consent, submission, processing and final private-post success. Exactly one new test video was published in this recording.

## Evidence as of this revision

- Sandbox Direct Post to the private target account completed through kubcode. The page reported “โพสต์ส่วนตัวสำเร็จ”.
- Sandbox Webhooks portal Test URL returned 200 OK. The receiver validates the signed raw body and rejects expired or invalid signatures. Automated revocation tests verify only the matching grant is cleared.
- Live Sandbox OAuth returned HTTP 200 with all five scopes. The member dashboard showed @stickmanexplainersimple, 1 follower, 0 following, 74 likes, 3 videos and 3 linked video results. The attached recording demonstrates the live display and Direct Post flow.
- Public Direct Post beyond the private restrictions is subject to TikTok's separate audit. App review alone does not establish public posting access.

[App review guidelines](https://developers.tiktok.com/docs/en/app-review-guidelines) · [Register and verify](https://developers.tiktok.com/docs/en/getting-started-create-an-app) · [Display API](https://developers.tiktok.com/docs/en/tiktok-api-v2-get-user-info) · [Webhooks](https://developers.tiktok.com/docs/en/webhooks-verification) · [Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post)

## Submission receipt

TikTok confirmed “Your app has been submitted for review” and the Production revision is In review. Data Portability was removed. Attachments: kubcode-tiktok-sandbox-demo.mp4, kubcode-webhooks-sandbox.mp4, kubcode-webhooks-production.mp4. The Production portal returned 200 OK at 14:17 Bangkok time on 7 November 2026.
