# สรุปการเปลี่ยนแปลง (Phantom Radio)

## PBZ BGM และเพลย์ลิสต์

- **Hardcode BGM จากไฟล์ WAV** — ใส่ไฟล์ .wav ใน `music/pbz/` ไม่ push ขึ้น git (มีใน .gitignore)
- **config/pbz-bgm-tracks.js** — รายการ BGM (แก้ trackId, title, fileName ให้ตรงกับไฟล์)
- **scripts/seed-pbz-bgm.js** — seed จาก config เข้า MongoDB + อัปเดตเพลย์ลิสต์
- **scripts/sync-pbz-from-files.js** — sync จากโฟลเดอร์ `music/pbz/*.wav` เข้า DB อัตโนมัติ (`npm run sync-pbz` / `npm run sync-pbz:host`)
- **init-playlists.js** — เหลือเฉพาะเพลย์ลิสต์ PBZ (ลบ Battle/Story/Exploration ฯลฯ ออกจาก DB)
- **Dockerfile** — copy `config/` และ `scripts/`; mount `./music` สำหรับ WAV ที่รัน

## การแสดงผลและ UX

- **QueueManager.getAllTracks()** — ดึงแทร็กจากเพลย์ลิสต์ "Phantom Blade Zero Radio" (รวม local WAV) แทนการดึงเฉพาะ YouTube
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

---

## Session: Rename to Phantom Radio, Honor Points flag, Playlist fix

### Rebrand: Phantom Melody → Phantom Radio

- **Display & config** — ชื่อบอท/เพลย์ลิสต์/ข้อความทั้งหมดจาก "Phantom Melody" เป็น "Phantom Radio"
- **Env & code** — ตัวแปร `PHANTOM_MELODY_*` → `PHANTOM_RADIO_*` ใน .env และทุกไฟล์ใน src/
- **Package & Docker** — ชื่อโปรเจกต์ `phantom-melody` → `phantom-radio`, service/container `phantom-radio` / `phantom-radio-bot`
- **Playlist name** — "Phantom Blade Zero Melody" → "Phantom Blade Zero Radio" (config + sync script)

### Honor Points (Feature Flag)

- **ENABLE_HONOR_POINTS** — ใส่ใน .env (ค่าเริ่มต้น `false`) เมื่อปิด: ไม่หัก/ไม่เพิ่มแต้ม, pin/upvote/unlock ใช้ได้ฟรี, ยอดใน DB ไม่ถูกแก้
- **HonorPointService** — เมื่อ `ENABLE_HONOR_POINTS !== 'true'`: `deductPoints`/`addPoints` เป็น no-op (return success โดยไม่เขียน DB)
- **balance** — แสดง footer "Honor Points spending is currently disabled" เมื่อปิด

### Playlist sync & Discord embed

- **sync-pbz-from-files.js** — ใช้ชื่อเพลย์ลิสต์ "Phantom Blade Zero Radio" ให้ตรงกับบอท (เดิมใช้ "Phantom Blade Zero Melody" เลย embed แสดง 0 tracks)
- **Refresh after DB connect** — หลัง `connectDB()` สำเร็จ และหลัง Discord ready 4 วินาที เรียก `musicInteractionService.refreshSongSelection()` เพื่ออัปเดต embed playlist/song-selection/admin ให้ดึง tracks จาก DB (แก้กรณี embed ขึ้น 0 tracks เพราะ setupAllButtons รันก่อน DB เชื่อมต่อ)

---

## Session: Display "Phantom Radio" in all embeds

- **MAIN_PLAYLIST.displayName** — เพิ่ม `displayName: 'Phantom Radio'` ใน config; เก็บ `name: 'Phantom Blade Zero Radio'` สำหรับ DB/sync
- **ช่อง Music Player (PHANTOM_RADIO_MUSIC_PLAYER_CHANNEL_ID)** — Now Playing idle/title และ View Queue footer แสดง "Phantom Radio" แทน "Phantom Blade Zero Melody" / "Phantom Blade Zero Radio"
- **ช่องอื่นๆ** — Vote Skip, Song Selection, Admin Playlist, Playlist (multi-page), Manual/Guide ใช้ `MAIN_PLAYLIST.displayName` ใน title/footer ทั้งหมด
- **NowPlayingDisplayService** — import MAIN_PLAYLIST, ใช้ displayName ใน generateIdleEmbed และ footer ของ playing embed
- **MusicInteractionService** — ทุก embed ใช้ MAIN_PLAYLIST.displayName; การเช็ค message เก่ายังรองรับทั้ง name และ displayName
- **QueueManager** — คอมเมนต์และ log ใช้ displayName
