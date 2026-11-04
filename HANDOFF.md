# kubcode — handoff / งานคงเหลือ

อัปเดต: 2026-11-04 (+07) · สำหรับเจ้าของโปรเจกต์และ agent ที่รับช่วงต่อ

Fresh readback ล่าสุด (UTC): `2026-11-03T17:48:02Z` (read-only aggregate + Vercel alias) · readback รอบ handoff เดิม: `.qa/handoff-readback-2026-11-03.json`

> **สถานะ: ระบบบัญชีกลาง + knowledge base/interactions (migration 0002) deploy แล้ว และทุก deploy/migration ทำผ่าน GitHub Actions (§7a) ห้าม deploy หรือ `--apply` เองจากเครื่อง**
> งานที่ยังไม่ปิด: (1) P0 owner acceptance ของการ **เชื่อม LINE เข้าบัญชี Google** ด้วยลำดับที่ถูกต้อง (2) เปิดดาว/คอมเมนต์ตาม "เปิด interactions" ใน §3 ทั้งสองข้อไม่ใช่งานเขียนระบบใหม่
> ไฟล์นี้มี operational metadata แต่ไม่มี secret; ตรวจความเหมาะสมก่อนนำไปเผยแพร่ใน public repository

## 1. สรุปสั้น / เริ่มอ่านตรงนี้

