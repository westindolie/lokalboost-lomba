# Menerbitkan LokalBoost

Satu proyek Vercel melayani semuanya dari satu alamat:
<https://lokalboost-web.vercel.app>

| Bagian | Jalan sebagai | Diatur oleh |
|---|---|---|
| `lokalboost-web` | Situs statis hasil build Vite | `outputDirectory` di `vercel.json` |
| `lokalboost-api` | Satu Vercel Function (`api/index.js` membungkus `buatApp()`) | `functions` + `rewrites` di `vercel.json` |
| Basis data | Turso (libSQL) lewat Vercel Marketplace | env `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` |

Karena frontend dan API tinggal di asal yang sama, frontend memanggil `/api/...`
secara relatif. **Tidak ada `VITE_API_URL`** yang perlu dipasang atau di-build ulang.

> **Deploy selalu dari AKAR repo** (folder `INFEST LOMBA`), bukan dari
> `lokalboost-web`. Folder `.vercel` dan `vercel.json` ada di akar.

---

## 1. Kenapa butuh Turso

Vercel tidak punya disk permanen. Tanpa Turso, `api/index.js` menyalin basis
data demo ke `/tmp` di **setiap instance**, jadi tulisan di satu instance tidak
terlihat di instance lain. Terukur: 14 dari 15 kampanye baru "hilang" (404)
karena permintaan berikutnya jatuh ke instance berbeda. Frontend memasang pita
"mode demo" selama keadaan ini.

Dengan Turso, data asli tinggal di Turso; `/tmp` hanya berisi replika yang
disinkron di awal setiap permintaan (`lib/db.js` + middleware di `app.js`).
Driver `libsql` punya API yang sama dengan better-sqlite3, jadi tidak ada query
yang berubah.

Untuk menayangkan demo saat operasi baca Turso dibatasi, atur env Vercel
`PAKAI_TURSO=false`. Build akan melewati pengisian Turso, function memakai
snapshot SQLite dan otomatis mengaktifkan `MODE_DEMO`. Data contoh bisa dibaca,
tetapi tulisan hanya bertahan pada instance function yang menerimanya dan
kembali ke snapshot saat instance baru dibuat. Hapus atau ubah nilai itu setelah
akses baca Turso pulih agar data bersama aktif lagi.

## 2. Sambungkan Turso (sekali saja, lewat browser)

1. Vercel → proyek **lokalboost-web** → **Storage** → **Create Database** → **Turso**
2. Region **us-east** (dekat region function), paket gratis
3. **Connect** ke proyek, centang **Production** dan **Preview**

Cek nama variabel yang dipasang:

```bash
npx vercel@latest env ls production
```

Kode menerima `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` maupun
`LIBSQL_URL`/`LIBSQL_AUTH_TOKEN`. Kalau integrasi memakai nama lain, tambahkan
ke `config.turso` di `lokalboost-api/src/config.js` **dan** ke `pakaiTurso` di
`api/index.js`.

## 3. Isi data awal ke Turso (otomatis saat build)

Variabel dari integrasi Turso bertanda **Sensitive**: `vercel env pull` hanya
memberi teks `[SENSITIVE]`, jadi Turso **tidak bisa** diisi dari laptop dengan
nilai itu. Nilai aslinya terbaca saat build, maka build yang mengisinya
(`isi-turso.js --lewati-tanpa-turso` di `buildCommand`):

| Keadaan Turso | Yang terjadi saat build |
|---|---|
| Kosong | Diisi data contoh dari snapshot (~38 ribu baris, ~20 detik). |
| Terisi lengkap | Dilewati, data tidak disentuh. |
| Terisi setengah (pengisian lama terputus) | Dikosongkan lalu diisi ulang. Dikenali dari tabel penanda `isi_turso_selesai` yang ditulis paling akhir. |
| Tanpa env Turso | Dilewati, situs jalan di mode demo. |

