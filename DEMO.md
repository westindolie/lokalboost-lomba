# Menjalankan LokalBoost untuk Presentasi

Ada dua cara memperagakan:

| Cara | Kapan dipakai |
|---|---|
| **Online** di <https://lokalboost-web.vercel.app> | Default. Juri bisa membuka sendiri dari HP. |
| **Laptop** (dua terminal di bawah) | Cadangan kalau internet panggung buruk, atau perlu kode OTP tampil di layar. |

### Perbedaan yang perlu diingat saat demo online

- **Kode OTP tidak tampil di layar** (`BOCORKAN_OTP=false`). Kodenya hanya
  masuk ke email, jadi untuk memperagakan pendaftaran siapkan inbox yang bisa
  dibuka. Untuk alur lain, pakai akun demo di bawah.
- Cek sebelum naik panggung:
  `curl https://lokalboost-web.vercel.app/api/kesehatan` harus berisi
  `"status":"sehat"` dan `"modeDemo":false`. Kalau `modeDemo` bernilai `true`,
  basis data tidak tersambung dan data baru bisa hilang saat berpindah
  halaman; peragakan alur yang membuat data dari laptop.
- **Jangan deploy ulang setelah tester mulai mengisi data.** Setiap deploy
  produksi mengganti basis data dengan seed yang bersih.
- **Video unggahan maksimal 4 MB** dan bisa hilang setelah beberapa waktu.
- Buka situsnya sekali beberapa menit sebelum tampil: permintaan pertama
  setelah function tidur terasa lambat.

Langkah penerbitannya ada di `DEPLOY.md`.

## Demo dari laptop

Butuh dua terminal, dan **backend harus lebih dulu**: frontend tidak punya
data sendiri sama sekali.

### Terminal 1 — backend

```bash
cd lokalboost-api
npm run seed     # kembalikan ke data contoh yang bersih
npm run dev      # port 4000
```

Tunggu sampai muncul:

```
  LokalBoost API
  Berjalan di      http://localhost:4000
  Kode OTP         dikirim lewat smtp.gmail.com sebagai liewestindo02@gmail.com
```

Baris **Kode OTP** itu yang menentukan. Kalau berbunyi `SMTP DITOLAK`, App
Password Gmail sudah tidak berlaku — biasanya karena verifikasi 2 langkah di
akun Google dimatikan. Kalau berbunyi `dicetak ke log`, berkas `.env` tidak
terbaca.

> `npm run seed` menghapus seluruh akun yang dibuat sejak seed terakhir.
> Jalankan sebelum presentasi, jangan di tengah-tengahnya.

### Terminal 2 — frontend

```bash
cd lokalboost-web
npm run dev      # port 5173
```

Buka <http://localhost:5173>.

### Alur UMKM ke kreator tanpa views sungguhan

Mode demo membuat biaya pasang dan setor anggaran kampanye menjadi simulasi.
Setelah kreator mengirim tautan video yang disetujui, tombol **Selesaikan demo
dan masukkan saldo** membagi anggaran tunai kepada kreator yang videonya
diterima. Sistem tidak membuat tayangan palsu; laporan tetap menunjukkan views
yang benar-benar ada. Saldo demo terlihat di dompet, tetapi penarikan dinonaktifkan.

Aktifkan hanya untuk presentasi:

```powershell
$env:MODE_DEMO = "true"
cd lokalboost-api
npm.cmd run seed   # menghapus data lokal dan mengisi akun contoh
npm.cmd run dev
```

Lalu di situs lokal:

1. UMKM buat kampanye reward tunai dan tentukan anggaran sendiri. Mode demo
   melewati biaya pasang, pemeriksaan etika tetap berjalan, lalu anggaran
   simulasi masuk ke Rekber.
2. Kreator masuk ke marketplace dan langsung mengikuti kampanye. Tidak ada
   undangan atau persetujuan UMKM. Untuk demo, kreator tidak perlu
   menghubungkan akun sosial; mode normal tetap mensyaratkan profil dan
   verifikasi minimal satu akun sosial.
