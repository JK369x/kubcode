import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CommentText } from "../components/CommentText";

const html = (text: string) => renderToStaticMarkup(createElement(CommentText, { text }));

test("comment links render as user-generated, nofollow, noopener links", () => {
  assert.equal(
    html("ดู https://example.com/a?b=1 นะ"),
    'ดู <a href="https://example.com/a?b=1" rel="ugc nofollow noopener" target="_blank">https://example.com/a?b=1</a> นะ',
  );
  assert.match(html("www.example.com"), /<a href="https:\/\/www.example.com" rel="ugc nofollow noopener"/);
});

test("comment text is escaped, keeps line breaks and never links other schemes", () => {
  assert.equal(html("<b>x</b>\nบรรทัดสอง"), "&lt;b&gt;x&lt;/b&gt;<br/>บรรทัดสอง");
  assert.doesNotMatch(html("javascript:alert(1)"), /<a/);
});