**Mengembalikan Turso ke data contoh** (misalnya sebelum dinilai juri, setelah
banyak data uji):

```bash
# di akar repo; pilih environment deploy yang akan dipakai untuk mengisi
printf 'ya' | npx vercel@latest env add ISI_ULANG_TURSO production
npx vercel@latest deploy --prod --yes
npx vercel@latest env rm ISI_ULANG_TURSO production --yes   # WAJIB langsung dihapus
```

> Selama `ISI_ULANG_TURSO` masih terpasang, **setiap deploy menghapus seluruh
> data** dan mengembalikannya ke data contoh. Preview dan Production memakai
> basis data Turso yang sama.

Mengisi manual dari laptop tetap bisa, tapi butuh URL dan token asli yang
dibuat di dasbor Turso (bukan hasil `env pull`):
`node --env-file=../.env.turso src/isi-turso.js [--timpa]`.

## 4. Variabel lingkungan

Sudah terpasang di Production (dicek 16 Sep 2026):

| Variabel | Catatan |
|---|---|
| `JWT_SECRET` | Buat sendiri: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Server menolak menyala di produksi tanpa ini. Nilai lama yang pernah tertulis di riwayat git dianggap hangus. |
| `BOCORKAN_OTP=false` | Kode OTP hanya lewat email. Juri pakai akun demo. |
| `BATAS_UNGGAH_MB=4` | Body request Vercel dibatasi ~4,5 MB. |
| `ALAMAT_SITUS` | Tujuan tombol di email notifikasi. |
| `ASAL_DIIZINKAN` | Asal CORS; pola `https://*.vercel.app` untuk URL pratinjau. |
| `KOMISI_PERSEN` | Potongan platform dari bagian kreator. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_PENGGUNA`, `SMTP_SANDI`, `SMTP_DARI` | `SMTP_SANDI` = App Password Gmail yang sama dengan `lokalboost-api/.env`. |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Dipasang otomatis oleh integrasi di langkah 2. |
| `BLOB_READ_WRITE_TOKEN` | Dipasang otomatis oleh `npx vercel@latest blob create-store lokalboost-video --access public --yes`. Tempat tinggal video unggahan; tanpa ini berkas kembali ke `/tmp` dan bisa hilang. |
| `OPENROUTER_API_KEY` | Opsional. Menyalakan AI generatif lewat OpenRouter (ada model gratis). Didahulukan bila `ANTHROPIC_API_KEY` juga ada. |
| `OPENROUTER_MODEL` | Bawaan `deepseek/deepseek-v4-flash-0731:free`. **Wajib model yang mendukung `structured_outputs`**, lihat `npm run model-openrouter`. Model lain akan membuat fitur AI diam-diam memakai template. |
| `AI_BATAS_DETIK` | Bawaan `20`. Batas tunggu satu panggilan model. **Harus lebih kecil dari `maxDuration` fungsi (30 detik)**, kalau tidak Vercel membunuh fungsi sebelum jatuh-ke-template sempat jalan dan pengguna menerima 504. |
| `OPENROUTER_REASONING` | Bawaan `low`. Isi `low`/`medium`/`high`/`off`. Model penalaran tanpa kendali ini menghabiskan `max_tokens` untuk menalar dan JSON-nya tidak pernah selesai (diukur: 16.000 token mentok, vs 1.896 token pada `low`). |
| `ANTHROPIC_API_KEY` | Opsional. Menyalakan AI generatif lewat Claude langsung. |
| `ANTHROPIC_MODEL` | Opsional, bawaan `claude-opus-5`. |

> **Jangan pasang `NODE_ENV=production` di panel Vercel.** `npm ci` saat build
> jadi melewati devDependencies dan build Vite gagal. `api/index.js` sudah
> menyetelnya sendiri saat function berjalan.

Menambah atau mengubah variabel tidak mengubah deploy yang sudah tayang: deploy
ulang setelahnya.

## 5. Deploy

```bash
# di akar repo
npx vercel@latest deploy --yes          # pratinjau
npx vercel@latest deploy --prod --yes   # produksi
```

Yang terjadi saat build (`vercel.json`): `npm ci` di kedua folder, build Vite,
lalu `snapshot-demo.js` membuat `lokalboost-api/demo/lokalboost-demo.db` yang
ikut dibundel ke function (dipakai hanya kalau Turso belum tersambung).

## 6. Pastikan benar-benar jalan

```bash
curl https://lokalboost-web.vercel.app/api/kesehatan
```

Periksa `modeDemo`: harus `false` setelah Turso tersambung. Lalu:

```bash
cd lokalboost-api
API_URL=https://lokalboost-web.vercel.app npm run asap
```

Harus berakhir `gagal 0`. Uji asap mematok angka data contoh (misalnya tepat 7
kampanye), jadi jalankan pada Turso yang baru diisi ulang; setelah ada data
baru, 2 pemeriksaan itu gagal walau situsnya sehat. Pemeriksaan OTP dilewati
karena kodenya hanya dikirim lewat email.

Uji juga bahwa tulisan tidak hilang antar-instance: buat beberapa kampanye
beruntun lalu buka satu per satu; tidak boleh ada yang 404. Terukur 16 Sep
2026 di pratinjau: 15 kampanye paralel hilang 0, dan 15 setoran Rekber paralel
berhasil semua tanpa transaksi dobel.

Pratinjau dilindungi login Vercel. Untuk menguji dari terminal, buat tautan
berbagi di dasbor (atau lewat MCP Vercel), buka sekali dengan `curl -c` untuk
mendapat cookie `_vercel_jwt`, lalu kirim cookie itu di setiap permintaan.

## Batasan yang disadari

- **Video unggahan** tersimpan di Vercel Blob (store `lokalboost-video`,
  akses publik) sehingga bertahan lintas instance dan lintas deploy. Yang
  disimpan di kolom `video.berkas` adalah URL Blob-nya. Tanpa
  `BLOB_READ_WRITE_TOKEN`, kode jatuh ke perilaku lama: berkas di
  `FOLDER_UNGGAHAN` dan dilayani `express.static` - itulah yang dipakai saat
  menjalankan API di server sendiri. Batas unggah tetap 4 MB karena badan
  permintaan Vercel dibatasi ~4,5 MB.
- **Turso memberi satu database per deployment.** Integrasi Turso di Vercel
  menyuntikkan URL berawalan `dpl-<id deployment>`, jadi setiap deploy
  memulai dari database kosong lalu diisi ulang dari snapshot saat build
  (lihat baris `[TURSO] host=` dan `[TURSO] tabel terlihat=` di log build).
  Konsekuensinya: **data yang dibuat di produksi hilang pada deploy
  berikutnya**, dan `ISI_ULANG_TURSO` tidak dibutuhkan untuk "mereset
  produksi" karena deploy biasa sudah melakukannya. Untuk lomba ini justru
  menguntungkan, juri selalu melihat data contoh yang rapi. Kalau suatu saat
  data harus bertahan, arahkan `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` ke
  database tetap dari dasbor Turso, menimpa nilai dari integrasi.
- **AI generatif di produksi dibatasi 20 detik.** Model lambat tidak akan
  menggagalkan permintaan: hasilnya template, dan sebabnya tercatat di log
  fungsi dengan awalan `[AI]`. Model gratis OpenRouter diukur 37 detik pada
  18 Sep 2026, jadi di produksi praktis selalu template. Untuk benar-benar
  memakai model di produksi, butuh model yang menjawab di bawah 20 detik.
- **Model gratis OpenRouter punya kuota harian.** Bila habis, balasannya
  `429 free-models-per-day` dan SEMUA model gratis ikut terkunci sampai
  hari berikutnya. Menambah 10 kredit sekali di OpenRouter menaikkan batas
  harian secara signifikan.
- **Cold start** pertama menyinkron replika dari Turso (~3 detik), jadi
  permintaan pertama setelah function tidur lebih lambat. Tulis juga lebih
  lambat dari lokal (~1 detik per kampanye baru saat banyak paralel).
- **Transaksi uang** memakai `BEGIN IMMEDIATE` dan diulang otomatis bila Turso
  membalas `SQLITE_BUSY` (maks 8 kali / 8 detik, lalu galat 503 "coba lagi").
  Log fungsi memberi awalan `[SIBUK]` setiap kali ini terjadi.
- Kalau semua tombol diam-diam rusak, cek dulu bahwa `/api/kesehatan` membalas
  JSON, bukan HTML `index.html` (tanda rewrite `/api` tidak mengenai function).

## Yang tidak ikut ke server

Vercel CLI **tidak membaca `.gitignore`**; yang menahan berkas adalah
`.vercelignore` di akar:

| Berkas | Alasan |
|---|---|
| `.env`, `.env.*` | App Password Gmail dan token Turso. Nilainya lewat panel Vercel. |
| `*.db` | Basis data pengembangan. Snapshot demo dibuat ulang saat build. |
| `unggahan/`, `node_modules`, `dist` | Dibuat ulang atau tidak dibutuhkan. |

## Kalau function gagal

Vercel → proyek → **Logs**, atau:

```bash
npx vercel@latest logs https://lokalboost-web.vercel.app
```

- Galat awal menyebut `JWT_SECRET` → variabel belum terpasang di environment itu.
- `SMTP DITOLAK` → `SMTP_SANDI` salah atau bukan App Password.
- `modeDemo: true` padahal Turso sudah disambungkan → nama env tidak dikenali
  (lihat langkah 2) atau belum deploy ulang.

---

`lokalboost-api/railway.json` dan skrip `mulai:railway` masih ada untuk jalur
server ber-disk, tapi tidak dipakai: hosting diputuskan 100% Vercel.

## Midtrans (setor dana Rekber)

Tanpa `MIDTRANS_SERVER_KEY`, setor dana tetap **simulasi** seperti dulu. Dengan
kunci, jalur simulasi `POST /api/kampanye/:id/setor` ditutup dan escrow hanya
diisi pembayaran yang sudah dikonfirmasi Midtrans.

1. Daftar sandbox: https://dashboard.sandbox.midtrans.com → Settings → Access Keys.
2. Isi `lokalboost-api/.env` (laptop) dan env Vercel (produksi):
   `MIDTRANS_SERVER_KEY=SB-Mid-server-...`, `MIDTRANS_CLIENT_KEY=SB-Mid-client-...`.
   Bawaannya sandbox. `MIDTRANS_PRODUKSI=ya` HANYA untuk uang sungguhan.
3. Dashboard Midtrans → Settings → Payment → Notification URL:
   `https://lokalboost-web.vercel.app/api/pembayaran/notifikasi`.
4. Di laptop notifikasi tidak bisa masuk (localhost). Tidak apa-apa: setelah
   popup ditutup frontend memanggil `POST /api/pembayaran/:orderId/cek`, dan
   UMKM bisa menekan **Cek Status Pembayaran** / **Lanjutkan Pembayaran**.
5. Bayar uji: VA dibayar lewat https://simulator.sandbox.midtrans.com, QRIS/GoPay
   lewat simulator yang sama.

Tagihan berstatus `perlu_tinjau` = uang sudah diterima Midtrans tetapi escrow
menolak (kampanye sudah didanai tagihan lain, atau nominal berbeda). Admin
mendapat notifikasi; refund dilakukan manual dari dashboard Midtrans.

**Jangan pakai kunci produksi selama database produksi masih diganti tiap
deploy** (cabang Turso per-deployment): catatan pembayaran ikut hilang.
