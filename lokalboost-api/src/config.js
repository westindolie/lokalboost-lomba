import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirIni = path.dirname(fileURLToPath(import.meta.url))

/** Akar proyek backend (satu tingkat di atas src/). */
export const AKAR = path.resolve(dirIni, '..')

/**
 * Nilai bawaan JWT_SECRET, diekspor supaya src/index.js bisa menolak menyala
 * di produksi kalau ia belum diganti. Nilai ini ada di dalam repositori —
 * memakainya di server sama saja membagikan kunci rumah.
 */
export const SANDI_JWT_BAWAAN = 'lokalboost-rahasia-pengembangan'

export const config = {
  port: Number(process.env.PORT || 4000),

  /**
   * Batas ukuran unggahan video. Server sendiri sanggup 200 MB; Vercel
   * Function menolak badan permintaan di atas ~4,5 MB sebelum kode kita
   * sempat jalan, jadi di sana nilainya diturunkan lewat env supaya pengguna
   * mendapat pesan yang jujur, bukan galat 413 mentah.
   */
  batasUnggahMb: Number(process.env.BATAS_UNGGAH_MB || 200),

  /** Data bisa kembali ke contoh kapan saja (Vercel Function). Frontend memasang banner. */
  modeDemo: process.env.MODE_DEMO === 'true',

  /**
   * Basis data Turso (libSQL). Kosong = SQLite lokal murni. Nama variabel
   * mengikuti yang dipasang integrasi Turso di Vercel Marketplace.
   */
  turso: {
    url: process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL || '',
    token: process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN || '',
  },

  /** Berkas basis data. ":memory:" dipakai oleh berkas tes. */
  dbPath: process.env.DB_PATH || path.join(AKAR, 'lokalboost.db'),

  /** Folder tujuan unggahan video. */
  folderUnggahan: process.env.FOLDER_UNGGAHAN || path.join(AKAR, 'unggahan'),

  /**
   * Folder hasil build frontend (`lokalboost-web/dist`). Diisi = backend
   * sekalian melayani situsnya, sehingga seluruh aplikasi hidup di SATU
   * alamat — itu yang membuat berbagi lewat satu tautan jadi mungkin.
   * Kosong = backend tetap API murni seperti semula.
   */
  folderWeb: process.env.FOLDER_WEB || '',

  jwtSecret: process.env.JWT_SECRET || SANDI_JWT_BAWAAN,
  jwtKedaluwarsa: process.env.JWT_KEDALUWARSA || '7d',

  /** Daftar origin frontend yang boleh memanggil API. */
  asalDiizinkan: (process.env.ASAL_DIIZINKAN || 'http://localhost:5173,http://localhost:4173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  /**
   * Alamat situs untuk tombol di dalam email notifikasi. Bawaannya asal
   * pertama yang diizinkan — di produksi itu memang alamat frontend-nya,
   * jadi satu variabel lebih sedikit yang bisa lupa diisi.
   */
  alamatSitus:
    process.env.ALAMAT_SITUS ||
    (process.env.ASAL_DIIZINKAN || 'http://localhost:5173').split(',')[0].trim(),

  /**
   * Midtrans Snap untuk setor dana Rekber. Tanpa MIDTRANS_SERVER_KEY, setor
   * dana tetap simulasi seperti dulu (POST /api/kampanye/:id/setor). Dengan
   * kunci, jalur simulasi itu DITUTUP untuk UMKM: escrow hanya boleh diisi
   * oleh pembayaran yang sudah dikonfirmasi Midtrans.
   *
   * Bawaannya SANDBOX. Produksi harus dinyalakan sadar lewat
   * MIDTRANS_PRODUKSI=ya, karena kunci produksi menagih uang sungguhan.
   */
  midtrans: {
    serverKey: process.env.MIDTRANS_SERVER_KEY || '',
    clientKey: process.env.MIDTRANS_CLIENT_KEY || '',
    produksi: process.env.MIDTRANS_PRODUKSI === 'ya',
    /** Umur tagihan. VA yang tidak dibayar dalam waktu ini kedaluwarsa. */
    menitKedaluwarsa: Number(process.env.MIDTRANS_MENIT_KEDALUWARSA || 60),
  },

  /**
   * ScrapeCreators untuk Cek Profil Kreator (services/profil-sosial.js).
   * Kosong = fitur mati dan kreator tetap bisa mengisi statistik manual.
   * Batas tunggu di bawah `maxDuration` Vercel 30 detik; panggilan TikTok
   * (profil + video) berjalan paralel, jadi anggarannya tidak berlipat.
   */
  scrapeCreators: {
    apiKey: process.env.SCRAPECREATORS_API_KEY || '',
    baseUrl: process.env.SCRAPECREATORS_BASE_URL || 'https://api.scrapecreators.com',
    batasDetik: Number(process.env.SCRAPECREATORS_BATAS_DETIK || 15),
  },

  /**
   * Komisi platform dari setiap pencairan ke kreator.
   * PRD §15 menandai angka ini sebagai pertanyaan terbuka — kami pakai 5%
   * sebagai default yang bisa diubah lewat env tanpa menyentuh kode.
   */
  komisiPersen: Number(process.env.KOMISI_PERSEN || 5),

  /** Ambang aturan AI Anti-Fraud (lihat services/antifraud.js). */
  antiFraud: {
    durasiMinimalDetik: Number(process.env.AF_DURASI_MIN || 3),
    maksViewPerIp: Number(process.env.AF_MAKS_VIEW_IP || 3),
    jendelaUlangMenit: Number(process.env.AF_JENDELA_ULANG || 60),
    ambangZScore: Number(process.env.AF_AMBANG_Z || 3),
  },

  /**
   * SMTP untuk mengirim kode OTP ke email sungguhan. Kalau host/pengguna/sandi
   * kosong, backend tetap jalan penuh dan kode hanya dicetak ke log — jadi demo
   * offline tidak pernah gagal karena urusan surel.
   */
  surel: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    /** true untuk port 465 (TLS langsung); 587 memakai STARTTLS. */
    aman: process.env.SMTP_AMAN === 'true' || Number(process.env.SMTP_PORT) === 465,
    pengguna: process.env.SMTP_PENGGUNA || '',
    sandi: (process.env.SMTP_SANDI || '').replace(/\s+/g, ''),
    dari: process.env.SMTP_DARI || '',
  },

  /**
   * Batas tunggu satu panggilan ke model, dalam detik.
   *
   * HARUS lebih kecil dari `maxDuration` fungsi di vercel.json (30 detik),
   * dan inilah alasannya: seluruh rancangan fitur AI bertumpu pada "kalau
   * model gagal, pakai template". Itu cuma benar bila panggilannya gagal
   * lebih cepat daripada fungsinya mati. Model lambat membuat Vercel
   * membunuh fungsi di 30 detik, `catch` tidak pernah jalan, dan pengguna
   * menerima 504 — bukan template. Terbukti di produksi 18 Sep 2026:
   * model gratis menjawab 37 detik, endpoint balas FUNCTION_INVOCATION_TIMEOUT.
   *
   * Diturunkan 20 -> 12 pada 21 Sep 2026, saat `tanyaModel()` diperbaiki
   * menjadi rantai penyedia sungguhan. Sejak itu SATU permintaan bisa
   * mencoba dua penyedia berurutan, jadi batas ini bukan lagi anggaran waktu
   * seluruh permintaan melainkan anggaran PER penyedia: 12 + 12 = 24 detik,
   * masih menyisakan ruang sebelum `maxDuration` 30. Ukurannya juga bukan
   * tebakan: 5 panggilan berturut ke model gratis Nara memberi 1 jawaban di
   * 14,9 detik dan 4 kali mentok batas, sementara OpenRouter menjawab 5,4
   * detik. Menunggu penyedia pertama lebih lama hanya memperkecil peluang
   * penyedia kedua sempat dicoba.
   */
  batasAiDetik: Number(process.env.AI_BATAS_DETIK || 12),

  /**
   * Anggaran transkripsi suara video (Gemini). Lebih longgar daripada
   * `batasAiDetik` karena hanya satu penyedia yang dicoba dan model harus
   * mendengarkan seluruh video, tapi tetap di bawah `maxDuration` 30 detik
   * dengan sisa untuk mengunduh video dari Blob dan menulis ke database.
   */
  batasTranskripDetik: Number(process.env.AI_BATAS_TRANSKRIP_DETIK || 20),

  /** Model Claude untuk AI Script Generator & Auto-Report Summary. */
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-opus-5',
  },

  /**
   * OpenRouter sebagai penyedia alternatif, dipakai lebih dulu bila kuncinya
   * ada. Yang dipakai adalah endpoint kompatibel-OpenAI, bukan "Anthropic
   * Skin" milik OpenRouter: skin itu hanya dijamin jalan untuk model
   * Anthropic, sedangkan model gratis di sana bukan model Anthropic.
   *
   * Modelnya WAJIB yang mendukung `structured_outputs`. Tanpa itu jawabannya
   * bukan JSON yang sah, `JSON.parse` gagal, lalu seluruh fitur diam-diam
   * kembali ke template — persis kegagalan yang dicari `npm run cek-ai`.
   */
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    model: process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v4-flash-0731:free',

    /**
     * Kedalaman penalaran: `low` | `medium` | `high` | `off`.
     *
     * Bawaannya `low` karena diukur, bukan karena selera. Pada
     * deepseek-v4-flash:free tanpa kendali ini, model memakai 4.221 token
     * untuk menalar lalu terus mengoceh sampai mentok 16.000 token tanpa
     * pernah menutup JSON-nya. Dengan `low` cukup 1.896 token dan JSON-nya
     * sah. Model penalaran lain berperilaku mirip: `max_tokens` membatasi
     * penalaran DITAMBAH jawaban.
     */
    penalaran: (process.env.OPENROUTER_REASONING || 'low').toLowerCase(),
  },

  /**
   * NaraRouter (router.bynara.id): router model kompatibel-OpenAI, kuncinya
   * berawalan `sk-nry-`. Didahulukan di atas OpenRouter bila kuncinya ada.
   *
   * Dipanggil lewat jalur kode yang sama dengan OpenRouter karena bentuk
   * permintaannya identik (`/chat/completions` + `response_format`). Yang
   * berbeda cuma `baseURL` dan header atribusi, jadi keduanya dilayani
   * `tanyaKompatibelOpenAI()` di services/ai.js.
   *
   * Dua hal yang wajib diketahui sebelum mengandalkan penyedia ini:
   *
   *   1. Kuncinya belum berlaku sampai akun Telegram diikat di
   *      https://router.bynara.id/settings. Sebelum itu SEMUA endpoint
   *      menjawab `403 telegram_required`, termasuk `/models`. Diuji
   *      18 Sep 2026.
   *   2. Model gratisnya LAMBAT dan tidak stabil. Diukur 18 Sep 2026 dengan
   *      3 panggilan berurutan per fitur, `reasoning` mati:
   *
   *        nemotron-3-super-free  naskah  3/3 llm  [12,3 · 20,6 · 16,9] dtk
   *                               laporan 2/3 llm  [ 3,4 ·  6,3 · 52,0] dtk
   *        nemotron-3-ultra-free  naskah  2/3 llm  [31,1 · 29,9 · >120] dtk
   *                               laporan 3/3 llm  [30,1 · 14,4 ·  5,0] dtk
   *
   *      Keduanya rutin melewati `batasAiDetik` 20 detik dan kadang melewati
   *      `maxDuration` 30 detik. Di Vercel itu berarti 504, BUKAN template.
   *      Jadi penyedia ini aman untuk demo dari laptop, dan belum aman untuk
   *      produksi tanpa menaikkan `maxDuration` lebih dulu.
   *
   * Yang sudah terbukti baik: `structured_outputs` DIDUKUNG, jadi jawabannya
   * JSON yang sah dan bukan prosa. Cari model layak dengan `npm run model-nara`.
   */
  nara: {
    apiKey: process.env.NARA_API_KEY || '',

    /**
     * `NARA_MODEL` boleh berisi beberapa model dipisah koma, urut dari yang
     * paling cepat. Ini BUKAN daftar cadangan yang dicoba bergiliran:
     * services/ai.js membalapkan mereka (`balapanModel()`), sebab bergiliran
     * memakan sampai 12 detik per model dan hanya dua yang muat di bawah
     * `maxDuration` Vercel yang 30 detik.
     *
     * Kenapa perlu lebih dari satu: endpoint gratis NVIDIA sering penuh.
     * Diukur 22 Sep 2026, 5 panggilan berurutan per model pada skema laporan
     * yang sebenarnya, lewat `npm run cek-ai`:
     *
     *   nemotron-3-nano-omni-30b-a3b-reasoning  2/5 berhasil [6,5 · 7,2] dtk
     *   nemotron-3-super-120b-a12b              0/5, semua 503 "Worker local
     *                                           total request limit reached"
     *   mistral-nemotron                        0/5, semua lewat 25 dtk
     *   nemotron-3.5-lightning-30b-a3b          tidak menjawab "halo" pun
     *                                           dalam 90 dtk — jangan dipakai
     *   z-ai/glm-5.3-flash                      63-90 dtk, di atas maxDuration
     *
     * Yang membuat balapan sepadan: penolakan 503 datang CEPAT (1,4-3,2 dtk),
     * jadi model yang penuh menyerah jauh sebelum batas waktu dan pesaingnya
     * masih sempat menjawab. `model` (tunggal) tetap ada untuk log dan skrip
     * lama, isinya model pertama.
     */
    models: (process.env.NARA_MODEL || 'nemotron-3-super-free')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean),
    get model() {
      return this.models[0]
    },
    baseUrl: process.env.NARA_BASE_URL || 'https://router.bynara.id/v1',

    /**
     * Bawaannya `off`, berbeda dari OpenRouter, dan ini hasil ukur bukan
     * selera. Dengan penalaran menyala, nemotron-3-ultra-free mengembalikan
     * `message.content` KOSONG pada skema naskah — bukan JSON rusak, bukan
     * galat, benar-benar kosong, sehingga fitur jatuh ke template tanpa
     * sebab yang jelas. Dimatikan, fitur yang sama langsung berhasil.
     */
    penalaran: (process.env.NARA_REASONING || 'off').toLowerCase(),
  },

  /**
   * Google Gemini lewat endpoint kompatibel-OpenAI-nya, kunci yang sama
   * dengan Waste2Value. Didahulukan di atas Nara/OpenRouter karena jauh lebih
   * stabil daripada model gratis yang sering 503. Dua model dibalapkan
   * (`balapanModel()`), sama dengan W2V: flash-lite utama, versi sebelumnya
   * sebagai cadangan.
   *
   * `penalaran: 'none'` = parameter `reasoning` tidak dikirim sama sekali.
   * Gemini tidak mengenalnya; mengirimnya memancing 400 lalu pengulangan
   * yang memakan detik berharga.
   */
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    models: (process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite,gemini-3.1-flash-lite')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean),
    get model() {
      return this.models[0]
    },
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    penalaran: 'none',
  },

  /**
   * Way (way.gutech.dev): gateway kompatibel-OpenAI berbayar rupiah. Kalau
   * WAY_API_KEY ada, penyedia ini jadi cadangan tepat setelah Gemini langsung
   * (lebih lambat: 5-8 dtk per panggilan, jadi bukan penyedia utama).
   * Model dipilih lewat WAY_MODEL (bawaan gemini-4-argon). `penalaran: 'none'`
   * karena model Gemini tidak mengenal parameter `reasoning`.
   */
  way: {
    apiKey: process.env.WAY_API_KEY || '',
    models: (process.env.WAY_MODEL || 'gemini-4-argon')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean),
    get model() {
      return this.models[0]
    },
    baseUrl: process.env.WAY_BASE_URL || 'https://api-way.gutech.dev/v1',
    penalaran: 'none',
  },

  /**
   * Di mode pengembangan, kode OTP ikut dikembalikan agar demo mudah.
   * Setel BOCORKAN_OTP=false kalau ingin memaksa kode hanya bisa dibaca dari
   * inbox email (mis. saat presentasi juri) tanpa menyentuh NODE_ENV.
   */
  bocorkanOtp: process.env.BOCORKAN_OTP
    ? process.env.BOCORKAN_OTP !== 'false'
    : process.env.NODE_ENV !== 'production',
}

