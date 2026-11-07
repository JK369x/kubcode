import assert from "node:assert/strict";
import test from "node:test";
import { finishPrivateUpload } from "../lib/keys/youtube-upload";

test("confirms only a private video on the selected channel", async () => {
  const file = new File(["clip"], "clip.mp4", { type: "video/mp4" });
  for (const [channelId, privacyStatus, accepted] of [["UCowner", "private", true], ["UCother", "private", false], ["UCowner", "public", false]] as const) {
    const send: typeof fetch = async (_url, init) => {
      assert.equal(init?.method, "PUT");
      assert.equal(init?.body, file);
      return Response.json({ id: "abcdefghijk", snippet: { channelId }, status: { privacyStatus } });
    };
    const result = finishPrivateUpload("https://www.googleapis.com/upload/youtube/v3/videos?upload_id=test", file, "UCowner", send);
    if (accepted) assert.equal(await result, "abcdefghijk");
    else await assert.rejects(result);
  }
});