3. Kreator kirim tautan video. Video tetap harus lolos pemeriksaan AI/UMKM,
   tetapi jumlah views tidak menjadi syarat demo.
4. Setelah video berstatus tayang, kreator tekan **Selesaikan demo dan masukkan
   saldo** dari dashboard. Anggaran dibagi rata kepada para kreator yang
   sudah mengirim video yang disetujui. Kampanye ditutup dan sisa dana, bila
   ada, kembali ke dompet UMKM.

Transaksi simulasi diberi awalan `DEMO:`. Jangan pakai mode ini untuk transaksi
atau saldo sungguhan. Untuk demo online, `MODE_DEMO=true` harus diatur pada
Environment Variables Vercel lalu proyek di-deploy ulang. Itu akan membuat
deployment produksi berjalan dalam mode simulasi; jangan aktifkan jika situs
sedang dipakai untuk transaksi nyata.

## Akun untuk diperagakan

| Peran | Email | Kata sandi |
|---|---|---|
| UMKM | `busari@warungsunda.id` | `lokalboost123` |
| Kreator | `rafi@kreator.id` | `lokalboost123` |
| Admin | `admin@lokalboost.id` | `lokalboost123` |

Tombol UMKM dan Kreator di halaman Masuk mengisi formulir otomatis. **Admin
sengaja tidak ada tombolnya** — ketik sendiri kalau ingin memperagakan ruang
moderasi. Alasannya: kredensial di halaman itu ikut terbaca siapa pun yang
membuka situs, dan ruang admin bisa memutus sengketa serta membaca seluruh
buku transaksi.

## Memperagakan verifikasi email sungguhan

Ini bagian yang paling meyakinkan, karena emailnya betul-betul terkirim:

1. Buka **Daftar gratis** → pilih peran → isi data dengan **alamat email
   sungguhan** milikmu.
2. Kode 6 digit masuk ke inbox itu dalam beberapa detik (cek juga tab Promosi).
3. Di laptop, layar verifikasi juga menampilkan kodenya karena
   `BOCORKAN_OTP=true` di `.env`, jadi tidak perlu membuka HP di depan juri.
   Di situs online kode **hanya** lewat email.

Yang bisa ditunjukkan kalau ada yang menantang keamanannya:

- **Salah kode 5 kali** → kodenya hangus, harus minta yang baru.
- **Tekan "Kirim ulang" sebelum 60 detik** → ditolak dengan sisa waktunya.
- **Coba masuk dengan akun yang belum diverifikasi** → ditolak, lalu diantar
  ke layar kode. Bukan sekadar pesan merah.
- **Minta kode untuk email yang tidak terdaftar** → jawabannya sama persis
  dengan email yang terdaftar, jadi tidak bisa dipakai memetakan siapa yang
  punya akun di sini.

## Memperagakan 2FA penarikan dana

Kartu paling kuat kalau juri bertanya soal keamanan uang. Masuk sebagai
kreator `sari@kreator.id` → **Dompet Saya** (`/kreator/dompet`) → isi nominal
**di atas Rp 2 juta**. Kolom "Kode Verifikasi Tambahan" muncul beserta tombol
**Kirim Kode**.

> Saldo `sari` = **Rp 2.850.000**, jadi nominal yang sah untuk memicu 2FA ada
> di rentang **Rp 2.000.001 - Rp 2.850.000**. Pakai **2.500.000**. Di atas
> saldo, yang muncul lebih dulu adalah penolakan "Saldo tidak cukup", bukan
> peragaan 2FA-nya.

Urutannya penting: **Kirim Kode dulu, baru isi kode asal-asalan.** Kalau kode
asal-asalan diisi sebelum ada kode yang diminta, yang keluar adalah "Tidak ada
kode aktif untuk akun ini", bukan peragaan tebakan yang dibatasi.

