# Hosted clip generation: cost per clip (2026-11-06)

Question: would a genhaha-style service pay for itself? In that model, a creator connects our MCP server to their own Claude, asks for a clip, and our servers render it.

Status: render times are **measured** on a real cloud CPU: EC2 c7i.xlarge (4 vCPU Xeon 8488C, 8 GB) in ap-southeast-1, HyperFrames 0.8.223, no GPU. Prices for compute come from the AWS Price List API. Voice prices come from Google's pages and third-party copies of ElevenLabs' page.

## How genhaha works (checked)

Sources: `videos.genhaha.com/llms.txt`, the MCP guide (23 tools), and a live test with the owner's free account.

- **The creator's Claude does the writing.** Script, scenes and scene code are written in the user's own Claude session, so model tokens are billed to the user, not to genhaha. Our test sent about 2.8k tokens to their tools.
- **The server does the rest.** It validates the scene code (no network, timers or randomness) and wraps it in a style kit. It makes the voice-over, renders preview frames (5–15 s each), and then runs **HyperFrames** on a render machine. HyperFrames is Apache-2.0, the same engine we use.
- **There is no AI video model.** The only AI parts are the voice (free: Google Standard; paid: Gemini Lite, then Cartesia/ElevenLabs/MiniMax), optional FLUX schnell images on monthly plans only, and Google satellite tiles at +1 credit.
- **Render machines scale to zero.** `my_account` said "asleep, wakes in ~5 s". Plans are labelled "shared machine" vs "own machine". 3D styles (Three.js) are paid-only, and some are "slow style: premium only".

### Measured genhaha test (stickman style, 1 daily credit)

| Step | Result |
|---|---|
| Voice (Google `th-TH-Standard-A`, 384 chars) | 18 s, 32.1 s of video |
| Render, from queue to uploaded MP4 | about 93 s for 32 s of video, no queue |
| File | 1080×1920, **24 fps**, about **1 Mbps** H.264, 4.2 MB, AAC 44.1k, −13.9 LUFS |
| Free-tier limits seen | visible "videos.genhaha.com" watermark top-left, 75 s cap, link expires after 24 h |

## Our render benchmark

Wall-clock time per render. Test clips are copies of our own projects. For the low-poly clip, the narration and four SFX files are iCloud stubs, so silent stand-ins of the same length were used; this does not change the frame work.

| Clip | M5 (GPU) | M5 CPU-only | EC2 4 vCPU, default | EC2 4 vCPU, `--no-low-memory-mode --workers 4` |
|---|---|---|---|---|
| Podcast short, 2D + video, 20.4 s @30fps | 15 s | – | 74 s (3.6× clip length) | **52 s (2.5×)** |
| Low-poly 3D (Three.js), first 10 s @30fps | – | – | 296 s | **294 s (29×)** |
| Low-poly 3D, full 73 s @30fps | 43 s | 370 s | – | **1,932 s = 32 min (26.5×)** |

The cloud output was checked: 73.0 s long, and a frame at 40 s matches the M5 render.

Findings:

1. **2D/SVG styles run at about 2.5× clip length on 4 vCPU.** That matches genhaha's 93 s for 32 s.
2. **3D without a GPU runs at about 26–29× clip length.** WebGL falls back to SwiftShader, and one worker already saturates all 4 cores (load average 9–16), so extra workers do not help. A 73 s 3D clip took 32 minutes, against 43 s on the M5's GPU.
3. **8 GB is a trap.** HyperFrames turns on low-memory mode at ≤ 8 GB (1 worker, screenshot capture), which makes 2D renders about 40 % slower. Use `--no-low-memory-mode` or more than 8 GB. Peak memory was 0.5–0.7 GB.
4. **Lambda can't run 3D.** Its 15-minute limit is hit at about 30 s of 3D video. 3D needs a GPU machine, but this account's G/VT instance quota is 0, so a GPU test needs a quota request first.

## Unit prices used

Exchange rate assumed: 35 THB per USD.

