# LokalBoost — Backend API

Backend untuk **LokalBoost**: marketplace yang mempertemukan UMKM lokal dengan
kreator konten pemula dengan model **Pay-Per-View** + **Rekber (Escrow)** dan
fitur AI. Mengacu pada PRD di `../ISI dan Fungsi/LokalBoost (1).pdf`.

Frontend-nya ada di `../lokalboost-web` dan **sepenuhnya tersambung ke API ini**
— tidak ada lagi data contoh di sisi antarmuka. Jalankan keduanya bersamaan:
API di port 4000, web di port 5173.

## Teknologi

- **Node.js 20** + **Express 4** (ESM)
- **SQLite** lewat `better-sqlite3` — satu berkas, tanpa server database, jalan offline
- **JWT** untuk sesi, **scrypt** bawaan Node untuk kata sandi (tanpa dependensi native tambahan)
- **`@anthropic-ai/sdk`** untuk fitur AI generatif, dengan fallback template
- Seluruh nama berkas, fungsi, tabel, dan pesan galat memakai Bahasa Indonesia

## Cara Menjalankan

```bash
cd lokalboost-api
npm install          # sekali saja
npm run seed         # isi basis data dengan data contoh
npm run dev          # http://localhost:4000
```

Cek `http://localhost:4000/api/kesehatan` untuk memastikan API hidup.

### Akun contoh

Semua akun hasil seed memakai kata sandi **`lokalboost123`**.

| Peran | Email | Keterangan |
|---|---|---|
| UMKM | `oleh@baksoaci.id` | Punya kampanye berjalan "Promo Bakso Aci" |
| UMKM | `busari@warungsunda.id` | Punya kampanye berjalan + kampanye mencari kreator |
| Kreator | `rafi@kreator.id` | Sedang mengerjakan kampanye Bakso Aci |
| Kreator | `sari@kreator.id` | Punya kampanye selesai + saldo siap tarik |
| Admin | `admin@lokalboost.id` | Bisa memutuskan sengketa |

### Perintah lain

```bash
npm test                                  # 75 tes ujung-ke-ujung (basis data sementara)
npm run seed && npm run asap              # uji asap terhadap server hidup + data seed
npm run simulasi                          # kirim trafik tayangan ke kampanye pertama
node src/simulasi.js bakso-aci 500 40     # 500 tayangan, 40% di antaranya curang
npm run setel                             # usulan ambang AI berdasarkan keputusan admin
npm run cek-ai                            # buktikan jalur Claude hidup (butuh ANTHROPIC_API_KEY)
npm run bagikan                           # aplikasi utuh + tautan publik untuk teman
```

`npm run bagikan` membangun frontend, menyalakannya bersama API di **satu
alamat** (`FOLDER_WEB`), lalu membuka Cloudflare Quick Tunnel. Panduannya di
[`BAGIKAN.md`](../BAGIKAN.md).

`npm test` memakai basis data sementara di `%TEMP%` dan tidak menyentuh data
pengembangan (dan sejak `NODE_ENV=test` mematikan SMTP, ia juga tidak lagi
mengirim email sungguhan ke alamat karangan). `npm run asap` sebaliknya: ia
memanggil server yang sedang berjalan di port 4000 dengan akun hasil seed,
persis seperti yang dilakukan frontend — 86 pemeriksaan yang memastikan data
seed benar-benar melayani setiap layar.

`npm run cek-ai` ada karena `services/ai.js` sengaja tidak pernah gagal: kunci
yang salah hanya terlihat sebagai hasil template yang tetap masuk akal. Skrip
ini keluar dengan kode 1 kalau salah satu fitur LLM ternyata masih memakai
template, sambil mencetak sebab aslinya. `npm run setel` menerjemahkan panel
"Ketepatan AI" menjadi usulan angka — penjelasan lengkapnya di
[`MELATIH-AI.md`](../MELATIH-AI.md).

## Yang Membuat Backend Ini Bukan Sekadar CRUD

Tiga bagian di bawah ini adalah inti produknya, dan ketiganya diimplementasi
sungguhan — bukan angka yang di-*hardcode*.

### 1. Rekber (Escrow) & Pay-Per-View — `src/services/escrow.js`

Tiga aturan yang dipegang seluruh modul:

1. **Uang UMKM keluar sekali** saat setor ke Rekber. Setelah itu semua
   pergerakan hanya memindahkan angka di dalam escrow — UMKM tidak pernah
   ditagih lagi. Inilah janji "tidak ada biaya tak terduga".
