# Membagikan LokalBoost ke Teman

Satu perintah, satu tautan. Teman bisa membukanya dari HP atau laptop mereka
di mana pun — tidak perlu menginstal apa pun, tidak perlu satu WiFi.

```bash
cd lokalboost-api
npm run bagikan
```

Tunggu sekitar 30 detik, lalu terminal mencetak:

```
  Kirim tautan ini ke teman kamu:

      https://xxxx-xxxx-xxxx.trycloudflare.com
```

Salin tautannya, kirim ke teman. Selesai.

---

## Yang perlu kamu tahu sebelum mengirim

**Tautannya hidup selama jendela terminal itu terbuka.** Tutup terminal atau
matikan laptop → tautannya mati. Ini cara berbagi cepat, bukan penyebaran
(*deployment*). Kalau temanmu perlu akses kapan saja tanpa laptopmu menyala,
itu pekerjaan yang berbeda — lihat `DEPLOY.md`.

**Alamatnya berganti setiap kali dijalankan.** Cloudflare Quick Tunnel
memberi nama acak baru tiap sesi. Jangan menyimpan tautan lama.

**Laptopmu jadi servernya.** Semua yang temanmu lakukan berjalan di mesinmu
dan mengubah basis data demo di `lokalboost-api/lokalboost.db`. Untuk
mengembalikannya seperti semula:

```bash
npm run seed
```

---

## Yang disetel otomatis untuk sesi berbagi

Skrip `bagikan` mengubah tiga hal **hanya untuk sesi itu** — berkas `.env`
tidak disentuh sama sekali:

| Yang disetel | Kenapa |
|---|---|
| `JWT_SECRET` diacak baru | Nilai bawaannya ada di dalam repositori. Siapa pun yang pernah membacanya bisa memalsukan token, dan tautan ini publik. |
| SMTP dimatikan | Supaya tidak ada email keluar dari akun Gmail pribadimu, dan kuota kirimnya tidak terpakai. |
| `BOCORKAN_OTP=true` | Konsekuensi dari poin di atas: kode verifikasi muncul langsung di layar teman, jadi mereka tidak perlu membuka email. |

## Akun yang bisa dicoba teman

Halaman Masuk punya tombol isi-otomatis untuk dua akun pertama:

| Peran | Email | Kata sandi |
|---|---|---|
| UMKM | `busari@warungsunda.id` | `lokalboost123` |
| Kreator | `rafi@kreator.id` | `lokalboost123` |
| Admin | `admin@lokalboost.id` | `lokalboost123` |

Akun **admin sengaja tidak ada tombolnya** — ruang admin bisa memutus sengketa
dan membaca seluruh buku transaksi, jadi kredensialnya tidak ditaruh di
halaman yang bisa dibuka siapa pun. Ketik manual kalau mau menunjukkannya.

Teman juga bisa mendaftar akun baru dengan email apa pun (bahkan yang
karangan) — kode verifikasinya muncul di layar mereka sendiri.

---

## Kalau ada yang aneh

| Gejala | Sebabnya |
|---|---|
| `cloudflared` tidak ditemukan | Unduh dari [releases cloudflared](https://github.com/cloudflare/cloudflared/releases), lalu jalankan `CLOUDFLARED=<path ke cloudflared.exe> npm run bagikan` |
| Port 4000 sudah dipakai | Masih ada backend lama hidup. Tutup terminalnya, atau `PORT=4100 npm run bagikan` |
| Halaman putih di sisi teman | Build frontend gagal. Jalankan `npm run build` di `lokalboost-web` dan baca galatnya |
| Teman melihat data aneh | Basis data demo sudah berubah karena dipakai. `npm run seed` mengembalikannya |

---

## Kenapa satu alamat, bukan dua

Sebelum ini frontend (port 5173) dan backend (port 4000) hidup terpisah.
Membagikannya berarti dua alamat, dan dua masalah yang menyertainya:

1. **Alamat backend ditanam ke dalam bundel saat build.** Vite menyalin
   `VITE_API_URL` ke dalam berkas JS pada waktu `npm run build`, bukan saat
   dijalankan. Setiap kali alamat terowongan berganti — dan itu terjadi tiap
   sesi — frontend harus dibangun ulang. Melewatkannya berarti situs menunjuk
   backend yang tidak ada, dan gejalanya cuma "Tidak bisa menghubungi server".
2. **CORS.** Alamat frontend yang baru harus didaftarkan ke `ASAL_DIIZINKAN`
   di backend, setiap kali.

Sekarang backend sekalian melayani frontend hasil build (`FOLDER_WEB`),
sehingga keduanya satu asal. Frontend memanggil `/api/...` secara relatif —
tidak ada alamat yang ditanam, tidak ada permintaan lintas asal, dan kedua
masalah di atas hilang. Cara kerja sehari-hari tidak berubah: `npm run dev`
di dua terminal tetap seperti biasa.
