//! The cover check against what YouTube really served for the first post
//! (tests/fixtures/cover/README.md).

use kubcode_cli::cover_check::{landscape_matches, shorts_matches, verdict, Verdict};

fn img(name: &str) -> Vec<u8> {
    std::fs::read(format!(
        "{}/tests/fixtures/cover/{name}",
        env!("CARGO_MANIFEST_DIR")
    ))
    .unwrap()
}

#[test]
fn a_video_frame_on_the_shorts_card_is_not_our_cover() {
    let cover = img("vatican-cover.jpg");
    assert_eq!(
        shorts_matches(&cover, &img("vatican-oar2-frame.jpg")),
        Some(false)
    );
    // The cover itself, re-encoded, is.
    assert_eq!(shorts_matches(&cover, &cover), Some(true));
}

#[test]
fn the_landscape_thumbnail_carries_our_cover_in_the_middle() {
    let cover = img("vatican-cover.jpg");
    assert_eq!(
        landscape_matches(&cover, &img("vatican-maxres.jpg")),
        Some(true)
    );
    // A landscape picture of something else does not.
    assert_eq!(
        landscape_matches(&cover, &img("vatican-oar2-frame.jpg")),
        Some(false)
    );
}

#[test]
fn undecodable_images_are_unknown_not_a_pass() {
    let cover = img("vatican-cover.jpg");
    assert_eq!(shorts_matches(&cover, b"not an image"), None);
    assert_eq!(landscape_matches(b"", &cover), None);
}

#[test]
fn ok_only_when_both_match() {
    assert_eq!(verdict(Some(true), Some(true)), Verdict::Ok);
    assert_eq!(verdict(Some(false), Some(true)), Verdict::Mismatch);
    assert_eq!(verdict(Some(true), Some(false)), Verdict::Mismatch);
    // Not served yet (private until release) or not decodable: keep waiting.
    assert_eq!(verdict(None, Some(true)), Verdict::Pending);
    assert_eq!(verdict(Some(true), None), Verdict::Pending);
    assert_eq!(verdict(None, None), Verdict::Pending);
}

#[test]
fn distances_leave_a_wide_margin() {
    use kubcode_cli::cover_check::{distance, MAX_DISTANCE};
    let d = |a: &str, b: &str| {
        distance(
            &image::load_from_memory(&img(a)).unwrap(),
            &image::load_from_memory(&img(b)).unwrap(),
        )
    };
    let frame = d("vatican-cover.jpg", "vatican-oar2-frame.jpg");
    eprintln!("cover vs Shorts frame: {frame}");
    assert!(
        frame > MAX_DISTANCE + 8,
        "a different picture is far away ({frame})"
    );
}

#[test]
fn the_video_id_comes_from_the_receipt_url() {
    use kubcode_cli::cover_check::youtube_video_id;
    assert_eq!(
        youtube_video_id("https://www.youtube.com/watch?v=BoJ8InE_k-0"),
        Some("BoJ8InE_k-0")
    );
    assert_eq!(
        youtube_video_id("https://youtube.com/shorts/BoJ8InE_k-0"),
        Some("BoJ8InE_k-0")
    );
    for bad in [
        "",
        "https://www.youtube.com/watch?v=../../x",
        "https://evil.example/watch?v=BoJ8InE_k-0",
        "https://www.instagram.com/reel/abc/",
    ] {
        assert_eq!(youtube_video_id(bad), None, "{bad}");
    }
}

#[test]
fn checking_a_video_fetches_both_thumbnails() {
    use kubcode_cli::cover_check::check_youtube;
    let cover = img("vatican-cover.jpg");
    let served = |oar2: Option<&'static str>, maxres: Option<&'static str>| {
        move |url: &str| -> Option<Vec<u8>> {
            assert!(
                url.starts_with("https://i.ytimg.com/vi/BoJ8InE_k-0/"),
                "{url}"
            );
            if url.ends_with("/oar2.jpg") {
                oar2.map(img)
            } else if url.ends_with("/maxresdefault.jpg") {
                maxres.map(img)
            } else {
                None
            }
        }
    };
    // What really happened on the first post: a frame on the Shorts card.
    assert_eq!(
        check_youtube(
            &cover,
            "BoJ8InE_k-0",
            served(Some("vatican-oar2-frame.jpg"), Some("vatican-maxres.jpg"))
        ),
        Verdict::Mismatch
    );
    // After the Studio fix both carry the cover.
    assert_eq!(
        check_youtube(
            &cover,
            "BoJ8InE_k-0",
            served(Some("vatican-cover.jpg"), Some("vatican-maxres.jpg"))
        ),
        Verdict::Ok
    );
    // Still private: nothing served yet.
    assert_eq!(
        check_youtube(&cover, "BoJ8InE_k-0", served(None, None)),
        Verdict::Pending
    );
}