2. **Kreator mendapat akrual, bukan pencairan langsung.** Setiap tayangan
   tervalidasi menambah *saldo tertahan*, dan dana baru bisa ditarik saat
   kampanye tuntas. Kalau ada sengketa, uangnya masih di dalam sistem.
3. **Total yang keluar dari escrow tidak pernah melebihi** `min(dana disetor,
   batas maksimal biaya)`. Sisa berapa pun kembali ke UMKM.

Semua operasi uang dibungkus transaksi SQLite, jadi tidak ada kondisi setengah
jalan bila proses mati di tengah. Tes `npm test` memverifikasi neraca tertutup:
`dibayar penuh ke kreator + refund atau sisa Rekber = dana yang disetor`.

**Kebijakan refund** (PRD §15 menandainya sebagai pertanyaan terbuka): bila
target tidak tercapai sampai kampanye berakhir, kreator tetap dibayar untuk
tayangan asli yang sudah dihasilkan, dan UMKM menerima kembali dana yang belum
terpakai. Tidak ada pihak yang menanggung risiko penuh sendirian.

### 2. AI Anti-Fraud — `src/services/antifraud.js`

Dua lapis, persis batasan MVP di PRD: "berbasis aturan dan model deteksi
anomali dasar".

**Lapis 1 — aturan per tayangan**, dijalankan saat tayangan masuk:

| Aturan | Yang ditangkap |
|---|---|
| Pola user-agent bot | `python-requests`, `HeadlessChrome`, `curl`, Selenium, dll. |
| Durasi tonton minimum | Ambang relatif: 25% durasi video, dengan lantai 3 detik |
| Batas tayangan per IP | Maksimal 3 per alamat IP dalam jendela 60 menit |
| Duplikat perangkat | IP + user-agent yang sama dalam 10 menit = muat ulang, bukan penonton baru |

**Lapis 2 — deteksi anomali deret waktu**: menghitung z-score volume tayangan
per jam terhadap perilaku normal kampanye itu sendiri. Ambang tetap akan
menghukum kampanye besar dan meloloskan kecurangan pada kampanye kecil, jadi
ambangnya adaptif per kampanye.

Dua keputusan desain yang penting:

- **Urutan verifikasi mendahului pembayaran.** `prosesPembayaran()` menjalankan
  lapis 2 *sebelum* akrual. Begitu tayangan ditandai terbayar ia tidak bisa
  disaring lagi — uangnya sudah berpindah.
- **Tayangan yang disaring tidak dihapus.** Barisnya tetap ada dengan
  `valid = 0` dan kolom `alasan` terisi. Itu yang membuat halaman sengketa
  punya bukti, dan membuat kreator bisa mengajukan banding atas penyaringan
  yang keliru (PRD §15).

Jalankan `npm run simulasi` untuk melihatnya bekerja — tingkat deteksi pada
trafik campuran berada di kisaran 96–99%.

### 3. AI Smart Matchmaker — `src/services/matchmaker.js`

Model skoring berbobot (total 100) yang **setiap komponennya bisa dijelaskan**
— penting karena UMKM sasaran kami awam digital dan butuh tahu *kenapa* seorang
kreator direkomendasikan.

| Komponen | Bobot | Catatan |
|---|---|---|
| Kecocokan niche | 30 | Kategori bertetangga (fashion ↔ kecantikan) dapat setengah nilai |
| Kedekatan lokasi | 25 | Satu kota penuh; satu wilayah aglomerasi (Bandung Raya, Jabodetabek) 60% |
| Reputasi | 20 | Dari ulasan nyata; kreator baru dapat nilai dasar netral 70% |
| Rekam jejak | 10 | Jumlah kampanye yang pernah dituntaskan |
| Jangkauan | 10 | Perkiraan 20% pengikut menonton, dibanding target views |
| Ketersediaan | 5 | Turun bila sedang mengerjakan banyak kampanye |

Kreator baru sengaja **tidak** diberi nol pada komponen reputasi — kalau tidak,
marketplace akan macet di sisi suplai, persis masalah *cold start* di PRD §12.

### Fitur AI generatif — `src/services/ai.js`

Script Generator dan Auto-Report Summary memakai **Claude** bila
`ANTHROPIC_API_KEY` tersedia, dan jatuh ke **penyusun template deterministik**
bila tidak ada kunci, internet mati, atau API menolak. Demo tidak boleh gagal
karena Wi-Fi ruangan. Template pun menyusun naskah dari brief kampanye yang
sudah diisi UMKM, jadi hasilnya tetap relevan.

