# เช็กลิสต์เจ้าของ — สมัคร Zernio และเก็บ API key

ใช้กับ `docs/design/publishing-core.md` ทำตามลำดับ ทุกข้อเจ้าของทำเองได้ ไม่ต้องรอโค้ด

## A. สมัครบัญชี Zernio

1. เปิด https://zernio.com แล้วสมัครด้วยอีเมลที่ใช้กับงาน kubcode (แนะนำให้ใช้อีเมลเดียวกับที่ใช้กับ AWS budget)
2. **ยังไม่ต้องเชื่อม channel ใดใน dashboard ของ Zernio** เพราะ kubcode จะเชื่อมให้จากหน้า `/account/channels` เอง
   (ถ้าเชื่อมใน dashboard ไว้ก่อน บัญชีนั้นจะไปอยู่ใน profile ที่ระบบเราไม่รู้จัก)
3. ยังไม่ต้องผูกบัตร 2 บัญชีแรกฟรี ถ้า Zernio บังคับให้ใส่บัตร ให้ใส่ได้ แต่อย่าเพิ่ม channel ที่ 3

## B. สร้าง API key

1. Dashboard → **API Keys** → สร้าง key ใหม่ ตั้งชื่อ `kubcode-prod`
   - สิทธิ์: เต็ม (ไม่จำกัด profile) เพราะ Lambda ตัวเดียวดูแลทุก workspace
   - วันหมดอายุ: ไม่ตั้ง หรือตั้ง 365 วันแล้วจดวันไว้
2. กด **Copy** (key ขึ้นต้นด้วย `sk_`) **ห้ามวางในแชต, Slack, Notes, หรือไฟล์ใด ๆ**

## C. เก็บลง Keychain vault ทันที (ที่ repo root)

```sh
pbpaste | infra/scripts/secret.sh put zernio-api-key
pbcopy < /dev/null          # ล้าง clipboard
infra/scripts/secret.sh has zernio-api-key && echo stored
```

ได้ `stored` แปลว่าเรียบร้อย macOS จะถามรหัสผ่านเครื่องทุกครั้งที่ script อ่าน key ตัวนี้

## D. แจ้ง agent

ส่งแค่ข้อความ "เก็บ zernio-api-key แล้ว" (ไม่ต้องส่ง key) agent จะเตรียมคำสั่ง admin ที่คัดลอก key จาก vault
ไปเก็บใน SSM `/kubcode/prod/zernio-api-key` ผ่านไฟล์ชั่วคราว ค่า key จะไม่ผ่าน argv หน้าจอ หรือแชต

## E. สิ่งที่ต้องตอบ orchestrator (ถ้ายังไม่ได้ตอบ)

- 2 channel แรก (ฟรี): แนะนำ **YouTube โลกอีกแบบ** + **IG @lokeekbaebkub**
- คลิปทดสอบ: คลิปจาก backlog ที่ยังไม่ได้ลงและมีปกแล้ว ลง YouTube แบบ **private** ก่อนหนึ่งครั้ง
- ตอนเชื่อม Google และ Instagram หน้าขออนุญาตจะขึ้นชื่อแอปของ Zernio ไม่ใช่ kubcode ซึ่งเป็นแบบนี้อยู่แล้ว ไม่ใช่ความผิดพลาด

## ถ้า key รั่ว

ลบ key ใน Zernio dashboard ทันที → สร้างใหม่ → ทำข้อ C ซ้ำ (`put` จะเขียนทับค่าเดิม) → แจ้ง agent ให้ update SSM

## F. หลัง slice 1 merge แล้ว — ขั้นที่เจ้าของทำ (ตามลำดับ)

1. **ลงทะเบียน webhook กับ Zernio** (อ่าน vault 1 ครั้ง, macOS จะถามรหัสผ่าน):
   ```sh
   AWS_PROFILE=default infra/scripts/publishing-secrets.sh webhook \
     "$(pulumi -C infra stack output --stack prod publishingUrl)webhooks/zernio"
   ```
   วันถัดไปถ้าเคยมี secret เก่า: `infra/scripts/publishing-secrets.sh drop-previous`
2. **เปิดหน้า /account/channels บนเว็บ** (อ่าน `publishing-hmac-key` จาก vault):
   ```sh
   infra/web/scripts/webhost.sh set-publishing
   ```
3. **ติดตั้ง CLI** บน Mac: `cargo install --path services/crates/kubcode-cli`
4. **เชื่อมช่อง** ที่ https://kubcode.dev/account/channels → "เชื่อม YouTube" แล้ว "เชื่อม Instagram"
   (2 ช่องแรกฟรี) จากนั้นตรวจด้วย `kubcode whoami`
5. **โพสต์ทดสอบแบบ private** (หลังเจ้าของ OK คลิป):
   ```sh
   kubcode schedule <clip-id> --channel <youtube-channel-id> --at 2026-11-12T19:00:00+07:00 --visibility private
   ```
   ระบบจะแสดงสรุปทั้งหมดก่อน ต้องพิมพ์รหัสคลิปเพื่อยืนยัน แล้วดูผลด้วย `kubcode status <post-id>`
