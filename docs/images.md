# Images: caching, lazy loading, skeletons

## Cache policy (`lib/cache-headers.ts`, applied by `next.config.ts` `headers()`)

Caddy passes the app's headers through unchanged; `tests/image-performance.test.ts` checks every rule.

| Path | Cache-Control | Why it is safe |
|---|---|---|
| `/covers/<slug>/*.jpg` | `public, max-age=31536000, immutable` | A replaced cover gets a new file name (`cover-vN.jpg`, [covers.md](covers.md)). |
| `/showcase/<id>/*?v=<sha>` | `public, max-age=31536000, immutable` | `npm run showcase` rewrites `poster.jpg`/`preview.mp4` in place, so the site links them with `?v=` + the first 12 hex of the file's sha256 from `lib/showcase.json` (`lib/showcase.ts`). New content = new URL. |
| `/showcase/<id>/*` without `?v` | `public, max-age=86400, stale-while-revalidate=604800` | Same file name, content may change. |
| `/tools/*`, `/tool-icons/*`, `/kubcode-icon.png` | `public, max-age=86400, stale-while-revalidate=604800` | Logos may be swapped under the same name. |
| `/_next/static/*` (JS, CSS, fonts) | Next: `public, max-age=31536000, immutable` | Hashed names. |
| `/_next/image` | the source's max-age, at least `images.minimumCacheTTL` (31 days) | Sources are versioned as above. |

Adding a new folder under `public/` gets Next's default (`max-age=0`) until it has a rule here.

## Rendering

- Our own rasters (covers, showcase posters, catalog covers) use `SkeletonImage` (`components/SkeletonImage.tsx`): `next/image` with `fill` + `sizes` in a box whose `aspect-ratio` is set in CSS, so there is no layout shift and the optimiser serves a small AVIF/WebP.
- The LCP image (article hero, featured article card, first homepage shelf cards) is `preload`/`loading="eager"` + `fetchPriority="high"`; everything else is `loading="lazy"`.
- Third-party thumbnails/avatars (Instagram, TikTok, Google/LINE avatars) stay plain `<img>` with `referrerPolicy="no-referrer"` (never proxied), lazy, async, sized (`SkeletonImg`).
- A shimmer (`.img-skeleton`, theme tokens, still under `prefers-reduced-motion`) sits under each image until it loads; lazy images fade in. Server HTML never hides an image, so without JS it simply paints.
- Lists fetched on the client (comments panel, /community feed and ยอดนิยม, automations post picker) show skeleton rows while loading.
- Hover previews stay `preload="none"` and only get a `src` on hover/focus (`components/hoverPreview.ts`).
