# Checklist เจ้าของ — เตรียม Google + Meta ก่อนกด "เชื่อม" ใน kubcode

ใช้คู่กับ `docs/design/settings-keys.md` · 2026-11-04

**สถานะ 2026-11-05:** เจ้าของแจ้งว่าทำแล้ว: สร้าง Google Web client + เปลี่ยนเป็น In production (A.4, A.5) และใส่ redirect URI ของ Meta (B.1, B.2) ข้ออื่นยังไม่ได้ยืนยัน

> **ห้ามพิมพ์หรือวาง client secret / app secret ในแชต ใน issue หรือในไฟล์**
> ให้กรอกที่หน้า `kubcode.dev/account/keys` เท่านั้น (หน้านี้จะเปิดเมื่อ slice 3 ขึ้นแล้ว)
> ระหว่างนี้แค่สร้างค่าและจดว่าอยู่ตรงไหนก็พอ

## A. Google (YouTube) — project `pure-album-512910-d0`

ทำที่ Google Cloud Console โดยใช้บัญชีที่เป็นเจ้าของ project นี้

1. [ ] เลือก project `pure-album-512910-d0` (เป็น project เดียวกับที่ uploader เดิมใช้)
2. [ ] เช็กว่า **YouTube Data API v3** ยังเปิดอยู่ (ไปที่ APIs & Services › Enabled APIs)
3. [ ] **Branding** (Google Auth Platform › Branding / OAuth consent screen)
   - [ ] ใส่ `kubcode.dev` ใน **Authorized domains**
4. [x] **สร้าง Web client** (Google Auth Platform › Clients › Create client)
   - Application type: **Web application** (client เดิมเป็น *Desktop app* ใช้กับเว็บไม่ได้ **อย่าลบ** เพราะสคริปต์เดิมยังใช้อยู่)
   - Name: `kubcode web connect`
   - Authorized redirect URIs: `https://kubcode.dev/api/keys/oauth/callback/youtube` (ต้องตรงทุกตัวอักษร ไม่มี `/` ท้าย)
   - Authorized JavaScript origins: ไม่ต้องใส่
   - [x] กด Create แล้ว **Client ID** กับ **Client secret** จะเก็บไว้ใน console (ดูซ้ำได้ภายหลังที่ Clients) ไม่ต้อง download JSON ไปไว้ในเครื่อง
5. [x] **เปลี่ยนเป็น In production** (Google Auth Platform › Audience › Publishing status › **Publish app**)
   - เหตุผล: ถ้ายังเป็น *Testing* refresh token จะหมดอายุทุก 7 วัน และการตั้งเวลาโพสต์จะพัง
   - หลัง publish ไม่ต้องยื่น verification (ใช้ส่วนตัว) ตอนเชื่อมจะเจอหน้า "Google hasn't verified this app" ให้กด **Advanced › Go to … (unsafe)** แอปแบบ unverified รับผู้ใช้ได้สูงสุด 100 คน
   - token เก่าที่ออกตอนยังเป็น Testing ยังจะหมดอายุตามเดิม จึงต้องกดเชื่อมใหม่ใน kubcode ทุกช่อง
6. [ ] พอหน้า kubcode พร้อม ให้กดเชื่อมทีละช่อง (STORY GRID, โลกอีกแบบ, running-on-legacy) ตอน Google ถามให้เลือกช่องหรือ brand account ให้เลือกช่องที่ต้องการ (หนึ่งรอบต่อหนึ่งช่อง)

## B. Meta (Instagram) — app "Story Grids Studio"

ทำที่ developers.facebook.com › My Apps › **Story Grids Studio**

