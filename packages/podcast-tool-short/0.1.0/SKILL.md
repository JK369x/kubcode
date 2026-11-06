---
name: podcast-tool-short
description: >-
  Turn an existing podcast or interview segment about a software tool into a
  usable recommendation Short: select the right speech, add a clear topic hook,
  align Thai captions, frame faces and screen demos, and provide posting copy.
  Use for “ตัดพอดแคสต์แนะนำเครื่องมือ”, “ทำคลิปจริงพร้อมลง”, or making another
  clip like the Cliparr example. Metadata-only requests belong to yt-package
  or yt-seo; this skill owns the finished video workflow.
---

# Podcast Tool Short

Produce an actual audience-facing clip, not a demonstration of the editing pipeline. The tool being recommended is the subject; FFmpeg, HyperFrames, subtitle generation and rendering are production details.

## Resume the brief

Use the supplied recording or the established project before finding another source. Preserve accepted choices. For an unspecified “make another like this” request, use these defaults as a starting point: one roughly 30–60 second, 9:16 clip; original speaker audio; Thai translated dialogue captions; a visible opening hook; title, description and source credit. Explicit user choices override these defaults.

A request for only a title, description, transcription or a small edit does not authorize rebuilding the entire clip. For video work, load the available HyperFrames entry skill and its relevant authoring/CLI guidance. Prefer installed local tools; do not assume API credits or model weights are available.

## Select content from actual video audio

- Find a self-contained tool explanation: what it does, the specific use case, and a concrete payoff. Start and finish on complete thoughts. Exclude unrelated fundraising, sponsor reads and channel housekeeping unless they are the requested subject.
- Keep provenance: official episode URL, exact media edition, source language, actual video cut times, and changes made. Verify reuse terms for that media. A download link alone is not a license. When official pages conflict, preserve that discrepancy and report the unresolved rights question rather than inventing a license or claiming commercial publication is cleared. Continue useful local draft work within the existing authorization.
- Treat a publisher transcript as a wording/search aid until its clock is checked against the downloaded video. Audio releases, video releases and transcripts can contain different intros or edits. A time match that selects the wrong speech is a failed cut, even when encoding succeeds.
- Transcribe a small actual video window around the candidate. Identify speech anchors and cut using that window's local times. Keep video source time, publisher-transcript time, selected-clip time and composition time distinct. Never apply a remembered offset from another episode.
- Read [media-checks.md](references/media-checks.md) when extracting, aligning or verifying media. Preserve raw ASR; verify product-name spelling against official material instead of forcing expected words into the audit.

## Make the topic clear before polishing

Use the viewer's problem and the real benefit for the opening hook. Name the tool or its specific use case immediately; a face and dialogue subtitles alone may not explain why the viewer should watch. A hook such as “เจอฉากเด็ดใน Plex / Jellyfin? กดเดียว เก็บเป็นคลิป” promises capture, not a finished edit/export in one click.

Keep a useful hook visible long enough to read, then use a compact topic label if that helps. Avoid editor-facing banners such as “PODCAST → SHORT”, “แปลไทย / THAI SUBTITLES”, processing stages, or cards explaining how this video was produced. Relevant product headings and authentic software UI are welcome; “no unnecessary text” does not mean removing the actual topic hook.

Translate the speech that is really present. Use short, naturally broken Thai cues, usually one or two lines. Summary cards cannot repair unrelated audio. Preserve meaning, product names and qualifications; do not invent numbers, personal experience, results or speaker endorsements. Retain original speech by default. Resolve an actual chosen voice/profile only when the brief requests narration or dubbing; do not automatically replace a podcast speaker with a saved clone.

Use the available yt-script, yt-package or yt-seo skills when their editorial work is needed. Write metadata about the featured tool, not the software used to make the video.

## Frame the source as it changes

Inspect native early/middle/late frames and shot boundaries before committing to a face crop. Prefer native footage when a lower-resolution proxy makes faces soft. Keep captions away from faces and meaningful controls.

A three-person stack may work while people are visible and fail as soon as the source switches to a shared screen. Switch framing at that change: preserve the actual app screen, move captions below it, and keep important controls visible. Do not apply face crops to a software screenshot or stretch footage to fill a canvas. Use authentic screen evidence rather than invented product UI.

Use FFmpeg for physical cuts, reframing, audio finishing and clean sentence endings; use HyperFrames for timed captions and designed topic overlays. Follow its current media/timeline contract rather than copying a stale CLI version or hand-driving media playback. Local rendering is part of an authorized request for a finished clip; it does not require a separate ritual approval.

## Verify two independent kinds of correctness

**Media and visual correctness:** run the framework checks, inspect frames from the encoded MP4 (opening, middle, ending and shot changes), probe dimensions/fps/duration/audio, and decode the whole file. Check that voice is audible and not clipped. Match the requested destination; 1080×1920 H.264 with AAC and 30 fps is a useful Shorts default, not a requirement for every brief.

**Speech and caption correctness:** extract audio from the final encoded file and transcribe it afresh. Compare opening, middle and ending speech anchors with the visible cues at those times. Confirm the product/use case, a meaningful feature, and the promised payoff. Check names against the source when ASR is phonetic. Keyword presence alone does not prove timing or translation accuracy. A framework pass proves neither the spoken subject nor subtitle alignment.

Bind the audit to the exact delivered file, preferably with its hash. Any final cut, audio replacement or trim invalidates the previous final-file audit. Recheck the changed deliverable. Finish after a full sentence; exclude the start of the following sentence. Do not say “ready to post” while a speech mismatch, clipped thought, missing hook or unresolved readiness issue remains.

## Deliver a usable package

Return the final MP4 using an absolute local media path, plus concise copy-ready title/description and credit. Put the tool name and benefit in the first two description lines, followed by its official link. Identify the original speaker/show, link the exact episode, describe the adaptation and use the verified license. Avoid unrelated hashtags and unsupported claims about the speaker's fame. For a fame question, verify identity from episode evidence and profile credentials; separate measured audience data from editorial judgment.

Keep a compact verification record with the selected video times, ASR evidence, technical results and known limitations. Keep rejected outputs out of the main delivery path; when correcting a previously linked file, make the corrected output unambiguous. Do not upload or contact the original creator unless requested.

Invocation example: “ใช้ $podcast-tool-short ทำคลิปแนะนำเครื่องมือจากพอดแคสต์นี้ 1 คลิป พร้อม hook ซับไทย และคำอธิบายสำหรับโพสต์”