- **Tekan Kirim Kode** → kode masuk ke email pemilik dompet (di laptop juga
  langsung terisi di layar; hapus dulu isinya untuk langkah berikut).
- **Isi kode asal-asalan** → ditolak: "Kode salah. Sisa 4 percobaan."
  Diuji ulang lewat antarmuka 21 Sep.
- **Isi kode yang benar** → penarikan diproses (di laptop).
- **Pakai kode yang sama dua kali** → yang kedua ditolak; kode sekali pakai.
- **Pakai kode yang tadi dipakai untuk masuk** → ditolak juga. Kode terikat
  pada tindakannya; kode untuk masuk tidak bisa mencairkan uang.

**Batasan online yang harus diketahui sebelum naik panggung:** penarikan yang
BERHASIL tidak bisa diperagakan di situs online. Semua akun seed memakai domain
palsu (`sari@kreator.id`), jadi "Kirim Kode" menjawab 200 dan bilang "cek
inbox", tapi kodenya tidak sampai ke mana pun. Akun daftar-sendiri dengan email
sungguhan juga tidak menolong: saldonya nol, jadi tidak pernah menyentuh ambang
Rp 2 juta, dan aplikasi belum punya fitur ubah email. Online cukup tunjukkan
kolom 2FA muncul + kode salah ditolak; **jalur sampai dana cair peragakan dari
laptop** (`BOCORKAN_OTP=true` menampilkan kodenya di layar).

Kalau saldo akun demo belum mencapai ambang, tutup satu kampanye lebih dulu
supaya dananya cair, atau turunkan `AMBANG_2FA` sementara di
`src/services/escrow.js`.

## Memperagakan lupa kata sandi

Halaman Masuk → **Lupa kata sandi?** → masukkan email akun → kode dikirim →
isi kode + sandi baru → langsung masuk tanpa perlu mengetik sandi barunya
lagi. Untuk email yang tidak terdaftar, jawabannya sama persis.

## Memperagakan "AI-nya belajar dari mana?"

Ini pertanyaan yang hampir pasti muncul. Alurnya:

1. Masuk sebagai **kreator** → Pusat Sengketa → ajukan sengketa kategori
   *penyaringan anti fraud keliru*.
2. Masuk sebagai **admin** → Ruang Admin → Antrean Sengketa → putuskan
   memihak kreator sambil memilih alasan penyaringan yang dipulihkan.
3. Masih di Ruang Admin, gulir ke panel **Ketepatan AI** — tingkat
   salah-saring aturan itu langsung melonjak dan ditandai merah.
4. Tepat di bawahnya, panel **Usulan Penyetelan** menampilkan angka barunya
   lengkap dengan buktinya dan baris `.env` yang tinggal disalin.

Kalimat penutupnya: sistem ini tidak menyetel dirinya sendiri, dan itu
disengaja — penjelasannya ada di `MELATIH-AI.md`.

## Memperagakan AI Portfolio Auto-builder

Ini peragaan paling kuat untuk pertanyaan "apa bedanya dengan marketplace
kreator biasa", karena yang ditunjukkan bukan fiturnya melainkan kejujurannya.

1. Buka profil publik kreator **tanpa login sama sekali**:
   `/kreator/profil/krtr_sari`. Tunjuk kartu **Portofolio Otomatis** dan
   ketiga lencananya yang sengaja berbeda warna.
2. Satu kalimat per lapis:
   - **Terverifikasi LokalBoost** (hijau) — dihitung platform dari kampanye
     selesai dan tayangan yang lolos anti-fraud. Kreator tidak bisa mengubahnya.
   - **Dikonfirmasi TikTok** (biru) — ditanyakan langsung ke TikTok. Yang
     dikonfirmasi kepemilikan karyanya, bukan performanya.
   - **Dilaporkan kreator** (abu) — diketik sendiri, tidak diverifikasi siapa pun.
