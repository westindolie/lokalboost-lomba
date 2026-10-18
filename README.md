# LokalBoost

LokalBoost adalah marketplace kampanye promosi yang mempertemukan UMKM dengan kreator konten. UMKM membuat kampanye beserta brief, anggaran, target, dan materi produk. Kreator dapat bergabung, membuat konten dari akun media sosial yang terhubung ke profilnya, lalu mengirim tautan video untuk pemeriksaan.

Proyek ini merupakan aplikasi web berbahasa Indonesia yang berjalan sebagai demo dan dapat dikembangkan lebih lanjut.

## Fitur

- Akun dan dashboard untuk UMKM, kreator, dan admin.
- Profil usaha dan kreator, termasuk akun media sosial yang terhubung.
- Pembuatan kampanye, brief konten, target tayangan, anggaran, dan foto produk/usaha.
- Marketplace kampanye untuk kreator. Kreator dapat bergabung langsung tanpa menunggu persetujuan UMKM.
- Pengumpulan tautan video. Akun pengunggah harus sesuai dengan akun media sosial yang terhubung di profil kreator.
- Pemeriksaan AI untuk kecocokan konten dengan brief, moderasi, asisten naskah, dan ringkasan laporan.
- Pengukuran tayangan, penyaringan anti-fraud, Rekber, dompet, dan riwayat transaksi.
- Pembayaran kampanye melalui Midtrans Snap jika dikonfigurasi.

## Teknologi

- **Frontend:** React 18, Vite 5, React Router 6, Tailwind CSS 3, Motion 12.
- **Backend:** Node.js, Express 4, API berbasis JavaScript ESM.
- **Database:** SQLite untuk penggunaan lokal; libSQL/Turso tersedia untuk deployment.
- **AI:** Gemini, NaraRouter, OpenRouter, Anthropic, dan Way dapat dikonfigurasi sebagai penyedia AI.
- **Layanan pendukung:** Vercel, Midtrans Snap, ScrapeCreators, SMTP, dan Vercel Blob.

## Struktur proyek

```text
api/                  Adapter API untuk Vercel
lokalboost-api/       Backend Express, database, layanan, dan tes API
lokalboost-web/       Aplikasi React/Vite dan tes frontend
vercel.json           Konfigurasi build dan routing Vercel
```

## Menjalankan secara lokal

Gunakan Node.js 22 atau versi yang didukung oleh berkas `engines` di masing-masing paket.

Pasang dependensi dan isi database contoh:

```bash
npm ci --prefix lokalboost-api
npm ci --prefix lokalboost-web
npm run seed --prefix lokalboost-api
```

Jalankan backend di satu terminal:

```bash
npm run dev --prefix lokalboost-api
```

Jalankan frontend di terminal lain:

```bash
npm run dev --prefix lokalboost-web
```

Buka <http://localhost:5173>. Frontend development memakai API di `http://localhost:4000`. Endpoint kesehatan API: <http://localhost:4000/api/kesehatan>.

> `npm run seed` mengosongkan dan membuat ulang database lokal dengan data contoh. Jalankan hanya jika data lokal boleh direset.

### Akun demo

Semua akun hasil seed menggunakan kata sandi `lokalboost123`.

| Peran | Email |
|---|---|
| UMKM | `oleh@baksoaci.id` |
| UMKM | `busari@warungsunda.id` |
| Kreator | `rafi@kreator.id` |
| Kreator | `sari@kreator.id` |
| Admin | `admin@lokalboost.id` |

## Konfigurasi

Salin `lokalboost-api/.env.example` sebagai `lokalboost-api/.env`, lalu isi hanya variabel layanan yang digunakan. Jangan commit file `.env` atau kunci API.

Variabel yang umum dipakai:

| Variabel | Kegunaan |
|---|---|
| `JWT_SECRET` | Kunci penandatanganan sesi; ganti dengan nilai acak untuk lingkungan selain lokal. |
| `DB_PATH` | Lokasi database SQLite lokal. Jika kosong, backend memakai `lokalboost-api/lokalboost.db`. |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Koneksi database Turso/libSQL. |
| `GEMINI_API_KEY`, `NARA_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `WAY_API_KEY` | Penyedia fitur AI. Kunci yang kosong membuat penyedia tersebut tidak digunakan. |
| `SCRAPECREATORS_API_KEY` | Pembacaan profil dan data konten dari platform sosial yang didukung. |
| `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY` | Pembayaran Rekber melalui Midtrans Snap. Tanpa kunci, alur pembayaran memakai simulasi. |
| `MIDTRANS_PRODUKSI` | Setel `ya` hanya jika memang ingin memakai kunci Midtrans produksi dan memproses pembayaran sungguhan. |
| `SMTP_HOST`, `SMTP_PENGGUNA`, `SMTP_SANDI`, `SMTP_DARI` | Pengiriman email, termasuk kode verifikasi. |

Lihat `lokalboost-api/.env.example` dan `lokalboost-api/src/config.js` untuk daftar dan nilai bawaan yang lebih lengkap.

## Pengujian dan build

```bash
npm test --prefix lokalboost-api
npm test --prefix lokalboost-web
npm run build --prefix lokalboost-web
```

## Deployment

Proyek terhubung ke Vercel. Konfigurasi di `vercel.json` membangun frontend, membuat snapshot database demo, dan menyiapkan API sebagai Vercel Function. Dalam konfigurasi demo saat ini, deployment dapat membuat database demo baru dari seed; perubahan data demo tidak dijamin bertahan setelah deployment berikutnya.

Alamat produksi: <https://lokalboost-web.vercel.app>.
