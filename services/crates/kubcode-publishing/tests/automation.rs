//! Comment → DM rules (docs/design/ig-comment-dm.md §4.1, §4.8).

use kubcode_publishing::automation::{choose, normalize, MatchMode, Rule, Scope};

fn rule(id: &str, keywords: &[&str], mode: MatchMode, scope: Scope) -> Rule {
    Rule {
        id: id.into(),
        keywords: keywords.iter().map(|k| k.to_string()).collect(),
        mode,
        scope,
        active: true,
    }
}

#[test]
fn text_is_folded_before_matching() {
    assert_eq!(
        normalize("  Send\u{200B}  ME\tthe\n LINK "),
        "send me the link"
    );
    assert_eq!(normalize("ขอ\u{200D}ลิงก์\u{FEFF}"), "ขอลิงก์");
    assert_eq!(normalize("\u{2060}\u{200C}"), "");
}

#[test]
fn contains_finds_thai_without_word_breaks() {
    let r = rule("r1", &["ขอลิงก์"], MatchMode::Contains, Scope::AllPosts);
    let rules = [r];
    assert_eq!(
        choose(&rules, "p1", "อยากได้ ขอลิงก์ หน่อยครับ").map(|r| r.id.as_str()),
        Some("r1")
    );
    assert_eq!(
        choose(&rules, "p1", "ขอ\u{200B}ลิงก์").map(|r| r.id.as_str()),
        Some("r1"),
        "zero-width inside"
    );
    assert!(choose(&rules, "p1", "ขอบคุณครับ").is_none());
}

#[test]
fn exact_needs_the_whole_comment() {
    let rules = [rule("r1", &["LINK"], MatchMode::Exact, Scope::AllPosts)];
    assert!(choose(&rules, "p1", " link ").is_some());
    assert!(choose(&rules, "p1", "link please").is_none());
}

#[test]
fn a_post_rule_wins_over_an_all_posts_rule() {
    let rules = [
        rule("all", &["link"], MatchMode::Contains, Scope::AllPosts),
        rule(
            "post",
            &["link"],
            MatchMode::Contains,
            Scope::Post("p1".into()),
        ),
    ];
    assert_eq!(
        choose(&rules, "p1", "link").map(|r| r.id.as_str()),
        Some("post")
    );
    assert_eq!(
        choose(&rules, "p2", "link").map(|r| r.id.as_str()),
        Some("all")
    );
}

#[test]
fn inactive_rules_and_empty_keywords_never_fire() {
    let mut paused = rule("r1", &["link"], MatchMode::Contains, Scope::AllPosts);
    paused.active = false;
    let blank = rule(
        "r2",
        &["  ", "\u{200B}"],
        MatchMode::Contains,
        Scope::AllPosts,
    );
    assert!(
        choose(&[paused, blank], "p1", "link").is_none(),
        "an empty keyword must not match everything"
    );
}
