# Cara Melatih AI LokalBoost

Dokumen ini menjawab dua pertanyaan yang sering tercampur: **apa yang sebenarnya "AI" di LokalBoost**, dan **bagaimana ia bisa jadi lebih pintar dari hari ke hari**.

Jawaban singkatnya: dari lima fitur AI, hanya dua yang benar-benar bisa dilatih — dan "melatih" di sini artinya menggeser **sepuluh angka** berdasarkan keputusan manusia yang sudah tercatat, bukan menjalankan proses training.

---

## 1. Lima fitur AI dan sifat masing-masing

| Fitur | Jenisnya | Bisa "dilatih"? |
|---|---|---|
| **Smart Matchmaker** — rekomendasi kreator untuk kampanye | Algoritma skoring berbobot | ✅ Ya — 7 bobot di `services/matchmaker.js` |
| **Anti-Fraud** — penyaringan tayangan palsu | Aturan + deteksi anomali z-score | ✅ Ya — 4 ambang di `config.js` |
| **Portfolio Auto-builder** — portofolio kreator tiga lapis | Perakitan deterministik dari basis data + oEmbed | ✅ Ya — aturan kalimatnya di `services/portofolio.js` |
| **Auto-Report Summary** — ringkasan hasil untuk UMKM awam | Model bahasa lewat NaraRouter/OpenRouter | ❌ Tidak — hanya prompt-nya yang bisa diperbaiki |
| **Auto-Subtitle** | Pemotongan naskah bertimestamp | ❌ Bukan model; ini pengolah teks biasa |

Dua fitur pertama itulah yang dimaksud "AI yang makin pintar". Seluruh kecerdasannya adalah sepuluh angka:

```
services/matchmaker.js → BOBOT
  niche 18 · lokasi 22 · histori 15 · rating 20 · rekamJejak 10 · jangkauan 10 · ketersediaan 5   (total 100)

config.js → antiFraud
  AF_DURASI_MIN 3 · AF_MAKS_VIEW_IP 3 · AF_JENDELA_ULANG 60 · AF_AMBANG_Z 3
```

Geser angkanya, dan perilaku AI-nya berubah. Tidak ada bobot tersembunyi, tidak ada model yang perlu di-retrain.

---

## 2. Tiga salah paham yang perlu diluruskan lebih dulu

**Make.com, Zapier, dan n8n bukan alat melatih AI.** Ketiganya alat otomasi alur kerja — menyambungkan aplikasi lalu menjalankan langkah yang sudah kamu susun sendiri. Tidak ada yang belajar dari data. Berguna untuk "kalau ada kampanye baru, kirim notifikasi ke Telegram", tidak berguna untuk membuat matchmaker lebih tepat.

**Model bahasanya tidak bisa dilatih dari sini.** Semuanya di-hosting pihak lain. Yang bisa kamu perbaiki adalah **instruksinya**, yaitu `SISTEM_LAPORAN` di `lokalboost-api/src/services/ai.js`. Kalau ringkasannya terasa terlalu kaku, ubah kalimat aturannya di sana — itu tuas yang tersedia, dan pengaruhnya besar.

**Menambah data saja tidak membuat sistem ini lebih pintar.** Yang dibutuhkan bukan lebih banyak tayangan, melainkan lebih banyak **keputusan manusia atas tayangan itu**. Sejuta tayangan tanpa satu pun sengketa yang diputus tidak mengajarkan apa pun kepada sistem.

---

## 3. Siklusnya