1. [x] ไปที่ Instagram › **API setup with Instagram business login** › **Business login settings**
2. [x] ใส่ `https://kubcode.dev/api/keys/oauth/callback/instagram` ใน **OAuth redirect URIs** (เก็บ redirect เดิมไว้ได้) แล้วกด Save
3. [ ] จดว่า **Instagram app ID** กับ **Instagram app secret** อยู่ในหน้านี้ เพราะต้องกรอกใน kubcode (ใช้ค่าของ *Instagram app* ซึ่งต่างจาก Meta app ID)
4. [ ] แอปยังเป็น Development mode (ยังไม่ publish) ซึ่งใช้ได้ แต่ @story.grids และ @kube.code ต้องยังเป็น **Instagram tester** ที่กด accept แล้ว (ดูที่ App roles › Roles)
5. [ ] พอหน้า kubcode พร้อม ให้กดเชื่อม Instagram ทีละบัญชี ถ้า browser จำบัญชี IG อื่นไว้ ให้ logout ใน instagram.com ก่อน

## D. ฐานข้อมูล (role ของ Lambda)

- ไม่ต้องสร้าง role `kubcode_worker` เอง migration 0004 สร้างให้ตอน merge (แบบ NOLOGIN ไม่มีรหัสผ่าน)
- ฐานข้อมูลย้ายไป Supabase `kubcode-sg` (ap-southeast-1) แล้ว และ `infra/scripts/move-db.sh` ตั้งรหัสผ่าน LOGIN ของ `kubcode_worker` กับเก็บ URL ลง SSM ให้ตอนย้าย
- ภายหลังถ้าจะเปลี่ยนรหัสผ่าน ใช้ `webhost.sh set-worker-db` (ไม่ต้องพิมพ์หรือดูรหัสผ่านเอง)

## E. ขั้นที่ 5: ปุ่ม "เชื่อมช่อง" / "เชื่อมบัญชี" (หลัง orchestrator รัน `pulumi up`)

**ก่อน (ทำเมื่อไหร่ก็ได้ ไม่มี secret):** Google Cloud project `pure-album-512910-d0`
1. [ ] Google Auth Platform › **Branding**: เปลี่ยน App name เป็น **kubcode**
2. [ ] Branding › **Authorized domains**: เพิ่ม `kubcode.dev`
3. [ ] เช็กว่า Web client **"kubcode web connect"** มี redirect `https://kubcode.dev/api/keys/oauth/callback/youtube` (ไม่มี `/` ท้าย)

**หลัง orchestrator รัน `pulumi up` แล้ว (ที่ root ของ repo, ใน bash, AWS profile ของ admin):**
4. [ ] เช็กว่าย้ายฐานข้อมูลไป `kubcode-sg` เสร็จแล้ว (`infra/scripts/move-db.sh` ตั้ง `kubcode_worker` และ
   `/kubcode/prod/worker-db-url` ให้แล้ว) ไม่ต้องรัน `webhost.sh set-worker-db` อีก
5. [ ] `infra/web/scripts/webhost.sh set-connect`: วาง Client ID (เห็นได้) และ Client secret (ซ่อน) ของ
   "kubcode web connect" จาก Google console คำสั่งสร้าง HMAC key เอง ใส่ SSM และ `web.env` ให้ แล้ว restart เว็บ
6. [ ] รอ 5 นาที (Lambda โหลด secret ใหม่) แล้วเปิด `kubcode.dev/account/keys` › YouTube › **เชื่อมช่อง**
   เจอหน้า "Google hasn't verified this app" ให้กด Advanced › Go to kubcode (ปกติของแอปที่ยังไม่ verify)
7. [ ] Instagram: บันทึก Instagram app ID + secret ในหน้า (ถ้ายังไม่ได้ทำ) แล้วกด **เชื่อมบัญชี**

ห้ามวาง client secret, รหัสผ่าน หรือ HMAC key ในแชต ไฟล์ หรือ git: คำสั่งทั้งสองส่งค่าไปที่ SSM / web.env โดยตรง

## C. หลังเชื่อมแล้ว

- [ ] หน้า kubcode ต้องแสดงชื่อช่องหรือ @บัญชีถูกต้อง สถานะ "ใช้งานได้" และ secret แสดงแค่ 4 ตัวท้าย
- [ ] ถ้าสงสัยว่าค่ารั่ว ให้ reset secret ใน Google/Meta ก่อน แล้วกด "แทนที่" ใน kubcode จากนั้นกดเชื่อมใหม่
