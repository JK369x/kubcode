import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { validReviewCode } from "../lib/keys/reviewer";
test("access requires the exact review invitation and expires", () => {
 const code = "a".repeat(32);
 const hash = createHash("sha256").update(code).digest("hex");
 assert.equal(validReviewCode(code,hash,1),true);
 assert.equal(validReviewCode("b".repeat(32),hash,1),false);
 assert.equal(validReviewCode(undefined,hash,1),false);
 assert.equal(validReviewCode(code,hash,Date.UTC(2027,3,1)),false);
});
