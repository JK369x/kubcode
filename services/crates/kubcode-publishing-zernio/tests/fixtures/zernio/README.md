# Zernio fixtures

Verbatim examples from docs.zernio.com (read 2026-11-09); the source page is in each
file's `_source` key, which the parser ignores. They stand in for recorded responses
until the owner's Zernio account exists. Then re-record from real calls with
`KUBCODE_ZERNIO_LIVE=1`, scrub (stable fake ids, no usernames, tokens or signed URLs)
and replace these files. Bodies with no docs example are built from the documented
field lists and say so in `_source`.
