// Building and checking members-only package zips (scripts/upload-private-package.ts).
// Pure helpers: deterministic zip bytes from a file list, refusal rules for the
// source folder, and the S3 command line. Nothing here reads credentials.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
import type { SkillPackage } from "./packages";

export const MEMBERS_LICENCE_FILE = "LICENSE-kubcode-members.txt";

export const MEMBERS_LICENCE = `kubcode members licence — Deep Sea Docs
Copyright (c) 2026 kubcode.dev. All rights reserved.

ENGLISH
1. This kit is licensed only to the signed-in kubcode.dev member who downloaded it.
2. You may use it to make your own videos and publish those videos anywhere, including commercially.
3. You may change the kit for your own use.
4. You may not share, upload, resell, sublicense or otherwise redistribute the kit or any part of it
   (code, templates, drawings, documentation), changed or unchanged, to anyone else.
5. The kit is provided "as is", without warranty of any kind. kubcode.dev is not liable for any claim
   or damage arising from its use.
6. This licence ends if you break it; you must then delete your copies.

ภาษาไทย
1. ชุดนี้อนุญาตให้ใช้เฉพาะสมาชิก kubcode.dev ที่เข้าสู่ระบบและดาวน์โหลดเองเท่านั้น
2. ใช้ทำวิดีโอของคุณเองและเผยแพร่วิดีโอนั้นได้ทุกที่ รวมถึงเชิงพาณิชย์
3. แก้ไขชุดนี้เพื่อใช้เองได้
4. ห้ามแชร์ อัปโหลด ขายต่อ ให้สิทธิ์ช่วง หรือแจกจ่ายชุดนี้หรือส่วนใดของชุด (โค้ด เทมเพลต ภาพวาด เอกสาร)
   ไม่ว่าจะแก้ไขแล้วหรือไม่ ให้ผู้อื่น
5. ให้ใช้ตามสภาพ ไม่มีการรับประกันใด ๆ kubcode.dev ไม่รับผิดต่อความเสียหายจากการใช้งาน
6. สิทธิ์นี้สิ้นสุดเมื่อคุณละเมิดเงื่อนไข และต้องลบสำเนาทั้งหมด
`;

/** Files never packed, even if present in the private source. */
const EXCLUDE = /(^|\/)(\.git|node_modules|\.venv|outputs|dist|\.hyperframes|\.private|\.local|__pycache__)(\/|$)|(^|\/)(\.DS_Store|\.env(\..*)?|token\.json|client_secret[^/]*\.json)$|\.(mp4|mov|webm|wav|mp3|m4a|zip)$/i;

export type ZipEntry = { name: string; data: Buffer };

/** Refuse a source folder inside the public repo: proprietary files must never live there. */
export function assertOutsideRepo(sourceDir: string, repoRoot: string): void {
  const src = fs.realpathSync(sourceDir);
  const repo = fs.realpathSync(repoRoot);
  const rel = path.relative(repo, src);
  if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) {
    throw new Error(`refusing: ${sourceDir} is inside the public kubcode repo; use the private source checkout`);
  }
}

/** Sorted file list relative to dir, skipping excluded paths and symlinks. */
export function collectFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (EXCLUDE.test(r) || e.isSymbolicLink()) continue;
      if (e.isDirectory()) walk(r);
      else if (e.isFile()) out.push(r);
    }
  };
  walk("");
  return out.sort();
}

/** Entries for the zip: every file under `<slug>/`, plus the members licence. */
export function packageEntries(sourceDir: string, slug: string): ZipEntry[] {
  const files = collectFiles(sourceDir).filter((f) => f !== MEMBERS_LICENCE_FILE);
  const entries = files.map((f) => ({ name: `${slug}/${f}`, data: fs.readFileSync(path.join(sourceDir, f)) }));
  entries.push({ name: `${slug}/${MEMBERS_LICENCE_FILE}`, data: Buffer.from(MEMBERS_LICENCE, "utf8") });
  return entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

// Fixed timestamp (1980-01-01 00:00) so the same files always give the same bytes.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

/** A deterministic ZIP (deflate, UTF-8 names, fixed times). */
export function buildZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const packed = deflateRawSync(e.data, { level: 9 });
    const crc = crc32(e.data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, packed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4); // made by: Unix, 2.0
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38); // regular file, rw-r--r--
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + packed.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

export const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/** Unpacked size in KB, rounded up: the skill page's "ไม่เกิน … KB". */
export const unpackedKb = (entries: ZipEntry[]) => Math.ceil(entries.reduce((s, e) => s + e.data.length, 0) / 1024);

/** Arguments for `aws s3api put-object` (SSE-S3 so the signer, which has no KMS access, can read it). */
export function putObjectArgs(bucket: string, pkg: SkillPackage, file: string, digest: string): string[] {
  return [
    "s3api", "put-object",
    "--bucket", bucket,
    "--key", pkg.key,
    "--body", file,
    "--content-type", "application/zip",
    "--server-side-encryption", "AES256",
    "--metadata", `sha256=${digest}`,
    "--tagging", `kind=skill-package&package=${pkg.slug}&version=${pkg.version}`,
  ];
}

export function headObjectArgs(bucket: string, pkg: SkillPackage): string[] {
  return ["s3api", "head-object", "--bucket", bucket, "--key", pkg.key, "--output", "json"];
}

/** Checks a head-object reply against the expected size and sha256 metadata. */
export function verifyHead(head: { ContentLength?: number; Metadata?: Record<string, string>; ServerSideEncryption?: string }, bytes: number, digest: string): string[] {
  const problems: string[] = [];
  if (head.ContentLength !== bytes) problems.push(`size ${head.ContentLength} != ${bytes}`);
  if (head.Metadata?.sha256 !== digest) problems.push(`sha256 metadata ${head.Metadata?.sha256 ?? "missing"} != ${digest}`);
  if (head.ServerSideEncryption !== "AES256") problems.push(`encryption ${head.ServerSideEncryption ?? "none"} != AES256`);
  return problems;
}
