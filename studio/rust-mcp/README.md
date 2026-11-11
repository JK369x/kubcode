# JK Studio MCP — Rust, local stdio

An opt-in local MCP server using the official `rmcp` 3.8.0 SDK. It talks over stdin/stdout, not a network listener. It does not publish or configure Claude/Codex. Its generated files go only under the repo's ignored `outputs/rust-mcp/` and `outputs/shot-plan-v1/` directories. Existing styles and video outputs remain unchanged.

## What works and limits

- `list_styles`, `get_style_guide`: list/read existing catalog. `create_project`: only `jk-soft-story-motion-v2` is connected to the current JK-window shot renderer; other styles return an error.
- `set_script`: save local lines with unique lowercase IDs. `set_shot_plan`: typed JSON shot plan, validated by the existing Node pipeline. The plan must match `pipelines/shot-plan-v1/schema.json`, without audio; for now it contains one JK window scene. Script and shot plan are separate: editing one does not automatically regenerate the other.
- `list_voice_providers`, `list_voice_models`, `list_voices`: the local JK option is listed; Google/ElevenLabs are explicitly unsupported by this Rust server. Their keys are neither read nor transmitted. No cloud TTS or paid fallback is implemented.
- `synthesize_voice`: uses the existing offline Thai narrator helper and its saved profile, one WAV per script line. Requires installed repo `.venv`, local model and `confirm_local_compute: true`. It invokes no cloud service and uses offline model flags. This route has not been tested with a new generation in this implementation; failures are reported as a failed job. Local model setup and identity/personal rights remain unchanged.
- `attach_voice`: attaches one WAV from a completed local voice job at a caller-provided start time. `retime_from_voice`: concatenates one generated line per shot and sets shot start/end from measured WAV durations. Mapping is positional; callers must check script and shot order. It does not align words, add pauses, determine meaning or verify the script matches the visuals. It saves the old shot plan in `revisions/`.
- `preview_frame`, `render_video`: build the known shot plan and start local HyperFrames work. They return a UUID job receipt and are followed with `job_status`; `cancel_job` targets the active child process group; `list_artifacts` / `get_artifact` return local paths/metadata. Capture/render uses 1920×1080, 30 fps, draft quality. Artifacts do not imply creative approval.

Render and preview accept caller-supplied UUID `request_id`; same UUID + same plan/action returns the same receipt and a changed action/plan is rejected. Voice jobs use the same ID rule with script hash. Receipts persist, but **execution is not durable across MCP server shutdown**: in-progress jobs are reported interrupted when subsequently inspected, and should be re-requested with a new UUID. Cancellation is tested during active local rendering; it sends termination to that child process group, but abrupt machine/server termination may leave helper processes that need inspection. Do not assume retry is safe for a future cloud provider without an independent idempotency mechanism.

## Build and test

Requires Rust, Node 22+, repo's installed HyperFrames, FFmpeg/FFprobe at `/opt/homebrew/bin/`, and a suitable local Chrome. Linux/Intel and other executable locations are not yet supported. From the repo root:

```sh
cargo build --manifest-path rust-mcp/Cargo.toml --locked
cargo test --manifest-path rust-mcp/Cargo.toml --locked
cargo run --manifest-path rust-mcp/Cargo.toml --example client_smoke --locked
node rust-mcp/safety-smoke.mjs
node rust-mcp/smoke.mjs
```

The JS integration tests use the official MCP TypeScript client installed in `rust-mcp/`; run `npm ci --ignore-scripts` there if absent. They create isolated test projects. `smoke.mjs` creates a clearly marked fixture voice job from copies of the existing JK sample audio to verify WAV-based retiming and AAC render; it does not generate new narration and the sample speech does not match the test captions. No paid calls. Full file decode and `ffprobe` should be used on exports. Some HyperFrames operations need localhost browser access. The Rust `client_smoke` uses the SDK's `TokioChildProcess` transport.

## Optional client registration — NOT run automatically

Registering grants the chosen agent access to these tools and the local project files. Review it first. Current binary absolute path on this Mac:

```
/ABSOLUTE/PATH/TO/jk-animation-studio/rust-mcp/target/debug/jk-studio-mcp
```

Claude Code (local scope, from this repo):

```sh
claude mcp add --transport stdio --scope local jk-studio -- /ABSOLUTE/PATH/TO/jk-animation-studio/rust-mcp/target/debug/jk-studio-mcp
```

Codex CLI:

```sh
codex mcp add jk-studio -- /ABSOLUTE/PATH/TO/jk-animation-studio/rust-mcp/target/debug/jk-studio-mcp
```

Restart/reconnect the client and inspect the tools. The binary uses the build-time repo path by default; if moving the build, provide `JK_STUDIO_ROOT` via the client's environment and rebuild as needed. No credentials belong in command arguments or config. The user can check `/mcp` in either app. For Claude Desktop (distinct from Claude Code), use its own local stdio configuration instructions; the command above does not configure it.

Official client references: https://code.claude.com/docs/en/mcp and https://learn.chatgpt.com/docs/extend/mcp?surface=cli. Design reference: https://videos.genhaha.com/guide. The implementation uses existing local JK/HyperFrames code, not Genhaha proprietary implementation.

Claude Desktop (chat app) uses a separate config. In Settings → Developer → Edit Config, merge this entry into the existing `mcpServers` object; do not replace other servers:

```json
{
  "mcpServers": {
    "jk-studio": {
      "command": "/ABSOLUTE/PATH/TO/jk-animation-studio/rust-mcp/target/debug/jk-studio-mcp",
      "args": []
    }
  }
}
```

Then restart/reload its MCP configuration. This is a reviewable example only; no client registration was performed. See https://modelcontextprotocol.io/docs/2026-07-28/develop/connect-local-servers.
