# Media alignment and release checks

Use these patterns with the installed tools and project paths. They are examples, not a requirement to install a particular model, use a particular port, or recreate a fixed layout. Save logs and raw audits in the project.

## Four clocks

Keep an edit record with:

- Source video URL/file and edition; actual video source start/end.
- Publisher transcript start/end, separately, if used.
- Fetched window start and the local retained interval inside that window.
- Composition clip starts and media-in offsets, separately from source times.

For a fetched window, source-video time = window start + local media time. After a physical cut, clip time zero refers to that selected cut, not the original episode.

Fetch a candidate window from video, then transcribe it before selecting an exact subrange:

~~~sh
ffmpeg -hide_banner -y -ss "$VIDEO_START" -i "$SOURCE" -t "$WINDOW_DURATION" \
  -map 0:v:0 -map 0:a:0 -c:v libx264 -preset veryfast -crf 18 \
  -g 30 -c:a aac -b:a 192k -movflags +faststart window.mp4
ffmpeg -hide_banner -y -i window.mp4 -vn -ac 1 -ar 16000 window.wav
~~~

Inspect existing tool/model availability. A running VoiceStudio endpoint or an installed ASR package does not prove weights are present. Prefer already installed weights; choose a suitable small local model for locating speech rather than downloading a large model by default. Keep any necessary new project resources within allowed paths. A local whisper.cpp example:

~~~sh
whisper-cli -ng -m "$MODEL_PATH" -f window.wav -l en \
  -ojf -ml 70 -sow -of window-audit -t 6 -bs 1 -bo 1
~~~

Use the actual audio language. The example runs on CPU to avoid depending on Metal initialization; supported acceleration may be used when it works. Tiny English ASR can locate speech while misspelling names; inspect the wording against official episode material. Preserve raw recognition and timing uncertainty. Larger/aligned models or listening may be needed when a cue boundary is ambiguous. Never rewrite an audit to make an expected keyword check pass.

Keep names for source, cut, and final audits distinct. Publisher VTT remains useful for spelling and full wording; its timestamps are not proven by its being official.

## Source-aware visual review

Create an early/middle/late contact sheet and sample around real scene changes. Face crops that work in one scene do not carry over to screen shares. If helpful, FFmpeg scene selection can locate changes; thresholds depend on the source and are not proof of the exact editorial cut:

~~~sh
ffmpeg -hide_banner -i window.mp4 \
  -vf 'scale=480:-2,select=gt(scene\,0.08),showinfo' -an -f null -
~~~

Preserve the full app screenshot when its controls are evidence. Keep video source playback offsets consistent with the continuing audio, even when layout changes. Inspect actual boundary frames in the encoded output, not only composition snapshots.

## Final-file evidence

~~~sh
ffprobe -v error -show_streams -show_format -of json final.mp4
ffmpeg -v error -i final.mp4 -f null -
ffmpeg -hide_banner -i final.mp4 -vn -af volumedetect -f null -
ffmpeg -hide_banner -y -i final.mp4 -vn -ac 1 -ar 16000 final-audio.wav
whisper-cli -ng -m "$MODEL_PATH" -f final-audio.wav -l en \
  -ojf -ml 70 -sow -of final-audio-audit -t 6 -bs 1 -bo 1
ffmpeg -hide_banner -y -i final.mp4 \
  -vf 'fps=1/8,scale=270:480,tile=6x1' -frames:v 1 final-contact.jpg
ffmpeg -hide_banner -y -i final.mp4 -frames:v 1 final-opening.png
~~~

Adapt contact-sheet sampling to duration. Verify that the complete file decodes; a probe alone does not do this. Interpret loudness in context rather than forcing every podcast to one peak/average target. An ASR segment may extend beyond the actual media end; check the audio and container duration before treating that as additional speech.

The release record should identify the output path/hash, source edition and source/video times, actual final duration/codecs/size, full-decode result, framework result and reviewed warnings, final ASR path, and explicit opening/middle/ending caption-to-speech comparisons. Record what could not be verified. No keyword-only test or codec report is sufficient to claim semantic sync.

If a finishing trim removes a partial next sentence, save the render as an intermediate, apply the trim, then probe/decode/audit the trimmed release. Document that finishing step so a re-render reproduces the deliverable. Do not reuse the intermediate's hash or ASR as proof of the release.

## Observed failure behind this workflow

In the Cliparr example, publisher VTT time 77:39.7 was applied to video time 77:39.6. The resulting MP4 actually discussed member support while Thai captions described Cliparr. Technical validation and readable screenshots passed. ASR of the delivered MP4 reproduced the wrong topic; source video content was roughly 50 seconds later than the transcript clock in that portion of that edition. The corrected source window was transcribed, captions were retimed, a specific hook was added, screen-share framing replaced face crops, and final MP4 speech was independently audited.

This is evidence for checking clock alignment, not a reusable 50-second offset, a requirement to select Cliparr, or a reason to replace authentic speech with summary overlays.
