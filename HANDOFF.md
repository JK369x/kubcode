# kubcode — handoff / งานคงเหลือ

อัปเดต: 2026-11-03 (+07) · สำหรับเจ้าของโปรเจกต์และ agent ที่รับช่วงต่อ

Fresh readback interval (UTC): `2026-11-03T14:45:36.327111+00:00` → `2026-11-03T14:45:43.500050+00:00`. หลักฐานตรวจปัจจุบัน: `.qa/handoff-readback-2026-11-03.json`

> **สถานะ: deploy ระบบบัญชีกลางแล้ว ไม่ได้ติด Supabase login และไม่ต้องสร้าง DB/deploy ซ้ำ**
> งานที่ยังไม่ปิดคือ owner acceptance ของ LINE/link/unlink/login/logout ด้วยบัญชีจริง ไม่ใช่งานเขียนระบบใหม่
> ไฟล์นี้มี operational metadata แต่ไม่มี secret; ตรวจความเหมาะสมก่อนนำไปเผยแพร่ใน public repository

## 1. สรุปสั้น / เริ่มอ่านตรงนี้

- เว็บ: `https://kubcode.dev` · เข้าสู่ระบบ: `https://kubcode.dev/account` · ตั้งค่าวิธีเข้าสู่ระบบ: `/account/settings`
- Google + LINE ใช้ NextAuth; ฐานข้อมูลสมาชิกตัวตนใช้ **Supabase PostgreSQL ส่วนตัว ไม่ใช่ Supabase Auth**
- มี internal user ID และเชื่อมสอง provider เข้าบัญชีเดียวกันได้โดยยืนยันทั้งสองฝั่ง ไม่มี auto-merge ด้วยอีเมล
- Production ปัจจุบัน: `dpl_2M8P5FcZv2ymhY1RUccvj9mzWMzN` — ตรวจ canonical alias ล่าสุดแล้ว READY และตรงกับ release receipt
- Immediate predecessor ของ rollout นี้คือ `dpl_6pXA1iUTDSjr3TV8446B5zDQYz78` (provider-only); `dpl_6ZZFPGMdTaMeU9gbjFBxrNBQVXpR` เป็น Google-only ที่เก่ากว่านั้น ไม่ใช่ immediate rollback target. การระบุIDไม่ใช่อนุมัติให้rollback
- Fresh read-only DB aggregate ตอนทำ handoff: **users 1, Google identities 1, LINE identities 0, users ที่มีทั้งสองวิธี 0** ไม่ได้อ่านหรือบันทึก email/subject/profile ของผู้ใช้
- Audit baseline ในรอบตรวจเดียวกัน: **1 events**; ใช้เทียบหลัง owner test โดยไม่อ่าน PII
- ตัวเลขนี้เป็นหลักฐานว่ามี Google identity ถูกบันทึกแล้ว แต่ **ไม่ใช่ owner sign-off ของ Google logout หรือ LINE linking** และไม่ระบุว่าบัญชีนั้นเป็นของใคร
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

## 3. งานคงเหลือ — เรียงลำดับ

### P0 — ปิด acceptance ของงาน auth รอบนี้ (กำลังรอเจ้าของ)

> **2026-11-03 สถานะยังไม่ผ่าน:** เจ้าของแจ้งว่าทดสอบ P0 ผ่านแล้ว แต่ read-only aggregate เวลา 14:59:47Z (production `dpl_2M8P5FcZv2ymhY1RUccvj9mzWMzN`, project `sgtyrndczwxijrubyyjw`) ยังเป็น users 1, Google 1, **LINE 0, users ที่มีทั้งสองวิธี 0**, audit 1 (`user_created`) และ **link intents 0 แถว** ตรงกับ baseline ทุกค่า แปลว่ายังไม่มี link flow ไปถึง production DB จึงยังไม่ติ๊ก ต้องถามเจ้าของว่าทดสอบที่ origin ไหนและหน้า settings แสดงอะไร หลักฐานอยู่ที่ `.qa/p0-owner-acceptance-check-2026-11-03.json`

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

### P1 — ก่อนเปิดให้คนทั่วไป/เพิ่มสิทธิ์สำคัญ

รายการนี้ยังไม่ใช่งานที่ทำเสร็จ และไม่ได้อนุมัติให้ทำทุกข้ออัตโนมัติ:

- [ ] ตรวจ Google OAuth audience/publishing/domain และ LINE channel Developing/Published, audience, linked-OA consent กับเจ้าของจริง; ห้าม publish audience หรือเพิ่ม scope เงียบ ๆ
- [ ] ตรวจ branding/consent ของ LINE ตาม provider; ปุ่ม text-only สีเขียวไม่ใช่ใบรับรอง compliance
- [ ] เก็บ source/tests/docs เข้าระบบ version control อย่างปลอดภัย ปัจจุบัน `main` มี last commit `895af8b` และไฟล์แอปส่วนใหญ่ยัง untracked; **ห้าม `git add .`, `git clean`, `git reset --hard` หรือ push ก่อนตรวจ private assets/credentials/remote owner** — 2026-11-03: commit source/tests/scripts/docs ลง local branch `chore/track-source` แล้ว (สแกน secret ก่อน stage, `.qa/`/previews/ZIP/dotenv ถูก ignore) ยังไม่ merge เข้า `main` และยังไม่มี remote
- [ ] ยืนยัน personal remote/ขอบเขตการ push กับเจ้าของ; ยังไม่มีหลักฐาน Git push หรือ hosted GitHub CI pass
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
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `LINE_CLIENT_ID`, `LINE_CLIENT_SECRET`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `DATABASE_URL`, `KUBCODE_DB_CA_CERT`, `KUBCODE_ACCOUNTS_ENABLED=true`.

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
- ใช้ `npm run db:migrate:accounts` แบบdry-runได้ แต่ **ห้าม `--apply` บน hosted DB ซ้ำโดยไม่มี scope/checksum/owner checks** ไม่มี auto-down migration

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

> อ่าน HANDOFF.md, AGENTS.md และ current release receipts ก่อน ตรวจ live แบบread-onlyว่าdeployment/provider/central runtimeยังตรง แล้วเริ่ม P0 owner acceptance ไม่สร้างDBหรือloginSupabaseซ้ำโดยอัตโนมัติ ใช้ skills web-authentication, kubcode-deployment, cli-first-service-operations และให้Claudeบทบาทจริงตามขนาดงาน แยก fixture/init จาก actual external OAuth proof ไม่อ่านsecrets/privateoriginals หลัง P0ผ่านให้ถามเจ้าของว่าจะเลือกbacklogข้อไหนต่อ ไม่เริ่มMCP/approval/download/paidresourcesเอง

บันทึกโครงการ: `/Users/jakkarin69/Documents/Obsidian Vault/10-Projects/personal-skill-web/personal-skill-web.md`