3. Masuk sebagai **kreator** → menu **Portofolio Saya** → tempel tautan TikTok
   sungguhan. Centang "Dikonfirmasi TikTok" muncul beserta nama akunnya.
   Lalu tempel tautan Instagram, dan tunjukkan bahwa ia **tetap disimpan tanpa
   centang**: bukan ditolak, bukan dipaksa terlihat sah.

Kalimat penutupnya: platform lain memajang angka pengikut tanpa menyebut dari
mana asalnya. Di sini setiap angka membawa label asal-usulnya, termasuk yang
tidak bisa kami verifikasi.

> Kalau ditanya kenapa statistik TikTok tidak diambil otomatis: memang tidak
> bisa. oEmbed TikTok tidak memuat satu pun field statistik, halaman profilnya
> dijaga tembok anti-bot, dan oEmbed Instagram sudah dipensiunkan. Mengaku
> "diambil otomatis" berarti berbohong ke UMKM.

> Konfirmasi TikTok sudah diuji langsung DARI PRODUKSI pada 21 Sep 2026, bukan
> cuma dari laptop: tautan `@scout2015` dikonfirmasi benar lewat
> `lokalboost-web.vercel.app`. Kekhawatiran bahwa TikTok memblokir alamat IP
> pusat data ternyata tidak terbukti, jadi langkah 3 aman diperagakan online.
>
> Kalau suatu saat centangnya tetap tidak muncul, itu bukan kerusakan:
> tautannya tetap tersimpan tanpa centang, dan itu memang perilaku yang
> dirancang. Tunjukkan saja apa adanya.

## Memperagakan Asisten Naskah + Subtitle dari suara (Gemini)

1. Masuk sebagai **kreator** → menu **Asisten Naskah** → pilih kampanye →
   pilih gaya → **Buatkan Naskah**. Chip di kanan atas kartu menyebut
   sumbernya: "Dibuat AI Gemini" atau "Disusun dari template brief". Tunjuk
   juga kartu **Ide Konten Lain**.
2. Tekan **Lanjut ke Unggah Video**: naskahnya ikut terbawa ke kolom naskah.
3. Unggah video yang ADA SUARA ORANG BICARA (maks 4 MB saat online). Hasilnya:
   subtitle bertanda "dari suara" = Gemini benar-benar mendengarkan video;
   "dari naskah" = transkripsi gagal dan subtitle dipecah dari naskah.
   Kartu **Pemeriksa Suara** memberi nilai jernih/cukup/bising + satu saran.
   AI tidak membersihkan audionya, hanya memeriksa. Jangan klaim lebih.

Bukti cepat dari terminal: `npm run cek-ai` (naskah + laporan).

## Kalau ada yang aneh

| Gejala | Sebabnya hampir selalu |
|---|---|
| Semua halaman kosong / "Tidak bisa menghubungi server" | Backend belum jalan, atau sudah mati di Terminal 1 |
| Angka di beranda nol semua | Basis data kosong — jalankan `npm run seed` |
| Kode OTP tidak sampai ke inbox | Lihat baris `Kode OTP` saat backend menyala |
| Port 4000 dipakai | Masih ada backend lama hidup; tutup terminalnya |

Untuk memastikan semuanya sehat sebelum naik panggung, dengan backend hidup:

```bash
cd lokalboost-api
npm run seed     # asap mengandalkan data seed yang segar
npm run asap     # 101 pemeriksaan terhadap server yang sedang berjalan
```

Harus berakhir `Lulus 101, gagal 0`.

**Jangan jalankan `npm run asap` ke situs online.** Skrip itu membuat akun
"Kreator Uji Asap", mengunggah video, dan mengirim tayangan, jadi data yang
dilihat juri dan tester ikut kotor. Untuk situs online cukup cek
`/api/kesehatan` seperti di bagian atas, lalu buka beberapa halaman.
