import { test } from "node:test";
import assert from "node:assert/strict";
import { downloadEligibility } from "../lib/access";
test("downloads fail closed across membership, rights and backend states", () => {
  const eligible = {
    backendConfigured: true,
    session: true,
    member: "approved",
    rights: "cleared",
    storageConfigured: true,
  };
  assert.equal(downloadEligibility(eligible).allowed, true);
  for (const change of [
    { session: false },
    { member: "pending" },
    { member: "suspended" },
    { member: "nonmember" },
    { rights: "uncleared" },
    { backendConfigured: false },
    { storageConfigured: false },
  ])
    assert.equal(
      downloadEligibility({ ...eligible, ...change }).allowed,
      false,
      JSON.stringify(change),
    );
  assert.equal(
    downloadEligibility({ ...eligible, backendConfigured: false }).code,
    "BACKEND_NOT_CONFIGURED",
  );
});