`GET /api/ai/status` menyatakan dengan jujur fitur mana yang sedang memakai
model bahasa dan mana yang berbasis algoritma.

## Daftar Endpoint

Semua rute diawali `/api`. Kolom **Akses**: 🌐 publik · 🔒 perlu login ·
🏪 UMKM · 🎬 kreator · 🛠 admin.

### Autentikasi & Profil

| Metode | Rute | Akses | Keterangan |
|---|---|---|---|
| POST | `/auth/daftar` | 🌐 | Daftar (peran umkm/kreator), kirim OTP |
| POST | `/auth/otp/kirim` | 🌐 | Kirim ulang kode OTP (jeda 60 detik, jawaban netral) |
| POST | `/auth/otp/verifikasi` | 🌐 | Verifikasi akun, dapat token (maks 5 tebakan) |
| POST | `/auth/masuk` | 🌐 | Masuk dengan email/HP + kata sandi (wajib terverifikasi) |
| GET | `/auth/saya` | 🔒 | Profil pengguna yang sedang masuk |
| PUT | `/auth/profil` | 🔒 | Lengkapi/sunting profil (langkah 2 pendaftaran) |
| POST | `/auth/sandi/ubah` | 🔒 | Ganti kata sandi (wajib menyertakan sandi lama) |
| POST | `/auth/sandi/lupa` | 🌐 | Kirim kode reset (jawaban netral, tujuan `reset`) |
| POST | `/auth/sandi/atur` | 🌐 | Tukar kode dengan sandi baru, langsung dapat token |

### Kampanye & Marketplace

| Metode | Rute | Akses | Keterangan |
|---|---|---|---|
| GET | `/kampanye` | 🌐 | Marketplace; filter `kategori`, `lokasi`, `anggaranMin/Maks`, `q`, `status` |
| POST | `/kampanye` | 🏪 | Buat kampanye (langkah 1+2) |
| PATCH | `/kampanye/:id` | 🏪 | Sunting selama dana belum disetor |
| POST | `/kampanye/:id/setor` | 🏪 | Setor dana ke Rekber (langkah 3) |
| GET | `/kampanye/:id` | 🌐 | Detail kampanye + brief |
| GET | `/kampanye/:id/rekomendasi-kreator` | 🏪 | AI Smart Matchmaker |
| POST | `/kampanye/:id/lamaran` | 🎬 | Ajukan diri |
| POST | `/kampanye/:id/undang` | 🏪 | Undang kreator langsung |
| GET | `/kampanye/:id/lamaran` | 🔒 | Daftar pelamar (kreator hanya melihat miliknya) |
| POST | `/kampanye/:id/lamaran/:lamaranId/setujui` | 🏪 | Setujui kreator |
| POST | `/kampanye/:id/lamaran/:lamaranId/tolak` | 🏪 | Tolak lamaran |
| GET | `/kampanye/:id/laporan` | 🔒 | Dasbor Laporan Hasil |
| GET | `/kampanye/:id/ringkasan-ai` | 🔒 | AI Auto-Report Summary |
| GET | `/kampanye/:id/anti-fraud` | 🔒 | Rincian penyaringan tayangan |
| POST | `/kampanye/:id/audit-fraud` | 🏪 | Jalankan deteksi anomali lapis 2 |
| POST | `/kampanye/:id/selesai` | 🏪 | Tutup kampanye & selesaikan dana |

### Kreator

| Metode | Rute | Akses | Keterangan |
|---|---|---|---|
| GET | `/kreator` | 🌐 | Direktori kreator; filter `niche`, `lokasi`, `q` |
| GET | `/kreator/:id` | 🌐 | Profil publik + ulasan + portofolio |
| GET | `/kreator/saya/kampanye` | 🎬 | Kampanye yang dikerjakan |
| GET | `/kreator/saya/lamaran` | 🎬 | Riwayat lamaran & undangan |
| GET | `/kreator/saya/rekomendasi` | 🎬 | Kampanye yang cocok menurut AI |

### Dompet & Transaksi

| Metode | Rute | Akses | Keterangan |
|---|---|---|---|
| GET | `/dompet` | 🔒 | Saldo, saldo tertahan, riwayat, `ambang2fa` |
| POST | `/dompet/tarik/kode` | 🔒 | Kirim kode 2FA penarikan ke email pemilik dompet |
| POST | `/dompet/tarik` | 🔒 | Penarikan; ≥ Rp 2 juta wajib `kodeOtp` yang sah |
| GET | `/dompet/transaksi` | 🔒 | Riwayat lengkap, filter `jenis` |

