import { randomBytes } from "node:crypto";

const api = "https://open.tiktokapis.com/v2/";
export class Sandbox {
  intents = new Map();
  grants = new Map();
  constructor(config, request = fetch) {
    this.config = config;
    this.request = request;
    this.redirect = config.origin + "/api/keys/oauth/callback/tiktok";
  }
  prune() {
    for (const map of [this.intents, this.grants]) {
      for (const [key, entry] of map)
        if (entry.until <= Date.now()) map.delete(key);
    }
  }
  start(member, display = false) {
    this.prune();
    const state = randomBytes(32).toString("hex");
    this.intents.set(member, { state, until: Date.now() + 600000 });
    const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
    url.search = new URLSearchParams({
      client_key: this.config.clientKey,
      redirect_uri: this.redirect,
      scope: display
        ? "video.publish,user.info.basic,user.info.profile,user.info.stats,video.list"
        : "video.publish",
      response_type: "code",
      disable_auto_auth: "1",
      state,
    }).toString();
    return url.href;
  }
  async connect(member, state, code) {
    this.prune();
    if (!code || !state || this.intents.get(member)?.state !== state)
      throw Error("invalid_state");
    this.intents.delete(member);
    const res = await this.request(api + "oauth/token/", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: this.config.clientKey,
        client_secret: this.config.clientSecret,
        code,
        redirect_uri: this.redirect,
        grant_type: "authorization_code",
      }),
    });
    const token = await res.json();
    if (
      !res.ok ||
      !token.access_token ||
      !token.scope?.split(",").includes("video.publish") ||
      !(token.expires_in > 0)
    )
      throw Error("grant_denied");
    this.grants.set(member, {
      token: token.access_token,
      scopes: token.scope.split(","),
      openId: token.open_id,
      connectedAt: Math.floor(Date.now() / 1000),
      until: Date.now() + 1000 * Math.min(3600, token.expires_in),
      jobs: new Map(),
    });
  }
  async call(member, path, payload) {
    this.prune();
    const grant = this.grants.get(member);
    if (!grant) throw Error("connect_required");
    const res = await this.request(api + "post/publish/" + path + "/", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: "Bearer " + grant.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (!res.ok || result.error?.code !== "ok")
      throw Error(
        /^[a-z_]{1,80}$/.test(result.error?.code)
          ? result.error.code
          : "provider_error",
      );
    return result.data;
  }
  async display(member) {
    this.prune();
    const grant = this.grants.get(member);
    if (!grant) throw Error("connect_required");
    const scopes = grant.scopes || [];
    const fields = [];
    if (scopes.includes("user.info.basic")) fields.push("display_name");
    if (scopes.includes("user.info.profile"))
      fields.push("username", "bio_description");
    if (scopes.includes("user.info.stats"))
      fields.push(
        "follower_count",
        "following_count",
        "likes_count",
        "video_count",
      );
    async function read(path, method, body) {
      const response = await this.request(api + path, {
        method,
        body,
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: "Bearer " + grant.token,
          "Content-Type": "application/json",
        },
      });
      const result = await response.json();
      if (!response.ok || result.error?.code !== "ok")
        throw Error("display_unavailable");
      return result.data;
    }
    const [profile, list] = await Promise.all([
      fields.length
        ? read.call(this, "user/info/?fields=" + fields.join(","), "GET")
        : null,
      scopes.includes("video.list")
        ? read.call(
            this,
            "video/list/?fields=id,title,share_url,view_count",
            "POST",
            JSON.stringify({ max_count: 20 }),
          )
        : null,
    ]);
    return {
      profile: profile?.user || null,
      videos: list?.videos ?? null,
      scopes,
    };
  }
  creator(member) {
    return this.call(member, "creator_info/query", {});
  }
  async init(member, post) {
    const info = await this.creator(member);
    if (
      post.privacy !== "SELF_ONLY" ||
      !info.privacy_level_options.includes(post.privacy) ||
      post.consent !== true ||
      typeof post.caption !== "string" ||
      [...post.caption].length > 2200 ||
      !Number.isSafeInteger(post.size) ||
      post.size < 1 ||
      post.size > 64 * 1024 * 1024 ||
      !Number.isFinite(post.duration) ||
      post.duration <= 0 ||
      post.duration > info.max_video_post_duration_sec
    )
      throw Error("invalid_post");
    const data = await this.call(member, "video/init", {
      post_info: {
        title: post.caption,
        privacy_level: post.privacy,
        disable_comment: info.comment_disabled || post.comment !== true,
        disable_duet: info.duet_disabled || post.duet !== true,
        disable_stitch: info.stitch_disabled || post.stitch !== true,
        brand_organic_toggle: post.ownBrand === true,
        brand_content_toggle: false,
        is_aigc: post.ai === true,
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: post.size,
        chunk_size: post.size,
        total_chunk_count: 1,
      },
    });
    this.grants
      .get(member)
      .jobs.set(data.publish_id, { url: data.upload_url, size: post.size });
    return { publish_id: data.publish_id };
  }
  async status(member, id) {
    if (!this.grants.get(member)?.jobs.has(id)) throw Error("unknown_post");
    const data = await this.call(member, "status/fetch", { publish_id: id });
    return { status: data.status, reason: data.fail_reason };
  }
}