```
   ┌─ 1. Platform dipakai ────────────────────────────────────┐
   │    UMKM memilih kreator. Kreator mengajukan sengketa.    │
   │    Admin memutus siapa yang benar.                        │
   └───────────────────────┬───────────────────────────────────┘
                           ↓
   ┌─ 2. Keputusan itu disimpan sebagai jawaban benar ─────────┐
   │    tayangan.dipulihkan = 1   → "aturan X salah di sini"   │
   │    umpan_matchmaker          → "yang dipilih peringkat N" │
   └───────────────────────┬───────────────────────────────────┘
                           ↓
   ┌─ 3. Sistem mengukur dirinya ──────────────────────────────┐
   │    Ruang Admin → panel "Ketepatan AI"                      │
   │    Tingkat salah-saring per aturan, precision@1 dan @3     │
   └───────────────────────┬───────────────────────────────────┘
                           ↓
   ┌─ 4. Alat mengusulkan angka baru ──────────────────────────┐
   │    npm run setel   (atau panel "Usulan Penyetelan")       │
   └───────────────────────┬───────────────────────────────────┘
                           ↓
   ┌─ 5. KAMU menyetujui ──────────────────────────────────────┐
   │    Tempel baris .env → nyalakan ulang server               │
   └───────────────────────────────────────────────────────────┘
                           ↓
                      kembali ke 1
```

Langkah 5 sengaja dipegang manusia. Sistem yang menyetel ambang keuangannya sendiri berdasarkan data yang bisa dipengaruhi penggunanya adalah sistem yang bisa dibujuk pelaku kecurangan untuk melonggarkan dirinya sendiri.

---

## 4. Menjalankannya

### Langkah 1 — lihat rapornya

Masuk sebagai admin → **Ruang Admin** → panel **Ketepatan AI**.

Yang perlu dibaca:

- **Tingkat salah-saring per aturan.** Dari semua tayangan yang disaring dengan alasan tertentu, berapa persen yang akhirnya dipulihkan admin lewat sengketa. Di atas 10% ditandai merah.
- **Pilihan = peringkat 1** (precision@1). Seberapa sering kreator yang benar-benar dipilih UMKM adalah yang direkomendasikan di urutan teratas.
- **Rata-rata peringkat dipilih.** Kalau meleset, meleset sejauh apa.

Angka nol di awal itu wajar, bukan kegagalan — belum ada keputusan yang bisa dipelajari.

### Langkah 2 — minta usulan

```bash
cd lokalboost-api
npm run setel
```

Keluarannya kira-kira begini:

```
USULAN AF_MAKS_VIEW_IP: 3 → 5 tayangan per IP
       aturan  : Terlalu banyak tayangan dari sumber jaringan yang sama
       bukti   : 79 dari 251 penyaringan dinyatakan keliru oleh admin (31,5%)
       artinya : menaikkan batas tayangan yang boleh datang dari satu jaringan
       Satu warnet, satu kantor, atau satu kos-kosan berbagi satu IP publik.

Salin ke .env lalu nyalakan ulang server:
  AF_MAKS_VIEW_IP=5
```

Panel **Usulan Penyetelan** di Ruang Admin menampilkan isi yang sama, jadi kamu tidak harus membuka terminal.

Alat ini **tidak pernah menulis apa pun**, dan hanya mengusulkan kalau sebuah aturan salah **lebih dari 10%** dari **minimal 20 penyaringan**. Di bawah itu angkanya derau, bukan bukti.

### Langkah 3 — putuskan, lalu terapkan

Tempel barisnya ke `lokalboost-api/.env`, nyalakan ulang server, dan tunggu satu siklus untuk melihat apakah tingkat salah-saringnya turun.

### Untuk bobot matchmaker

`npm run setel` juga mencoba puluhan susunan bobot atas keputusan yang pernah tercatat, lalu melaporkan mana yang paling sering menaruh kreator terpilih di peringkat 1. Ubah objek `BOBOT` di `services/matchmaker.js` — totalnya harus tetap 100.

Angka bagian ini **perkiraan**, dan keluarannya mengatakan itu apa adanya: replay memakai reputasi kreator hari ini, sementara skor asli dibekukan saat keputusan diambil. Cukup untuk mengurutkan pilihan, tidak cukup untuk diklaim sebagai ukuran pasti.

---

## 5. Batas jujur alat ini

**Ia hanya bisa mengusulkan pelonggaran, tidak pernah pengetatan.**

Alasannya bukan kemalasan, melainkan ketiadaan data. Satu-satunya label yang dimiliki sistem adalah *penyaringan yang dinyatakan keliru oleh admin* — bukti bahwa sebuah aturan terlalu galak. Kecurangan yang berhasil **lolos** tidak pernah ditandai siapa pun. Tidak ada baris di basis data yang berbunyi "tayangan ini palsu tapi lolos".

