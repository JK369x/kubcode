# kubcode Google OAuth verification

Project: pure-album-512910-d0 (YouTube Channel Uploader). Web client: kubcode web connect.
Entry point: https://kubcode.dev/account/keys → YouTube. The initial test surface is limited to eligible kubcode accounts. Give the Google reviewer a tested way to access this screen before submission.

## Scope explanations for Google

- youtube.readonly: After the user authorizes kubcode, kubcode calls channels.list with mine=true to identify and display the connected channel. Before starting an upload, kubcode checks that the access token still belongs to the selected channel.
- youtube.upload: The user chooses their own MP4, enters a title and declares whether the video is made for kids. On explicit submission, kubcode initiates a resumable videos.insert request with privacyStatus=private. The browser sends the video directly to Google and shows a YouTube Studio link only after Google returns the expected channel and private status.

## Reviewer walkthrough

1. Open the YouTube section in Account → Keys. Connect the selected test channel. Record the full Google consent flow in English, including the app name and both permissions. Exclude passwords and other account details.
2. Return to kubcode and show the connected channel. Expand the Private upload form. Select the test MP4, enter its title, choose its actual audience and submit once.
3. Follow the video link and verify the channel, video title and Private visibility in YouTube Studio. Record any processing delay separately from acceptance. Keep the test upload private.
4. Provide the reviewer an accessible demo URL. Check access from a signed-out browser and record the verification submission receipt.

Policy: https://kubcode.dev/privacy · Terms: https://kubcode.dev/terms
Google demo requirements: https://support.google.com/cloud/answer/13804565

2026-11-07 14:52 ICT: Verified a real 3-second upload through kubcode to the explicitly selected STORY GRID channel. YouTube Studio showed Private for video 4fQkPqi2pp4. Demo: docs/youtube-review-assets/kubcode-youtube-private-upload.mp4 (36.4s); current consent screen in Thai. Production audience enabled. Branding check required domain ownership and a 24-hour delay. Search Console confirmed domain ownership via Route 53 default profile; leave verification TXT in place. Next retry after 2026-11-08 14:55 ICT. Sensitive scopes submission still pending branding, complete English consent evidence and reviewer access.

English demo for owner preview: docs/youtube-review-assets/kubcode-google-oauth-en.mp4 (34.5 s). Recorded English OAuth consent, Google Account listing both grants, connected channel, previous real upload and Studio receipt. Do not submit demo or data access request until owner has viewed and approved it. Reviewer entry: https://kubcode.dev/review/youtube. Enter the private code from .qa/google-review-access/invite.txt (local only), sign in to kubcode with a separate account, return to the review page, then connect a YouTube channel. Invitation expires February 7 2027 UTC. Production smoke passed. Signed-out review ticket leads to sign-in and no channel metadata; PostgreSQL non-owner and isolation tests passed.