### Video & Tayangan

| Metode | Rute | Akses | Keterangan |
|---|---|---|---|
| POST | `/video` | 🎬 | Unggah video (multipart, field `berkas`; opsional) |
| GET | `/video` | 🌐 | Filter `kampanyeId`, `kreatorId` |
| GET | `/video/:id` | 🌐 | Detail video + hitungan tayangan |
| POST | `/video/:id/proses` | 🎬 | AI Auto-Subtitle & Pembersih Suara |
| DELETE | `/video/:id` | 🎬 | Hapus (hanya bila belum ada tayangan) |
| POST | `/tayangan` | 🌐 | Catat satu tayangan (dipanggil pemutar video) |
| POST | `/tayangan/batch` | 🛠 | Catat banyak tayangan sekaligus (khusus admin: menerima IP dari body) |
| GET | `/tayangan` | 🌐 | Bukti mentah; filter `kampanyeId`, `hanyaDisaring` |

### Reputasi, Notifikasi, Sengketa, AI, Dashboard

| Metode | Rute | Akses | Keterangan |
|---|---|---|---|
| POST | `/ulasan` | 🔒 | Beri ulasan (hanya kampanye selesai yang Anda ikuti) |
| GET | `/ulasan` | 🌐 | Filter `penggunaId` atau `kampanyeId` |
| GET | `/ulasan/tertunda` | 🔒 | Kampanye selesai yang belum Anda ulas |
| GET | `/notifikasi` | 🔒 | Daftar notifikasi + jumlah belum dibaca |
| POST | `/notifikasi/baca` | 🔒 | Tandai semua terbaca |
| POST | `/notifikasi/:id/baca` | 🔒 | Tandai satu terbaca |
| POST | `/sengketa` | 🔒 | Ajukan sengketa (bukti data tayangan ikut dipotret) |
| GET | `/sengketa` | 🔒 | Sengketa saya; admin melihat semua |
| GET | `/sengketa/:id` | 🔒 | Rincian + data tayangan terkini |
| POST | `/sengketa/:id/putuskan` | 🛠 | Putuskan; bisa memulihkan tayangan yang tersaring |
| GET | `/ai/status` | 🌐 | Fitur AI mana yang aktif dan berbasis apa |
| POST | `/ai/naskah` | 🎬 | AI Script & Content Generator |
| GET | `/ai/naskah` | 🎬 | Riwayat naskah |
| POST | `/ai/ringkasan-laporan` | 🔒 | AI Auto-Report Summary |
| POST | `/ai/subtitle` | 🔒 | Segmentasi naskah jadi subtitle bertimestamp |
| GET | `/dashboard/umkm` | 🏪 | Semua data dashboard UMKM sekali panggil |
| GET | `/dashboard/kreator` | 🎬 | Semua data dashboard kreator sekali panggil |
| GET | `/dashboard/statistik-publik` | 🌐 | Angka untuk landing page & testimoni |

### Ruang Admin Platform (PRD §4.3)

| Metode | Rute | Akses | Keterangan |
|---|---|---|---|
| GET | `/admin/ringkasan` | 🛠 | Pengguna, kampanye, keuangan, anti-fraud, antrean |
| GET | `/admin/kampanye` | 🛠 | Neraca dana per kampanye + kolom selisih |
| GET | `/admin/konten` | 🛠 | Antrean moderasi video; filter `moderasi` |
| POST | `/admin/konten/:id/moderasi` | 🛠 | Loloskan atau minta revisi (wajib beralasan) |
| GET | `/admin/pengguna` | 🛠 | Daftar akun + status verifikasi; filter `peran` |
| POST | `/admin/pengguna/:id/verifikasi` | 🛠 | Beri/cabut badge terverifikasi, isi NIB |
| GET | `/admin/transaksi` | 🛠 | Buku transaksi seluruh platform; filter `jenis` |
| GET | `/admin/pembelajaran` | 🛠 | Ketepatan AI menurut keputusan manusia |
| GET | `/admin/pembelajaran/usulan` | 🛠 | Usulan ambang baru (sama dengan `npm run setel`) |

## Struktur Berkas

