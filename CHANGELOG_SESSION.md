# สรุปการเปลี่ยนแปลง (Phantom Melody)

## PBZ BGM และเพลย์ลิสต์

- **Hardcode BGM จากไฟล์ WAV** — ใส่ไฟล์ .wav ใน `music/pbz/` ไม่ push ขึ้น git (มีใน .gitignore)
- **config/pbz-bgm-tracks.js** — รายการ BGM (แก้ trackId, title, fileName ให้ตรงกับไฟล์)
- **scripts/seed-pbz-bgm.js** — seed จาก config เข้า MongoDB + อัปเดตเพลย์ลิสต์
- **scripts/sync-pbz-from-files.js** — sync จากโฟลเดอร์ `music/pbz/*.wav` เข้า DB อัตโนมัติ (`npm run sync-pbz` / `npm run sync-pbz:host`)
- **init-playlists.js** — เหลือเฉพาะเพลย์ลิสต์ PBZ (ลบ Battle/Story/Exploration ฯลฯ ออกจาก DB)
- **Dockerfile** — copy `config/` และ `scripts/`; mount `./music` สำหรับ WAV ที่รัน

## การแสดงผลและ UX

- **QueueManager.getAllTracks()** — ดึงแทร็กจากเพลย์ลิสต์ "Phantom Blade Zero Melody" (รวม local WAV) แทนการดึงเฉพาะ YouTube
- **Dropdown แสดงครบทุกเพลง** — Discord จำกัด 25 ตัวเลือกต่อเมนู จึงแบ่งเป็นหลายเมนู (Songs 1–25, 26–31) ทั้งช่องเลือกเพลงเข้าคิวและช่อง Admin View & Remove
- **ข้อความเป็นภาษาอังกฤษทั้งหมด** — placeholder และข้อความใน embed (control, admin, selection queue)
- **Log เรียงตามเวลา** — แสดง "Queued" ก่อน แล้วตามด้วย "Now playing" (chronological)

## การเข้าคิวเลือกเพลง

- **ต้อง Join Queue ก่อน** — ถ้าไม่มีคนกำลังเลือก จะเลือกเพลงไม่ได้ ต้องกด Join Queue เพื่อได้เทิร์น
- **คนละ 1 เพลงต่อเทิร์น** — เลือกเสร็จแล้วเทิร์นจบ อยากเพิ่มอีกต้อง Join Queue ใหม่

## Admin

- **ลบปุ่ม Add Song (YouTube)** — เหลือเฉพาะปุ่ม View & Remove ในช่อง Admin Playlist
- **ADMIN_CONTROL_CHANNEL_ID** — ช่องสำหรับปุ่ม Admin เท่านั้น: Force Skip, Pause, Resume (กรณีฉุกเฉิน/ทดสอบ)

## อื่นๆ

- **sync-pbz:host** — รัน `npm run sync-pbz:host` เมื่อ Mongo อยู่ในการ์ด (ใช้ localhost แทน hostname mongodb)
- **README** — เพิ่ม ADMIN_CONTROL_CHANNEL_ID, วิธี rebuild หลังเปลี่ยนโค้ด