| Item | Price | Source / confidence |
|---|---|---|
| Lambda x86, Singapore | $0.0000166667 per GB-s, tier 1; 400k GB-s per month free | AWS Price List API |
| EC2 c7i.xlarge, Singapore | $0.2058 / hour | AWS Price List API |
| Google TTS Standard | $4 / 1M chars, first 4M chars per month free | Google pricing page |
| Gemini 2.5 Flash TTS | $0.50 / 1M input tokens, $10 / 1M audio tokens (25 tokens per second) | Google pricing page |
| ElevenLabs Multilingual v2 / Flash v2.5 | about $0.10 / $0.05 per 1k chars | third-party copies of the API price page; verify |
| S3 egress | about $0.12 / GB | AWS list price |

Thai speech is about 13.4 chars/s (measured). At about 1 Mbps, a clip is about 0.13 MB per second, so egress is negligible.

## Cost per clip (measured render speeds)

| Case | Render time | Compute | Voice | Total |
|---|---|---|---|---|
| Free 32 s, 2D, Standard voice | 82 s | $0.011 (Lambda 8 GB) | $0.002 | **$0.014 ≈ ฿0.5** |
| Free 75 s, 2D, Standard | 191 s | $0.026 (Lambda) | $0.004 | **$0.032 ≈ ฿1.1** |
| Paid daily 75 s, 2D, Gemini TTS | 191 s | $0.026 (Lambda) | $0.019 | **$0.047 ≈ ฿1.6** |
| Premium 60 s, 3D, ElevenLabs v2 | **27 min** | $0.091 (EC2 CPU) | $0.080 | **$0.17 ≈ ฿6.1** |
| Premium 120 s, 3D, ElevenLabs v2 | **53 min** | $0.18 (EC2 CPU) | $0.161 | **$0.35 ≈ ฿12.1** |

On EC2 rather than Lambda, 2D compute is about 2.3× cheaper ($0.005 for 32 s), but the box costs ~$150/month if always on. Lambda's free tier covers about 600 32-second 2D clips a month.

Compared with genhaha's prices (฿6.7–14.6 per credit; 3D is 2 credits):

- **2D clips are almost free to make:** ฿0.5–1.6 each, a 5–25× margin.
- **For 3D on CPU, the problem is time and capacity, not money.** A 1-minute 3D clip makes the user wait about 27 minutes, and one 4-vCPU box makes only about 2 an hour. This fits genhaha marking 3D styles "slow, premium only". To offer 3D properly we would need GPU machines, or we start with 2D styles only.
- **Premium voices eat the margin on long clips.** A 2-minute ElevenLabs voice-over alone costs about ฿5.6.
- **Free users are the budget risk.** At 2 clips/day × 75 s of 2D, a maxed-out free user costs about ฿67 a month.

## Fixed costs and work that are not per clip

- The MCP server, job queue and API can start on the existing Lightsail host and the Supabase database, so little new monthly cost. Render on Lambda (2D) scales to zero. A 3D GPU box would be a separate decision.
- **Security is the large engineering cost.** We would run scene code that an AI wrote inside our Chromium. It needs genhaha-style validation plus a render sandbox with no network.
- Style kits must become data-driven APIs (like genhaha's `K` kit) rather than free-form skills.
- Lambda concurrency in this account is 10. Fine for a beta; raise it before launch.
- Payments (fees of about 3–4%), abuse limits per Google account, and voice licences that allow commercial use.

## Open questions

1. GPU render for 3D: request G-instance quota, then benchmark g4dn/g6 with Chrome's GPU path on Linux.
2. Confirm ElevenLabs API prices on the official page.
3. Can a creator on Claude's free plan add a custom connector? If not, the audience is limited to paid Claude users.
4. **Our edge: posting tools in the same MCP** ("make the clip, then schedule it to YouTube"). YouTube now allows 100 uploads/day per project, and unverified projects are no longer locked to private (see the ADR 0003 update).
