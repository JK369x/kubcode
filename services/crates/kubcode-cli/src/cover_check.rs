//! Did YouTube serve our designed cover? Compares the clip's `cover.jpg` with
//! the thumbnails YouTube serves for the video: `oar2.jpg` (the Shorts card)
//! and `maxresdefault.jpg` (landscape, our vertical cover in the middle with
//! blurred sides). A difference hash at 9x8 tolerates scaling and JPEG noise;
//! a different picture lands far away.

use image::imageops::FilterType;
use image::DynamicImage;

/// Hamming distance (of 64 bits) at or below which two pictures are the same.
pub const MAX_DISTANCE: u32 = 12;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    Ok,
    Mismatch,
    /// A thumbnail is not served yet (private until release) or unreadable.
    Pending,
}

impl Verdict {
    pub fn as_str(self) -> &'static str {
        match self {
            Verdict::Ok => "ok",
            Verdict::Mismatch => "mismatch",
            Verdict::Pending => "pending",
        }
    }
}

fn decode(bytes: &[u8]) -> Option<DynamicImage> {
    image::load_from_memory(bytes).ok()
}

fn dhash(img: &DynamicImage) -> u64 {
    let small = img.resize_exact(9, 8, FilterType::Triangle).to_luma8();
    let mut bits = 0u64;
    for y in 0..8 {
        for x in 0..8 {
            let left = small.get_pixel(x, y)[0];
            let right = small.get_pixel(x + 1, y)[0];
            bits = (bits << 1) | u64::from(left > right);
        }
    }
    bits
}

/// The distance between two pictures' hashes (for logs and tests).
pub fn distance(a: &DynamicImage, b: &DynamicImage) -> u32 {
    (dhash(a) ^ dhash(b)).count_ones()
}

/// The Shorts card is the same 9:16 shape as the cover.
pub fn shorts_matches(cover: &[u8], oar2: &[u8]) -> Option<bool> {
    let (c, t) = (decode(cover)?, decode(oar2)?);
    Some(distance(&c, &t) <= MAX_DISTANCE)
}

/// The landscape thumbnail shows the vertical cover full height in the middle.
pub fn landscape_matches(cover: &[u8], maxres: &[u8]) -> Option<bool> {
    let (c, t) = (decode(cover)?, decode(maxres)?);
    let (w, h) = (t.width(), t.height());
    let inner = (u64::from(h) * u64::from(c.width()) / u64::from(c.height().max(1))) as u32;
    if inner == 0 || inner > w {
        return Some(false);
    }
    let middle = t.crop_imm((w - inner) / 2, 0, inner, h);
    Some(distance(&c, &middle) <= MAX_DISTANCE)
}

/// Ok only when both thumbnails show our cover; any clear miss is a mismatch.
pub fn verdict(shorts: Option<bool>, landscape: Option<bool>) -> Verdict {
    match (shorts, landscape) {
        (Some(false), _) | (_, Some(false)) => Verdict::Mismatch,
        (Some(true), Some(true)) => Verdict::Ok,
        _ => Verdict::Pending,
    }
}

/// The video id in a YouTube receipt URL (`watch?v=` or `/shorts/`).
pub fn youtube_video_id(url: &str) -> Option<&str> {
    let rest = url
        .strip_prefix("https://www.youtube.com/watch?v=")
        .or_else(|| url.strip_prefix("https://youtube.com/watch?v="))
        .or_else(|| url.strip_prefix("https://www.youtube.com/shorts/"))
        .or_else(|| url.strip_prefix("https://youtube.com/shorts/"))?;
    let id = rest.split(['&', '?', '#', '/']).next()?;
    let ok = (6..=20).contains(&id.len())
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
    ok.then_some(id)
}

/// Fetches the Shorts card and the landscape thumbnail (`fetch` answers None
/// for anything not served) and compares both with the cover.
pub fn check_youtube(
    cover: &[u8],
    video_id: &str,
    fetch: impl Fn(&str) -> Option<Vec<u8>>,
) -> Verdict {
    let url = |name: &str| format!("https://i.ytimg.com/vi/{video_id}/{name}.jpg");
    let shorts = fetch(&url("oar2")).and_then(|t| shorts_matches(cover, &t));
    let landscape = fetch(&url("maxresdefault")).and_then(|t| landscape_matches(cover, &t));
    verdict(shorts, landscape)
}