```
src/
  config.js            Konfigurasi terpusat (env + default)
  schema.sql           14 tabel; migrasi = "CREATE TABLE IF NOT EXISTS"
  index.js             Titik masuk server
  app.js               Perakitan Express + penanganan galat terpusat
  seed.js              Data contoh: 12 akun, 7 kampanye, ~28rb tayangan
  simulasi.js          Simulator trafik tayangan untuk demo anti-fraud
  lib/
    db.js              Koneksi SQLite + helper transaksi
    auth.js            scrypt, JWT, middleware peran
    util.js            Galat HTTP, ID, slug, hash IP, statistik
  services/
    escrow.js          Pay-Per-View, Rekber, dompet, penarikan
    antifraud.js       Dua lapis deteksi kecurangan tayangan
    matchmaker.js      Skoring kecocokan kreator ↔ kampanye
    ai.js              Claude + fallback template
    laporan.js         Agregasi statistik untuk dasbor
    notifikasi.js      Satu pintu pembuatan notifikasi
  routes/              12 berkas rute, satu per domain
tes/
  alur.test.js         23 tes: pendaftaran → kampanye → tayangan → dana → ulasan
  admin.test.js        23 tes: ruang admin, moderasi, sengketa, otorisasi
  asap.mjs             60 pemeriksaan terhadap server hidup + data seed
```

## Catatan Keamanan & Kepatuhan

- **Alamat IP tidak pernah disimpan mentah.** Yang tersimpan hanya hash SHA-256
  terpotong (`hashIp()`), cukup untuk mendeteksi pengulangan tanpa menyimpan
  data pribadi — relevan terhadap UU PDP (PRD §9).
- **Pesan galat masuk tidak membocorkan akun.** Email tidak terdaftar dan kata
  sandi salah menghasilkan pesan yang sama persis. `/auth/otp/kirim` mengikuti
  aturan yang sama: jawabannya netral, ada atau tidak akunnya.
- **Verifikasi email mengikat.** `/auth/masuk` menolak akun yang belum
  terverifikasi dengan `403` dan `rincian.perluVerifikasi`, sambil menerbitkan
  kode baru supaya pengguna tidak terjebak. Tanpa ini seluruh alur OTP hanya
  jadi layar yang bisa dilewati dengan membuka halaman Masuk.
- **Kode OTP punya batas.** Lima tebakan salah menghanguskan kodenya
  (`otp.percobaan`), permintaan kode baru harus berjarak 60 detik, dan satu
  identitas hanya boleh menerima 5 kode per jam — batas yang sama menahan
  penebakan sekaligus penyalahgunaan untuk membanjiri inbox orang lain.
  Pagarnya ada di basis data, jadi restart server tidak menghapusnya.
- **Rute `/api/auth` dibatasi 60 permintaan per menit per IP** (`lib/batas.js`,
  di memori — sah karena `numReplicas: 1`).
- **Rute tayangan sengaja publik** karena pemanggilnya adalah pemutar video di
  sisi penonton, bukan pengguna yang login. Pertahanannya bukan otentikasi,
  melainkan AI Anti-Fraud.
- **Penarikan besar (≥ Rp 2 juta) meminta verifikasi kedua**, mewakili
  kebutuhan otentikasi 2 faktor untuk transaksi besar di PRD §9.
- Ganti `JWT_SECRET` sebelum dipakai di luar mesin lokal. Server **menolak
  menyala** kalau `NODE_ENV=production` sementara `JWT_SECRET` masih nilai
  bawaan, dan memperingatkan keras kalau `BOCORKAN_OTP` masih aktif di sana.

## Yang Belum Dikerjakan

Jujur soal batas cakupan, supaya tidak ada klaim berlebihan:

- **Payment gateway sungguhan.** Setor dana dan penarikan mencatat mutasi di
  basis data, belum memanggil penyedia pembayaran. Titik integrasinya sudah
  terisolasi di `escrow.js`.
- **Speech-to-text sungguhan** untuk Auto-Subtitle. Yang jalan sekarang adalah
  segmentasi naskah menjadi potongan bertimestamp; PRD sendiri menandai fitur
  ini *should-have*.
- **Penyimpanan video di cloud/CDN.** Berkas disimpan di folder `unggahan/`
  lokal dan dilayani statis oleh Express.
- **Pemeriksaan legalitas usaha (NIB) yang sesungguhnya.** Admin sudah bisa
  mencatat NIB dan memberi/mencabut badge terverifikasi lewat
  `/admin/pengguna/:id/verifikasi`, tapi nomornya belum dicocokkan ke basis
  data resmi mana pun — PRD §15 sendiri masih menandai ini pertanyaan terbuka.
- **Moderasi konten masih menilai metadata**, bukan isi videonya. Admin
  memutuskan lolos/revisi berdasarkan judul, kampanye, dan tayangan; tidak ada
  analisis visual otomatis.
