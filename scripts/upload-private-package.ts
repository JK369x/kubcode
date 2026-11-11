/**
 * Owner-only: build a members-only package zip from its PRIVATE source and
 * (with --upload) put it in the media bucket. The files never enter this
 * public repo; lib/packages.ts PRIVATE_PACKAGES pins the zip's sha256 and size.
 *
 *   npx tsx scripts/upload-private-package.ts <slug> <private-source-dir>            # dry run (default)
 *   npx tsx scripts/upload-private-package.ts <slug> <private-source-dir> --upload   # put + verify
 *
 * Order: (1) dry run, check the printed sha256/bytes/KB; (2) --upload: puts
 * the object with the owner's own AWS profile (AWS_PROFILE; the aws CLI reads
 * the credentials, this script never prints them) and verifies it with
 * head-object (size, sha256 metadata, SSE-S3); (3) pin the printed values in
 * lib/packages.ts and merge. Until the pin is merged the package is not
 * downloadable (approvedPackageFor returns null, so the route answers 404).
 * A version is immutable: once pinned, --upload refuses a zip that differs.
 * Needs s3:PutObject + s3:GetObject on packages/<slug>/* only. The signer
 * Lambda already reads packages/*; no infra change.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NAMES } from "../infra/src/constants";
import { PRIVATE_PACKAGES } from "../lib/packages";
import {
  assertOutsideRepo,
  buildZip,
  headObjectArgs,
  packageEntries,
  putObjectArgs,
  sha256,
  unpackedKb,
  verifyHead,
} from "../lib/private-package";

const REPO = path.join(__dirname, "..");

function main(argv: string[]): number {
  const [slug, source, ...flags] = argv;
  const upload = flags.includes("--upload");
  if (!slug || !source || flags.some((f) => f !== "--upload")) {
    console.error("usage: upload-private-package.ts <slug> <private-source-dir> [--upload]");
    return 2;
  }
  const pkg = PRIVATE_PACKAGES.find((p) => p.slug === slug);
  if (!pkg || pkg.kind !== "private" || !pkg.zip) {
    console.error(`${slug} is not in PRIVATE_PACKAGES (lib/packages.ts)`);
    return 2;
  }
  if (!fs.statSync(source, { throwIfNoEntry: false })?.isDirectory()) {
    console.error(`not a folder: ${source}`);
    return 2;
  }
  assertOutsideRepo(source, REPO);

  const entries = packageEntries(source, slug);
  const zip = buildZip(entries);
  const digest = sha256(zip);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kubcode-pkg-"));
  const file = path.join(tmp, pkg.filename);
  fs.writeFileSync(file, zip);
  console.log(`${pkg.key}: ${entries.length} files, ${zip.length} bytes, sha256 ${digest}, unpacked ${unpackedKb(entries)} KB`);
  console.log(`zip: ${file}`);

  const matches = pkg.zip.sha256 === digest && pkg.zip.bytes === zip.length && pkg.maxKb === unpackedKb(entries);
  if (!matches) {
    console.log(`lib/packages.ts needs: zip: { sha256: "${digest}", bytes: ${zip.length} }, maxKb: ${unpackedKb(entries)}`);
  }
  if (!upload) {
    console.log("dry run: nothing uploaded (add --upload to put the object)");
    return 0;
  }
  if (pkg.zip.sha256 && !matches) {
    console.error(`refusing to upload: ${pkg.version} is already pinned to another zip; bump the version instead`);
    return 1;
  }
  const bucket = NAMES.mediaBucket;
  execFileSync("aws", putObjectArgs(bucket, pkg, file, digest), { stdio: ["ignore", "ignore", "inherit"] });
  const head = JSON.parse(execFileSync("aws", headObjectArgs(bucket, pkg), { encoding: "utf8" }));
  const problems = verifyHead(head, zip.length, digest);
  if (problems.length) {
    console.error(`uploaded object does not verify: ${problems.join("; ")}`);
    return 1;
  }
  console.log(`uploaded and verified s3://${bucket}/${pkg.key}`);
  if (!matches) console.log("next: pin the values above in lib/packages.ts and merge; then it is downloadable");
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
}