/**
 * Konfigurasi produksi yang salah tidak menimbulkan gejala apa pun sampai
 * terlambat: token yang bisa dipalsukan siapa saja, atau kode OTP yang ikut
 * terkirim di respons API. Dipakai bersama oleh src/index.js (server biasa)
 * dan api/index.js (Vercel Function), supaya tidak ada jalur yang lolos.
 */
export function periksaProduksi() {
  const fatal = []
  const peringatan = []
  if (process.env.NODE_ENV !== 'production') return { fatal, peringatan }
  if (config.jwtSecret === SANDI_JWT_BAWAAN) {
    fatal.push(
      'JWT_SECRET masih memakai nilai bawaan yang tertulis di repositori. ' +
        'Siapa pun yang membacanya bisa memalsukan token, termasuk token admin. ' +
        'Pasang JWT_SECRET acak di panel hosting, lalu nyalakan ulang.',
    )
  }
  if (config.bocorkanOtp) {
    peringatan.push(
      'BOCORKAN_OTP masih aktif di produksi. Kode verifikasi ikut dikembalikan di respons API, ' +
        'jadi siapa pun yang tahu email seseorang bisa masuk sebagai orang itu. Setel BOCORKAN_OTP=false.',
    )
  }
  return { fatal, peringatan }
}