- เว็บ: `https://kubcode.dev` · เข้าสู่ระบบ: `https://kubcode.dev/account` · ตั้งค่าวิธีเข้าสู่ระบบ: `/account/settings`
- Google + LINE ใช้ NextAuth; ฐานข้อมูลสมาชิกตัวตนใช้ **Supabase PostgreSQL ส่วนตัว ไม่ใช่ Supabase Auth**
- มี internal user ID และเชื่อมสอง provider เข้าบัญชีเดียวกันได้โดยยืนยันทั้งสองฝั่ง ไม่มี auto-merge ด้วยอีเมล
- Production ปัจจุบัน: `dpl_45Q9ppKmdfVKM7yRyLXRH1kW7h1k` — deploy โดย `production.yml` run 41686923669 จาก `main` `1a0bfaf` (PR #2 knowledge base) อ่าน alias `kubcode.dev` กลับจาก Vercel API แล้ว READY target production; promote ผ่าน API และ live smoke `promoted_and_healthy`
- Rollback target ล่าสุด: `dpl_5rBLWzRxMoPNrcs2BWu743fVPuGh` (CI build แรก, `af71916`, ก่อน knowledge base) · ก่อนนั้น `dpl_2M8P5FcZv2ymhY1RUccvj9mzWMzN` (deploy ด้วยมือครั้งสุดท้าย) · rollback code ไม่ย้อน schema 0002 (additive) การระบุIDไม่ใช่อนุมัติให้rollback
- Fresh read-only DB aggregate (2026-11-03T17:48:02Z): **users 1, Google 1, LINE 0, users ที่มีทั้งสองวิธี 0, owners 0**, link intents 0, audit 3 (`user_created` ×2, `operator_duplicate_user_deleted` ×1), ledger `0001_accounts`, `0002_interactions` ไม่ได้อ่านหรือบันทึก email/subject/profile ของผู้ใช้
- ตัวเลขนี้ **ไม่ใช่ owner sign-off ของ LINE linking**: ยังไม่มีผู้ใช้ที่มีทั้งสองวิธีและยังไม่มี link intent เลย (ดู P0)
- Downloads, อนุมัติสมาชิก, admin, credits, generation และ MCP authorization **ยังไม่เปิด**
- ห้ามอ่านสถานะ local-only/รอ login ในบันทึกเก่าแล้วเริ่ม provision ใหม่ ให้ใช้ current receipts ด้านล่าง

## 2. สิ่งที่ทำแล้วและ deploy แล้ว

### Identity / account linking

- Google: `openid email profile`, ต้องมี verified email; LINE: `openid profile`, **ไม่ขอ email**
- ตัวตนแยกด้วย provider + subject ผูก internal UUID; email เป็น metadata ไม่ใช่กุญแจรวมบัญชี
- `/account/settings` แสดงวิธีที่เชื่อมแล้วและเริ่ม link/unlink ได้
- Link: เริ่ม intent → fresh proof ของบัญชีเดิม → fresh proof ของ provider เป้าหมาย → ผู้ใช้กดยืนยันสุดท้าย
- Target callback ไม่สร้างสมาชิกใหม่หรือสลับออกจาก source session ระหว่างเชื่อม
- Identity ที่ถูกผูกกับ user อื่นแล้วจะ conflict ไม่โอนหรือ merge เงียบ ๆ
- Unlink ต้องยืนยันตัวตนใหม่และห้ามลบวิธีเข้าสู่ระบบที่ใช้งานได้วิธีสุดท้าย
- Link/unlink เพิ่ม session version และเพิกถอน session ก่อนหน้า; session reads ตรวจ owner/status/version กับ DB
- Legacy stateless cookies ต้อง login ใหม่หลัง rollout; ไม่ยกระดับ cookie เก่าเป็น central account อัตโนมัติ

### Security / storage

- Private schema `kubcode_accounts`: `users`, `user_identities`, `account_link_intents`, `account_audit_events`, `schema_migrations`
- RLS เปิด; PUBLIC/anon/authenticated ไม่มีสิทธิ์อ่านตารางบัญชี
- Runtime role `kubcode_app`: ไม่ใช่ superuser, ไม่มี CREATEDB/CREATEROLE/BYPASSRLS; มี grants/server-role policies เท่าที่ runtime ต้องใช้
- Migration `0001_accounts` ถูก apply จริงและอ่าน ledger กลับแล้ว; ไม่ migrate ระหว่าง request หรือ deploy
- Hosted pooler ใช้ TLS ที่ตรวจ certificate และ hostname จริง; เปิด server-side SSL enforcement แล้ว
- ใช้ provider public CA จาก official Supabase CLI templates ปี2021+2025 ไม่ได้ปิด certificate verification
- Link-intent cookie: Secure/HttpOnly/host-only/Lax เพื่อรับ cross-site callback; mutation CSRF cookie แยกเป็น Strict
- SDK state/nonce/PKCE cookies ของ link mode แยกจาก normal sign-in ป้องกันการลบ intent cookie แล้ว downgrade callback
- Intent token เก็บแค่ hash, ผูก user/session/source/target/version, มีอายุ10นาที และ single-use
- OAuth checks, issuer/audience/signature, CSRF และ canonical redirect ยังอยู่ครบ; `/api/auth/_log` ปิด404
- Privacy page ปรับตาม persistence จริง และ legacy `POST /api/account` ยัง503 โดยไม่อ้างผิดว่ายังไม่มี DB

### Knowledge base / interactions (PR #2, migration 0002)

- บทความ/หน้า tool ใหม่ live บน kubcode.dev แล้ว
- `0002_interactions` (additive: ดาว, คอมเมนต์, report, `users.is_owner`, public comment name) **apply โดย CI** run 41686923669 (`PLAN pending=0002_interactions` → `OK applied=0002_interactions`); grants + RLS policy ของ `kubcode_app` สำหรับตารางใหม่อยู่ในไฟล์ 0002 เอง
- ดาว/คอมเมนต์ **ยังปิด** จนกว่า `KUBCODE_INTERACTIONS_ENABLED` จะเป็น `"true"` ตรงตัว (ตอนนี้ยังไม่มี key นี้ใน Vercel production env) ระหว่างปิด API ตอบ 503 และไม่ query ตารางใหม่

## 3. งานคงเหลือ — เรียงลำดับ

### P0 — ปิด acceptance ของงาน auth รอบนี้ (กำลังรอเจ้าของ)

> **2026-11-03 สถานะยังไม่ผ่าน:** เจ้าของแจ้งว่าทดสอบ P0 ผ่านแล้ว แต่ read-only aggregate เวลา 14:59:47Z (production `dpl_2M8P5FcZv2ymhY1RUccvj9mzWMzN`, project `sgtyrndczwxijrubyyjw`) ยังเป็น users 1, Google 1, **LINE 0, users ที่มีทั้งสองวิธี 0**, audit 1 (`user_created`) และ **link intents 0 แถว** ตรงกับ baseline ทุกค่า แปลว่ายังไม่มี link flow ไปถึง production DB จึงยังไม่ติ๊ก ต้องถามเจ้าของว่าทดสอบที่ origin ไหนและหน้า settings แสดงอะไร หลักฐานอยู่ที่ `.qa/p0-owner-acceptance-check-2026-11-03.json`
>
> **Re-check 15:07:06Z หลังเจ้าของแจ้งว่าเชื่อม LINE แล้ว ยังไม่ผ่านเพราะเกิดบัญชีซ้ำ:** ผลคือ users **2**, Google 1, LINE 1, **users ที่มีทั้งสองวิธี 0**, audit 2 (`user_created` ×2) และ link intents 0 แถว แปลว่าเข้าด้วย LINE แยกต่างหากจนได้ internal user ใหม่ ไม่ได้กด “เชื่อม LINE” จากบัญชี Google ตรงกับคำเตือน **สำคัญ** ด้านล่าง ถ้าตอนนี้เชื่อม LINE เข้าบัญชี Google จะ conflict ตามที่ออกแบบไว้ **ห้ามย้าย identity หรือลบ user เอง** ต้องให้เจ้าของเลือกวิธี recovery/merge แบบมี audit เป็นงานแยก (P1 ข้อสุดท้าย) หลักฐานอยู่ที่ `.qa/p0-owner-acceptance-recheck-2026-11-03T1507Z.json`
>
> **ลบบัญชี LINE ที่ซ้ำแล้ว (เจ้าของรันเอง 16:25:30Z):** `.qa/ops/delete-duplicate-line-user.sh --apply` (transaction เดียว, guards ครบ, audit `operator_duplicate_user_deleted`) verdict `APPLIED_VERIFIED` receipt `.qa/duplicate-line-user-deletion-apply-20261103T162530Z.json` (snapshot ก่อนลบเก็บแยกที่ `.qa/duplicate-line-user-snapshot-2026-11-03.PRIVATE.json` ห้าม commit) ตอนนี้เหลือ users 1 / Google 1 / LINE 0 **P0 ยังรอเจ้าของทดสอบใหม่ตามลำดับด้านล่าง** (login Google → ตั้งค่าการเข้าสู่ระบบ → เชื่อม LINE) ผ่านเมื่อ aggregate แสดงผู้ใช้ที่มีทั้งสองวิธี = 1 และมี audit `identity_linked`

ไม่ต้องเขียน auth ใหม่ก่อนทดสอบสิ่งนี้:

- [ ] เปิด `/account` เข้าด้วย Google และดูสถานะบัญชีจริง
- [ ] ไป **ตั้งค่าการเข้าสู่ระบบ** แล้วกด **เชื่อม LINE**
- [ ] ยืนยัน Google เดิม → ยืนยัน LINE → ตรวจชื่อบัญชีและกดยืนยันสุดท้าย
- [ ] หลังระบบออกจากระบบ ให้ login ด้วย LINE และตรวจว่าเห็นทั้ง Google/LINE ในบัญชีเดียวกัน
- [ ] Logout แล้ว login ด้วย Google อีกครั้ง ตรวจว่ายังคงเป็นบัญชีเดียวกัน
- [ ] ทดสอบ cancel กลาง flow ว่าไม่มีการเชื่อมเกิดขึ้น
- [ ] ถ้าจะทดสอบ unlink: เหลือวิธีใช้งานได้อย่างน้อยหนึ่งวิธี ทดสอบ re-proof/confirm แล้วเข้าใหม่ด้วยวิธีที่เหลือ; เชื่อมกลับเมื่อจบ
- [ ] ยืนยันว่า member approval/download/admin/credits/MCP ไม่ถูกเปิดให้จากการ login/link
- [ ] บันทึก owner result + read-only aggregate/audit ที่ไม่เปิดเผย PII ลง receipt และ Obsidian แล้วปิด checklist

**สำคัญ:** อย่าออกจากระบบแล้ว login อีก provider แยกก่อนกดเชื่อม เพราะอาจสร้างอีก internal user หนึ่ง เมื่อ identity อยู่คนละ user ระบบตั้งใจจะ conflict ห้ามแก้ด้วยการย้าย identity/delete user โดยพลการ ให้ตรวจเจ้าของทั้งสองฝั่งและออกแบบ recovery/merge แบบมี audit เป็นงานแยก

เมื่อมี error: ขอเฉพาะข้อความ error/ภาพที่ไม่เปิดเผยข้อมูล ไม่ขอ OAuth code, callback URL ที่มี code/state, token, cookie, client secret หรือ DB URL ในแชต

### เปิด interactions (ดาว/คอมเมนต์) — รอเจ้าของ ทำตามลำดับ

ทำหลัง P0 หรือคู่กันก็ได้ (owner flag ผูกกับ internal user ไม่ใช่ provider) แต่ให้ข้อ 1 เสร็จก่อนข้อ 2 เพื่อให้ซ่อนคอมเมนต์ได้ตั้งแต่นาทีแรก

1. **ตั้ง owner flag** (`users.is_owner = true` ให้ user ที่ผูก Google เพียงคนเดียว) ด้วย script ที่เจ้าของรันเอง: `.qa/ops/set-owner-flag.sh` (git-ignored; `--agent no`, isolated Supabase profile, ตรวจ linked ref/org, transaction เดียวที่ตรวจซ้ำทุก guard: 0002 applied, target `d1ce43fa-…` active, มี Google identity เดียวและเป็นของ target, ยังไม่มี owner; ไม่แตะ session_version; audit `operator_owner_granted`)
   ```sh
   .qa/ops/set-owner-flag.sh --dry-run   # ต้องได้ DRY_RUN_OK owners=1 (rolled back) + verdict DRY_RUN_OK_ROLLED_BACK
   .qa/ops/set-owner-flag.sh --apply     # ต้องได้ COMMITTED, AFTER owners 1, verdict APPLIED_VERIFIED
   ```
   ถ้า dry-run ไม่ได้ `DRY_RUN_OK_ROLLED_BACK` ห้าม apply; receipt ไปที่ `.qa/owner-flag-<mode>-<UTC>.json`; `is_owner` อ่านจาก DB ทุก request จึงไม่ต้อง login ใหม่
2. **เปิด flag แล้ว redeploy**: เพิ่ม `KUBCODE_INTERACTIONS_ENABLED=true` ใน Vercel **production** env ของ project `kubcode` (isolated config `/Users/jakkarin69/.config/vercel-kubcode-personal`, scope `jakkarinlmc-3526s-projects`; เป็น flag ไม่ใช่ secret แต่ใช้แบบเดียวกับ `KUBCODE_ACCOUNTS_ENABLED`) แล้ว redeploy ผ่าน pipeline: GitHub → Actions → **Production** → Run workflow บน `main` โดยปล่อย approval ว่าง (env ใหม่มีผลกับ deployment ใหม่เท่านั้น)
   - ตรวจหลัง deploy: ดาว/คอมเมนต์ไม่ตอบ 503 แล้ว, ผู้ใช้ที่ login แล้วให้ดาว/คอมเมนต์ได้, owner ซ่อนคอมเมนต์ได้
   - ปิดฉุกเฉิน: ลบหรือเปลี่ยนค่า flag แล้ว redeploy แบบเดียวกัน (ข้อมูลในตารางยังอยู่)

### P1 — ก่อนเปิดให้คนทั่วไป/เพิ่มสิทธิ์สำคัญ

รายการนี้ยังไม่ใช่งานที่ทำเสร็จ และไม่ได้อนุมัติให้ทำทุกข้ออัตโนมัติ:

- [ ] ตรวจ Google OAuth audience/publishing/domain และ LINE channel Developing/Published, audience, linked-OA consent กับเจ้าของจริง; ห้าม publish audience หรือเพิ่ม scope เงียบ ๆ
- [ ] ตรวจ branding/consent ของ LINE ตาม provider; ปุ่ม text-only สีเขียวไม่ใช่ใบรับรอง compliance
- [ ] เก็บ source/tests/docs เข้าระบบ version control อย่างปลอดภัย ปัจจุบัน `main` มี last commit `895af8b` และไฟล์แอปส่วนใหญ่ยัง untracked; **ห้าม `git add .`, `git clean`, `git reset --hard` หรือ push ก่อนตรวจ private assets/credentials/remote owner** — 2026-11-03: commit source/tests/scripts/docs ลง local branch `chore/track-source` แล้ว (สแกน secret ก่อน stage, `.qa/`/previews/ZIP/dotenv ถูก ignore) ยังไม่ merge เข้า `main` และยังไม่มี remote
- [x] ยืนยัน personal remote/ขอบเขตการ push กับเจ้าของ: private `https://github.com/JK369x/kubcode` (2026-11-03) push `main` แล้วและ GitHub CI ผ่าน; deploy/migrate อัตโนมัติดู §7a
- [ ] เพิ่ม absolute session lifetime และ per-session revocation สำหรับ copied cookie/normal logout ก่อน protected/high-value features
- [ ] กำหนด rate limits, abuse/resource controls และทดสอบโหลดจริง; source review รอบนี้ไม่ได้ตรวจ deployment-level rate limiting หรือ benchmark capacity
- [ ] เพิ่ม cleanup/retention ของ expired/closed intents แบบ bounded; TTL10นาทีไม่เท่ากับลบข้อมูลทุกแถวภายใน10นาที ปัจจุบันไม่มี global cleanup job
- [ ] เพิ่มช่องทางขอลบข้อมูลจริง/ขั้นตอน owner operation และพิจารณา deletion UI; ตอนนี้ไม่มี automatic deletion backend หรือ contact address ใหม่ที่ยืนยันแล้ว
- [ ] วางแผน backup/restore และทดสอบ restore ตาม Free plan จริง ไม่ถือว่า source ZIP เป็น DB backup หรือสมมติว่ามี paid backup/SLA
- [ ] ถ้ามี duplicate accounts อยู่แล้ว วาง explicit audited recovery/merge แยกจาก linking ปกติ

### P2 — Product backlog / ต้องตัดสินใจและอนุมัติ scope ก่อน

- Member approval + roles/entitlements + audit โดยผูก internal user ID ไม่ใช่ email/provider
- Private ZIP/download authorization ทุก request, private storage/signed URLs และ files ที่ผ่านสิทธิ์เผยแพร่แล้ว
- Public work previews: approved media allowlist ยังว่าง ไม่ใช่ bug ที่สื่อเดิมไม่ขึ้นเว็บ
- Video generation / MCP backend: ยังไม่มี service, queue, workers, quotas หรือ billing controls
- แยก MCP orchestration ออกจาก render/inference; ไม่เหมาว่าทุก style ต้อง GPU และไม่ถือว่าค่า CPU render เทียบคุณภาพ AI generation โดยตรง
- ตัดสินใจ API-key ownership: BYOK หรือ shared admin key สำหรับ ElevenLabs/Google AI Studio ยังไม่เลือก
- Quotas, per-user credits, idempotency, retry/attempt limits, sandbox generated code, storage/egress และต้นทุนต้องออกแบบก่อนเปิด generation
- Go/Cloud Run เป็นทิศทางอนาคต ไม่ใช่ service ที่สร้างแล้ว; ไม่เปิด billing, GPU, Lightsail หรือ paid generations เอง

## 4. Known limitations ที่ต้องเล่าตามจริง

- Session24h **rolling** ไม่มี absolute cap
- Link/unlink และ operator version bump เพิกถอนรุ่นเก่าได้ แต่ normal logout แค่ลบ cookie ใน browser นี้และยกเลิก intents ของมัน; copied same-session cookie ยัง revoke รายตัวไม่ได้
- Source review ไม่พบ confirmed HIGH/MEDIUM ในขอบเขตที่อ่าน **ไม่ใช่ production/security/compliance certificate** และทำก่อน parent runtime fixes บางส่วนซึ่งภายหลังพิสูจน์ RED/GREEN แล้ว
- Real Google/LINE consent/token exchange/link/logout ยังไม่ได้ owner acceptance แม้ production OAuth initialization จะผ่าน
- LINE SSO อาจกลับมาโดยไม่ถามรหัสผ่านใหม่; fresh verified OAuth proof ไม่ได้แปลว่าบังคับ password/MFA ทุกครั้ง
- Free hosting/database ไม่ใช่ uptime/capacity guarantee ให้ตรวจ current limits ก่อนเพิ่ม traffic/ธุรกิจ ไม่เพิ่มแผนเสียเงินเอง

## 5. Accounts / infrastructure scope — metadata เท่านั้น

| รายการ | ค่าที่ใช้อยู่ |
|---|---|
| Workspace | `/Users/jakkarin69/Projects/personal/skill-library-web` |
| Stack | Next16.4.3 / React19.2 / next-auth4.24.15 / pg8.23.1 / TypeScript |
| Production Node | 22.x |
| Vercel scope | `jakkarinlmc-3526s-projects` — personal Hobby ณ release verification |
| Vercel team ID | `team_lBf8fFFeyFBzOYyKFMA7KadA` |
| Vercel project ID | `prj_xgaKmMr2dvFXaw7GE0X6qmFd2fBA` / `kubcode` |
| Isolated Vercel config | `/Users/jakkarin69/.config/vercel-kubcode-personal` — ห้ามอ่าน/พิมพ์ค่า auth |
| Supabase org | `cafxsuiwpiceggfkzsjx` / `JK369x's Org` — Free ณ release verification |
| Supabase project ref | `sgtyrndczwxijrubyyjw` / `kubcode` |
| DB / functions region | us-east-1 / Vercel iad1 |
| Isolated Supabase profile | `/Users/jakkarin69/.config/supabase-kubcode-personal/profile.json` |
| Supabase state home | `/Users/jakkarin69/.config/supabase-kubcode-personal/state` |
| Runtime DB role | `kubcode_app` |
| Google callback | `https://kubcode.dev/api/auth/callback/google` |
| LINE callback | `https://kubcode.dev/api/auth/callback/line` |
| LINE channel ID supplied by owner | `2012344557` — ไม่ใช่ LIFF ID หรือ secret |

Existing unrelated Supabase project `AICLUP` ไม่ใช่เป้าหมายงานนี้ ห้าม query/migrate/reset มัน บริษัท Cloudcommerce และ default CLI contexts ไม่ใช่โครงสร้างสำหรับ kubcode; สิทธิ์ใช้ company Drive ของงาน animation ไม่ครอบคลุมโปรเจกต์นี้

Production server env names (ค่าไม่อยู่ในไฟล์นี้):
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `LINE_CLIENT_ID`, `LINE_CLIENT_SECRET`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `DATABASE_URL`, `KUBCODE_DB_CA_CERT`, `KUBCODE_ACCOUNTS_ENABLED=true`; `NEXT_PUBLIC_MEDIA_MODE=licensed-only` (production+preview).
ยังไม่ตั้ง: `KUBCODE_INTERACTIONS_ENABLED` (ดู "เปิด interactions" ใน §3).

สามตัวใหม่ของ central accounts เป็น Sensitive Production variables อ่านกลับเฉพาะ key/type/target แล้ว ไม่ export ค่า ไม่ pull dotenv ไม่ใส่ secret ลง argv/history/file/แชต ไม่แก้ shared Google/LINE settings โดยไม่จำเป็น

## 6. Evidence / สิ่งที่ทดสอบแล้ว

ตัวเลขคือผลการรันที่เก็บไว้ ไม่ได้รัน suite ทั้งหมดซ้ำเพื่อสร้าง handoff นี้:

| ขอบเขต | หลักฐานที่ผ่าน |
|---|---|
| Unit / local media | 218 / 2 |
| Real local PostgreSQL | 19 tests |
| Actual local Next production-mode + PG | 14 checks; provider proof เป็น fictional input ไปยัง callbacks จริง ไม่ใช่ external consent |
| Settings static UI fixtures | 32 states |
| Build / types | Source-only Node22 build + typecheck |
| Canonical public browser | 13routes / 78states / 9interactions / 19private404;0errors/mediarequests |
| Production OAuth init | ปุ่ม Google/LINE จริง ผ่าน callback/scope/code/S256/state/nonce/cookie checks; intercept ก่อน external consent |
| Hosted storage | Migration ledger, TLS/hostname, scoped runtime role, anon/authenticated denial; INSERT/read probe ROLLBACK ไม่ commit fake users |
| Known new DB credential client scan | 3HTML +10JS assets; ไม่พบ credential ที่สร้างใหม่ ไม่มีการเก็บค่าลงรายงาน |

Current authority:
- `.qa/account-linking-live-release-receipt.json`
- `.qa/kubcode-live-release-receipt.json`
- `.qa/account-linking-hosted-readback.json`
- `.qa/account-linking-production-deployment.json`
- `.qa/account-linking-production-env-readiness.json`
- `.qa/account-linking-production-browser/report.json` — เก็บผล release verification เดิม ไม่ได้รันใหม่ใน handoff; ตัวreportไม่ฝังdeploymentID/เวลาrunเอง การเชื่อมโยงมาจากrelease receipt/tool history. ถ้าต้องการstandaloneprovenanceให้rerunและบันทึกID/time/hash ไม่เดา timestampจากmtime
- `.qa/account-linking-production-init-report.json`
- `.qa/account-linking-actual-app-report.json`
- `.qa/account-linking-cross-site-browser.json`
- `.qa/account-linking-live-client-secret-scan.json`

Deployment-source backup:
- `.qa/kubcode-central-accounts-source.zip` —82files ไม่รวม private previews/dotenv/QA/credentials
- SHA256: `3271aaf623a7c2308543f838a7fac258030bc906c167a825110cd99a9735339a`
- `.qa/account-linking-release-build.json` เก็บ per-file hashes
- ZIPนี้เป็น deployment snapshot ไม่ใช่ DB backup และไม่ใช่ full test/docs checkout; ไม่มี tests/docs/scripts ครบเหมือน working tree จึงต้องรักษา source/tests/scripts ที่ยัง untracked โดยเร่งด่วน
- Scratch stage path อาจถูก prune; อย่าพึ่งพา scratch แทน source/archive

Claude ลงมือจริงทั้ง builder, DB hardening และ privacy copy; event/report artifacts อยู่ `.qa/claude-account-linking-*` และ `.qa/account-linking-*-report.md` ไม่ใช่แค่การตั้งค่า route ให้ใช้ Claude

## 7. จุดอ่านโค้ด / คำสั่งรับช่วงต่อ

อ่าน `AGENTS.md` และ relevant bundled Next docs ใน `node_modules/next/dist/docs/` ก่อนแก้โค้ด

- OAuth/JWT: `lib/auth.ts`, `lib/auth-policy.ts`, `app/api/auth/[...nextauth]/route.ts`
- Central accounts: `lib/accounts/{config,db,migrate,store,rules,session,runtime,http,routes,view,notices}.ts`
- DB: `db/migrations/0001_accounts.sql`, `db/runtime-role-grants.sql`, `scripts/accounts-migrate.ts`
- UI: `app/account/settings/page.tsx`, `components/AccountSettings.tsx`, `components/AccountForm.tsx`
- Privacy: `app/privacy/page.tsx`; legacy membership endpointยัง503: `app/api/account/route.ts`
- Tests: `tests/accounts*.ts`, `tests/account-oauth-context.test.ts`, `tests/accounts-db/store.integration.test.ts`

Local baseline (ใช้ Node22; อย่าใช้ env production จริง):
```sh
node --version
npm test
npm run typecheck
npm run test:accounts-browser
```

`npm run test:accounts-db` ต้องใช้ `KUBCODE_TEST_DATABASE_URL` ที่เป็น **loopback +ชื่อDBมีtest** และ Postgres test server ที่สร้างใหม่ก่อน ห้ามส่ง production URL เข้า fixture tests เด็ดขาด

`tests/accounts-actual-app.ts` และ `tests/accounts-oauth-browser.ts` มี actual-server/protocol harness; actual-app ต้องมี local DB descriptor + source-stage manifest ที่ยังใช้งานได้ จัดเตรียมใหม่ก่อน rerun ไม่ถือว่า cache สร้างแล้วเสมอ

- Docker PG fixture ของรอบก่อน **หยุดและลบแล้ว** ตาม `.qa/account-linking-local-test.json`; URLในนั้นเป็นhistoricalfictional ไม่ใช่ service ที่ยังรัน
- `npm run build` ใน working treeอาจชน `.next` ของ private preview ให้ทำ isolated source-only stage ตาม skill
- ใช้ `npm run db:migrate:accounts` แบบdry-runได้ (`-- --plan` = อ่าน ledger อย่างเดียว) แต่ **ห้าม `--apply` บน hosted DB เองจากเครื่อง** ให้ pipeline ใน §7a เป็นคนทำ ไม่มี auto-down migration

Read-only verification:
```sh
vercel api /v13/deployments/kubcode.dev --raw \
  --global-config /Users/jakkarin69/.config/vercel-kubcode-personal \
  --scope jakkarinlmc-3526s-projects

SUPABASE_HOME=/Users/jakkarin69/.config/supabase-kubcode-personal/state \
  supabase orgs list \
  --profile /Users/jakkarin69/.config/supabase-kubcode-personal/profile.json -o json
```
Project API อาจมี env metadata ให้กรองก่อนแสดง ห้ามพิมพ์ credential values หรือ user profile rows

## 7a. CI/CD — GitHub Actions ทำ test → migrate → deploy

Vercel ไม่ได้ต่อ Git integration และ**ห้ามเปิด** (ไม่งั้นจะมี deploy สองทางและลำดับ migrate→deploy หาย) GitHub Actions deploy ด้วย Vercel CLI `54.1.0` แบบ prebuilt

| Workflow | เมื่อไหร่ | ทำอะไร |
|---|---|---|
| `checks.yml` | ถูกเรียกจากอีกสองตัว | `npm ci` → `npm test` → typecheck → build (`NEXT_PUBLIC_MEDIA_MODE=licensed-only`) และ job แยกรัน `test:accounts-db` กับ Postgres17 service container (loopback fixture) |
| `preview.yml` | push ทุก branch ที่ไม่ใช่ `main` | checks → `vercel pull/build/deploy --prebuilt --target=preview` → ตรวจว่า target ไม่ใช่ production → comment URL ใน PR ที่เปิดอยู่ ไม่ migrate ไม่แตะ production |
| `production.yml` | push `main` / `workflow_dispatch` บน main | checks → build production → **plan migration แบบ read-only** → gate → migrate (ถ้ามี pending) → deploy `--prod --skip-domain` → smoke deployment URL → promote ผ่าน REST API แล้วรอจน kubcode.dev ชี้ id ใหม่ → smoke `kubcode.dev` (`if: always()` หลัง deploy สำเร็จ: live = ตัวเก่า → fail ไม่ทำอะไร; live = ตัวใหม่แต่ smoke ไม่ผ่าน → promote ตัวเก่ากลับ; อื่น ๆ → fail ไม่ทำอะไร) |

- ลำดับรับประกันโดย step ใน job เดียว: build พังหรือ migrate พัง = ไม่ deploy; migration ไม่รันถ้า build ยังไม่ผ่าน
- Concurrency `production` ครั้งละหนึ่ง run และไม่ cancel กลางทาง; migration idempotent (checksum ledger + `pg_advisory_xact_lock` + transaction เดียว)
- ก่อน plan มี `--check-url` ตรวจรูปแบบ `MIGRATION_DATABASE_URL` โดยไม่เชื่อมต่อและไม่พิมพ์ค่า: scheme postgres(ql), host `*.pooler.supabase.com` (ถ้าเป็น `db.<ref>.supabase.co` = Direct connection ซึ่งเป็น IPv6-only บน Free plan และ GitHub runner ต่อไม่ได้), port 5432, user `postgres.sgtyrndczwxijrubyyjw`
- ถ้า plan/migrate ล้ม จะพิมพ์แค่ `FAILED phase=<config|dns|connect|tls|auth|query> code=<ENOTFOUND|ECONNREFUSED|SELF_SIGNED_CERT_IN_CHAIN|SQLSTATE_28P01|…>` ไม่มี host/user/ข้อความ error; run แรกหลัง merge PR #1 (41681816529) ล้มที่ plan ด้วย `FAILED` เปล่า ๆ ก่อนมี diagnostics นี้ ไม่มีอะไรถูก migrate/deploy
- Plan (`scripts/accounts-migrate.ts --plan`): `BEGIN READ ONLY` อ่าน `schema_migrations` → pending, checksum mismatch (แก้ไฟล์ที่ apply แล้ว = **หยุดทั้งหมด** ให้ทำ migration ใหม่แทน), versions ใน ledger ที่ checkout ไม่มี (warning)
- **Destructive gate** (`lib/accounts/migration-gate.ts`): สแกนเฉพาะ pending หา `DROP`, `DELETE`, `TRUNCATE`, `RENAME`, `UPDATE`, `ALTER COLUMN … TYPE`, `DISABLE`/`NO FORCE ROW LEVEL SECURITY`, `OR REPLACE`, `SET SCHEMA` (ไม่นับ comment/literal, FK `ON DELETE`, `FOR UPDATE`, trigger events, GRANT/REVOKE) เจอแล้ว push run จะ **fail ก่อน migrate/deploy** และพิมพ์วลีอนุมัติ เช่น `approve 0003_x`
  - อนุมัติ: เจ้าของ (`github.repository_owner`) กด Run workflow → Production บน `main` แล้วกรอก approval ตามวลีนั้นทุกตัวอักษร ไม่ใช่เจ้าของ/วลีไม่ตรง = ไม่รัน
  - GitHub environment required reviewers ใช้ไม่ได้กับ private repo ของบัญชีส่วนตัว (ต้อง Enterprise) จึงใช้ `workflow_dispatch` แทน
  - Additive migration รันอัตโนมัติเมื่อเข้า `main`: `0002_interactions` ถูก apply แบบนี้จริงใน run 41686923669 (2026-11-03) ตารางใหม่ต้องมี grants/RLS policy ของ `kubcode_app` อยู่ในไฟล์ migration เอง (แบบ 0002) เพราะ `db/runtime-role-grants.sql` ไม่ได้ถูกรันโดย pipeline
- DB TLS ใน CI: `db/certs/supabase-prod-ca.pem` (public CA จาก supabase/cli v2.114.0, provenance ใน `db/certs/README.md`) → `KUBCODE_DB_CA_CERT`; ไม่ปิด certificate verification

GitHub settings (repo `JK369x/kubcode`):

| ชื่อ | ชนิด | ใช้ทำอะไร |
|---|---|---|
| `MIGRATION_DATABASE_URL` | secret | Supabase Session pooler URI (user `postgres`, port 5432) ใช้แค่ step plan/migrate |
| `VERCEL_TOKEN` | secret | scope `jakkarinlmc-3526s-projects` สำหรับ pull/build/deploy/promote |
| `VERCEL_ORG_ID` | variable | `team_lBf8fFFeyFBzOYyKFMA7KadA` |
| `VERCEL_PROJECT_ID` | variable | `prj_xgaKmMr2dvFXaw7GE0X6qmFd2fBA` |

Runtime secrets (Google/LINE/NextAuth/`DATABASE_URL` ของ `kubcode_app`/CA/flag) **อยู่ใน Vercel production env ที่เดียว** ไม่ copy มา GitHub; prebuilt build ใน CI ใช้แค่ `NEXT_PUBLIC_MEDIA_MODE` ส่วนค่าอื่นอ่านตอน runtime ซึ่ง smoke ก่อน promote พิสูจน์ (deployment URL ต้องได้ `303 → https://kubcode.dev/account` ซึ่งเกิดเมื่อ auth env มีจริงเท่านั้น)

ข้อสังเกตจากการรันจริง (2026-11-03):
- Vercel Hobby **BLOCK** deployment ถ้า CLI แนบ git metadata ที่ commit author ไม่ใช่สมาชิก team (commit ในเครื่องมี email `@JAKKARINs-MacBook-Air.local`) ทำให้ CLI ค้างที่ "Building…" จน timeout จึง deploy จาก `$RUNNER_TEMP/deploy` (rsync ทั้ง tree ยกเว้น `.git`) ห้ามเปลี่ยนกลับไป deploy จาก checkout ตรง ๆ; preview ที่ BLOCK ค้างอยู่หนึ่งตัวคือ `dpl_8qVuU5EnwEs8rCB4Ky7oUbD59XG4` (ไม่มีผลกับ production)
- Prebuilt output อ้างไฟล์ใน `node_modules` ของ root จึง copy แค่ `.vercel` ไม่พอ
- Deployment Protection ของ project = `preview` เท่านั้น: preview URL redirect ไป Vercel SSO (ส่วนตัว) ส่วน production deployment URL เปิดสาธารณะ smoke ก่อน promote จึงทำงาน ถ้าเปลี่ยนให้คุ้ม production URL ด้วย smoke จะ fail แบบปลอดภัย (domain ไม่ย้าย) ต้องเพิ่ม Protection Bypass for Automation ก่อน

- Run 41684018785 (2026-11-03): ผ่านถึง deploy + smoke ก่อน promote (`dpl_DzZRM2x1d8SVBQGtgjuczbG8g6HT`) แต่ `vercel promote` ใน CI ล้มด้วย "Deployment belongs to a different team" ทั้งที่ทุก deployment อยู่ team `team_lBf8…` เดียวกัน (CLI เลือก scope ผิดเมื่อไม่มี `--scope`) จึงย้ายไปใช้ `POST /v10/projects/{project}/promote/{id}?teamId=` ใน `scripts/ci-vercel-release.ts`; kubcode.dev ไม่ได้เปลี่ยน

Trust boundary (ข้อจำกัดที่ต้องรู้):
- Repo secrets อ่านได้จาก workflow ของ**ทุก branch** และ `VERCEL_TOKEN` มีสิทธิ์ทั้ง account (Vercel ไม่มี token แบบ preview-only) ใครที่ push branch ได้จึงแก้ workflow ให้เอา secret ไปใช้ได้ ตอนนี้มีแค่เจ้าของ `JK369x` ที่ push ได้ **ห้ามเพิ่ม collaborator** หรือ action ภายนอกที่ไม่ pin
- Agent (devpit/Claude/Codex) push branch ด้วย credential ของเจ้าของ โค้ดที่ agent เขียนจึงรันใน CI ข้าง secret ได้ ให้ review ก่อน push ใน branch ที่ไม่ไว้ใจ
- Approval phrase กัน destructive migration**แบบพลั้งเผลอ** ไม่ใช่ขอบเขตสิทธิ์
- Step ที่รันโค้ดโปรเจกต์ (`npm ci --ignore-scripts`, `vercel build`) ไม่ได้รับ token/DB URL แต่ยังอยู่ใน job เดียวกับ step ที่ใช้ secret
- ทางแก้ที่ดีกว่าเมื่อพร้อม: GitHub Pro ขึ้นไป → ย้าย `MIGRATION_DATABASE_URL`/`VERCEL_TOKEN` ไปเป็น environment secrets ของ environment `production` ที่จำกัด deployment branch เป็น `main` (เจ้าของต้องกรอกค่าใหม่เอง) หรือใช้ DB role แยกสิทธิ์เฉพาะ migration; rotate `VERCEL_TOKEN` เมื่อสงสัยว่ารั่ว

Rollback:
- Code: `vercel promote <deployment ก่อนหน้า> --scope jakkarinlmc-3526s-projects` (ID อยู่ใน run summary "Previous production deployment"; **ต้องมี `--scope`** ไม่งั้น CLI ขึ้น "Deployment belongs to a different team") หรือ revert commit แล้ว merge ให้ pipeline deploy ใหม่
- Schema: **forward-fix** ด้วย migration ใหม่เท่านั้น ห้ามแก้ไฟล์ที่ apply แล้ว ห้าม down/drop เอง; rollback code ไม่ย้อน schema

## 7b. AWS infra — Scheduler slice 1 (Pulumi, `infra/`)

รายละเอียดทั้งหมดอยู่ใน `infra/README.md` ส่วนนี้เป็นสรุปสำหรับคนรับช่วง

- Account ส่วนตัว `955758449820` (profile `default`), region `ap-southeast-1`, stack `prod`, Pulumi TypeScript
- **account นี้มี resource ของลูกค้า (supersix/ttopup, kollab)** ให้แตะเฉพาะชื่อ `kubcode-*` เท่านั้น ส่วน `kubcode-igtest-*` อยู่นอก scope (boundary มี Deny ไว้)
- GitHub OIDC provider `token.actions.githubusercontent.com` ใช้ร่วมกับ repo อื่น stack แค่ lookup ห้าม import/แก้/แทนที่
- State: S3 `kubcode-pulumi-state-955758449820` + KMS `alias/kubcode-pulumi` สร้างด้วย `infra/scripts/bootstrap.sh` และ backend ถูก pin ใน `infra/Pulumi.yaml` **ห้าม `pulumi login`/`logout`** เพราะเครื่องนี้ login `https://api.pulumi.com` ไว้ใช้กับงานอื่น
- Stack สร้างแล้ว (local `pulumi up` 2026-11-04 ซึ่งเจ้าของอนุมัติ: 17 creates, จากนั้น update in-place ของ key policy 1 ครั้ง และแก้ trust/boundary อีก 4 รายการ ไม่มี delete/replace): `alias/kubcode-secrets` (protect), S3 `kubcode-media-955758449820`, policy `kubcode-deploy-boundary`, roles `kubcode-github-deploy` (main) และ `kubcode-github-preview` (PR, read-only)
- OIDC trust ใช้ **immutable subject** ของ repo นี้ (`repo:JK369x@104179568/kubcode@1444458364:…`) ไม่ใช่ `repo:JK369x/kubcode:…` (ถ้าใช้แบบชื่อจะได้ "Not authorized to perform sts:AssumeRoleWithWebIdentity" ซึ่งเกิดใน run แรกของ PR #10)
- CI `.github/workflows/infra.yml`: PR ทำ preview แล้ว comment, main ทำ preview → gate → up ถ้ามี delete/replace จะหยุดรอเจ้าของรัน workflow_dispatch พร้อม `approve infra <digest>`
- **Boundary แก้ได้เฉพาะ admin ที่รันจากเครื่อง** (CI ถูก Deny) งานที่เพิ่ม Lambda/Scheduler/SSM หรือ KMS key ใหม่จึงต้องให้ admin apply boundary ก่อน; การเพิ่ม Lambda role เข้า secrets key ให้ทำที่ hook `secretsKeyUserArns` ใน `infra/index.ts`
- ยังค้าง: (1) budget `kubcode-monthly` ($5): เจ้าของให้ email แล้ว เก็บเป็น stack secret `kubcode:budgetEmail` และ CI สร้างให้ตอน merge PR budget (2) activate cost allocation tag `project` ต้องรอ billing เห็น tag ก่อน (~24h) แล้วรัน `bootstrap.sh cost-tag` (3) Lambda concurrency (ตอนนี้ 10): API รับแค่ค่า > 1000 และ account ไม่มี Premium Support ให้เปิด case ผ่าน API เจ้าของต้องเลือกว่าจะขอ >1000 ผ่าน `bootstrap.sh quota N` หรือเปิด case ขอ 100 เองใน console

## 8. Pitfalls / ไม่ควรทำซ้ำ

- CLI-first ทุกบริการ; APIเมื่อCLIไม่เหมาะ และUIเมื่อเป็น consent/login จริง ห้ามผลัก dashboard ก่อนตรวจ CLI
- Supabase `--profile` custom เป็น **filepath** ไม่ใช่ account alias; custom name ผูก Keychain และมี legacy fallback ต้องเช็ก exact personal entryก่อนใช้ ห้ามใช้ default/company tokenแทน
- Native owner login ต้อง `--agent no --output-format text`; JSONmodeถามverificationcodeไม่ได้ รหัสกรอกที่Terminalไม่ใช่แชต ไม่จำเป็นต้อง login ซ้ำถ้า scoped commandsยังทำงาน
- OS Keychain approvalเป็นowner gate ห้าม auto-click/bypass; ส่งเฉพาะ credentialที่อนุญาตไปยังprovider clientในmemory ไม่พิมพ์หรือexport
- ห้ามปิดTLSverificationแก้SELF_SIGNED_CERT_IN_CHAIN; ใช้officialpublicCAแล้วทดสอบ roleจริง
- ห้ามใช้ session advisory lock/search_path กับ transaction pooler; runtime SQLต้องqualified ใช้xact lock/SET LOCALในmigration
- ห้ามให้ Server Componentเรียก helperจากไฟล์ `use client`; รอบนี้build/staticfixturesเคยผ่านแต่actualroute500 ต้องทดสอบNextที่รันจริง
- Invalid/revokedcentralJWTต้องตอบemptypublicsession ไม่ใช่expires-only objectที่SDKมองเหมือนauthenticated
- Applied0001บนhostedแล้ว **ห้ามแก้ migrationเดิม** ให้ทำversionใหม่และวางrollback แบบไม่ทำลายข้อมูล
- Rollback deployment/ปิดflagไม่ลบDBrecords และอาจคืนstatelesssessionsemantics ห้าม rollbackเพื่อแก้revocationโดยไม่ทบทวนpolicy; อย่าทำdown/drop/deleteusersโดยพลการ
- Late background notifications ของ Claude/Docker เป็นงานเก่าที่ตรวจผลแล้ว ไม่ใช่คำสั่งให้สร้าง/provision/runงานใหม่
- รักษา `NEXT_PUBLIC_MEDIA_MODE=licensed-only` ใน build+runtime; approved preview allowlistยัง0 ห้าม upload original/derived covers หรือเปิดlocal-studyในpublic
- ไม่เปิด billing/paid upgrade/GPU/Cloud Run/Lightsail ไม่ใช้ company resources ไม่ย้ายproviderหรือเพิ่มOAuthscopeเอง

## 9. ข้อความเริ่มต้นสำหรับ agent คนถัดไป

> อ่าน HANDOFF.md, AGENTS.md และ current release receipts ก่อน ตรวจ live แบบread-onlyว่าdeployment/provider/central runtimeยังตรง แล้วติดตาม P0 owner acceptance (เจ้าของต้องเชื่อม LINE จากบัญชี Google) และขั้น "เปิด interactions" ที่เจ้าของรันเอง deploy/migration ผ่าน GitHub Actions เท่านั้น ไม่สร้างDBหรือloginSupabaseซ้ำโดยอัตโนมัติ ใช้ skills web-authentication, kubcode-deployment, cli-first-service-operations และให้Claudeบทบาทจริงตามขนาดงาน แยก fixture/init จาก actual external OAuth proof ไม่อ่านsecrets/privateoriginals หลัง P0ผ่านให้ถามเจ้าของว่าจะเลือกbacklogข้อไหนต่อ ไม่เริ่มMCP/approval/download/paidresourcesเอง

บันทึกโครงการ: `/Users/jakkarin69/Documents/Obsidian Vault/10-Projects/personal-skill-web/personal-skill-web.md`
