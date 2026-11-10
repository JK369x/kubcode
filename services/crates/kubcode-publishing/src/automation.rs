//! Comment → DM rules (docs/design/ig-comment-dm.md §4.1, §4.8): which rule,
//! if any, answers a comment. Pure; the engine does the sending.

/// How a rule's keywords meet the comment, both normalised first.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MatchMode {
    /// Anywhere in the comment. Thai has no spaces between words, so there is
    /// no word mode.
    Contains,
    /// The whole comment.
    Exact,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Scope {
    AllPosts,
    /// One post, by the platform's post id.
    Post(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule {
    pub id: String,
    pub keywords: Vec<String>,
    pub mode: MatchMode,
    pub scope: Scope,
    pub active: bool,
}

fn zero_width(c: char) -> bool {
    matches!(c, '\u{200B}'..='\u{200D}' | '\u{2060}' | '\u{FEFF}')
}

/// Case-folded, zero-width characters removed, whitespace runs collapsed.
pub fn normalize(text: &str) -> String {
    text.chars()
        .filter(|c| !zero_width(*c))
        .collect::<String>()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn fires(rule: &Rule, comment: &str) -> bool {
    rule.active
        && rule.keywords.iter().any(|k| {
            let k = normalize(k);
            !k.is_empty()
                && match rule.mode {
                    MatchMode::Contains => comment.contains(&k),
                    MatchMode::Exact => comment == k,
                }
        })
}

/// The rule that answers a comment on `post`: a rule for that post first,
/// then an all-posts rule; the first one listed wins within each.
pub fn choose<'a>(rules: &'a [Rule], post: &str, text: &str) -> Option<&'a Rule> {
    let comment = normalize(text);
    let on_post = |r: &&Rule| matches!(&r.scope, Scope::Post(p) if p == post);
    let all = |r: &&Rule| r.scope == Scope::AllPosts;
    rules
        .iter()
        .filter(on_post)
        .find(|r| fires(r, &comment))
        .or_else(|| rules.iter().filter(all).find(|r| fires(r, &comment)))
}