Karena itu angka salah-saring 0% **tidak** berarti anti-fraud-nya sempurna. Bisa jadi ia memang tepat; bisa jadi tidak ada yang pernah mengajukan sengketa.

Untuk melengkapinya, yang dibutuhkan adalah sumber label arah sebaliknya — misalnya UMKM menandai tayangan yang mereka curigai lalu admin memutusnya, persis seperti mekanisme sengketa yang sudah ada tapi dari sisi yang berlawanan. Itu penambahan produk, bukan penambahan algoritma.

---

## 6. Menyalakan AI generatif (opsional)

Auto-Report punya dua mode. Tanpa kunci API, ia memakai **template** yang disusun dari statistik kampanye — hasilnya tetap relevan, dan backend tetap jalan penuh tanpa internet. Dengan kunci, ia memakai model bahasa lewat penyedia yang dicoba berurutan: NaraRouter, lalu OpenRouter, lalu Anthropic.

Portfolio Auto-builder sengaja TIDAK punya mode model bahasa. Ringkasannya selalu dirakit aturan, supaya portofolio tetap terbit di produksi tempat AI generatif dimatikan.

```bash
# 1. Buat kunci di https://console.anthropic.com/settings/keys
# 2. Tempel ke lokalboost-api/.env
ANTHROPIC_API_KEY=sk-ant-...

# 3. Buktikan jalurnya benar-benar hidup
npm run cek-ai
```

`npm run cek-ai` penting karena `services/ai.js` **sengaja tidak pernah gagal**: kalau kunci salah atau kuota habis, ia diam-diam jatuh ke template dan hasilnya tetap terlihat masuk akal. Sifat itu bagus untuk demo — Wi-Fi ruangan mati tidak mematikan presentasi — tapi berarti "AI-nya sudah nyala" hanya bisa dibuktikan dengan menjalankan skrip ini. Ia keluar dengan kode 1 dan mencetak sebab aslinya kalau salah satu fitur masih memakai template.

Ada biaya per panggilan. Template tetap jadi cadangan otomatis.

---

## 7. Kenapa pendekatan ini lebih kuat di depan juri

Terdengar kurang canggih dibanding "model yang belajar sendiri". Tapi justru di situ kekuatannya:

**Setiap keputusan sistem bisa dijelaskan alasannya.** Ketika LokalBoost menyaring sebuah tayangan, ia menyimpan kalimat alasannya — dan kreator bisa membantahnya lewat sengketa. Ketika ia merekomendasikan seorang kreator, ia menyebutkan komponen mana yang membuat skornya tinggi.

Model yang dilatih otomatis tidak bisa melakukan itu. Ia tidak bisa menjelaskan kenapa ia menolak tayangan seseorang, dan tidak bisa dibantah karena tidak ada yang bisa ditunjuk. Untuk platform yang memegang uang orang dan menghadapi UMKM yang awam digital, itu bukan kekurangan teknis — itu masalah kepercayaan.

Dan penyetelan berbasis bukti ini bukan teori: aturan IP-berulang tercatat salah **31,5%** setelah sebuah sengketa dimenangkan kreator, dan sistem langsung menandainya perlu ditinjau. Angka yang sebelumnya mustahil diketahui siapa pun.

---

## Rujukan berkas

| Yang ingin diubah | Berkasnya |
|---|---|
| Bobot matchmaker | `lokalboost-api/src/services/matchmaker.js` → `BOBOT` |
| Ambang anti-fraud | `lokalboost-api/.env` → `AF_*` (bawaannya di `src/config.js`) |
| Daftar pola bot | `lokalboost-api/src/services/antifraud.js` → `POLA_BOT` |
| Instruksi model bahasa | `lokalboost-api/src/services/ai.js` → `SISTEM_LAPORAN` |
| Aturan kalimat portofolio | `lokalboost-api/src/services/portofolio.js` → `ringkasanPortofolio()` |
| Logika usulan penyetelan | `lokalboost-api/src/services/penyetel.js` |
