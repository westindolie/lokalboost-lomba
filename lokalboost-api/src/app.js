import express from 'express'
import cors from 'cors'
import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import { bacaPengguna } from './lib/auth.js'
import { batasLaju } from './lib/batas.js'
import { segarkanReplika } from './lib/db.js'
import { GalatHttp, galat403 } from './lib/util.js'

import { rutaAuth } from './routes/auth.js'
import { rutaKampanye } from './routes/kampanye.js'
import { rutaProduk } from './routes/produk.js'
import { rutaKreator } from './routes/kreator.js'
import { rutaDompet } from './routes/dompet.js'
import { rutaPembayaran } from './routes/pembayaran.js'
import { rutaVideo } from './routes/video.js'
import { rutaTayangan } from './routes/tayangan.js'
import { rutaUlasan } from './routes/ulasan.js'
import { rutaNotifikasi } from './routes/notifikasi.js'
import { rutaSengketa } from './routes/sengketa.js'
import { rutaAi } from './routes/ai.js'
import { rutaDashboard } from './routes/dashboard.js'
import { rutaAdmin } from './routes/admin.js'

/**
 * Cocokkan Origin dengan daftar izin. Entri boleh ditulis sebagai pola
 * subdomain, mis. "https://*.vercel.app" — Vercel menerbitkan URL pratinjau
 * baru setiap deploy, jadi mendaftarkannya satu per satu tidak praktis.
 */
function asalBoleh(asal) {
  return config.asalDiizinkan.some((pola) => {
    if (pola === asal) return true
    if (!pola.includes('*')) return false
    const [skema, induk] = pola.split('://*.')
    return Boolean(induk) && asal.startsWith(`${skema}://`) && asal.endsWith(`.${induk}`)
  })
}

export function buatApp() {
  const app = express()

  app.set('trust proxy', true) // agar req.ip benar di belakang proxy/CDN

  /**
   * CORS dipasang HANYA pada rute data, tidak global.
   *
   * Alasannya bukan kerapian. Vite menandai tag <script> hasil build dengan
   * atribut `crossorigin`, dan browser mengirim header `Origin` untuk berkas
   * bertanda itu **bahkan ketika asalnya sama**. Selama CORS masih global,
   * memuat situs dari backend sendiri berarti Origin `http://localhost:4000`
   * (atau alamat terowongan) diperiksa terhadap ASAL_DIIZINKAN, ditolak, dan
   * bundel JS-nya gagal dimuat — halaman putih tanpa satu pun pesan galat,
   * karena yang gagal adalah pemuatan modul, bukan kode di dalamnya.
   *
   * Berkas statis memang tidak butuh CORS. Yang butuh hanya endpoint yang
   * dipanggil dari asal lain, dan itu ada di /api dan /unggahan.
   */
  // Bentuk delegasi (req, cb) dipakai, bukan `{ origin }`, karena kita perlu
  // membaca host permintaannya sendiri — lihat alasan asalSendiri di bawah.
  const cekCors = cors((req, cb) => {
    const asal = req.headers.origin

    // Permintaan tanpa Origin (curl, aplikasi seluler, tes) tetap boleh.
    if (!asal) return cb(null, { origin: true, credentials: true })

    /**
     * Asal sendiri selalu boleh.
     *
     * Browser mengirim header `Origin` pada SEMUA permintaan non-GET, termasuk
     * yang satu asal. Jadi begitu backend juga melayani situsnya, setiap POST
     * dari halaman itu sendiri ikut diperiksa terhadap ASAL_DIIZINKAN — dan
     * alamat terowongan yang berganti tiap sesi mustahil didaftarkan lebih
     * dulu. Tanpa baris ini, membuka situs lewat alamat mana pun selain yang
     * terdaftar membuat semua tombolnya membalas 500.
     */
    const asalSendiri = `${req.protocol}://${req.get('host')}`
    if (asal === asalSendiri || asalBoleh(asal)) {
      return cb(null, { origin: true, credentials: true })
    }
    // Ditolak sebagai GalatHttp, bukan Error polos. Error polos jatuh ke
    // cabang terakhir penanganan galat dan muncul sebagai 500 "kesalahan
    // server" — menyesatkan di log (terlihat seperti backend yang rusak,
    // padahal ini penolakan yang disengaja) dan menyembunyikan sebabnya
    // dari siapa pun yang sedang menyiapkan penerbitan.
    cb(galat403(`Origin ${asal} tidak diizinkan. Tambahkan ke ASAL_DIIZINKAN bila memang milik Anda.`))
  })

  // Di Vercel beberapa instance hidup bersamaan; tarik tulisan instance lain
  // dari Turso sebelum melayani. Gagal sinkron tidak boleh menjatuhkan
  // permintaan: data sedikit basi lebih baik daripada galat 500.
  app.use('/api', (_req, _res, next) => {
    try {
      segarkanReplika()
    } catch (galat) {
      console.warn('[TURSO] Sinkron gagal:', galat.message)
    }
    next()
  })
  app.use('/api', cekCors)
  app.use(express.json({ limit: '2mb' }))
  app.use(express.urlencoded({ extended: true }))

  // Video yang sudah diunggah dilayani statis agar bisa diputar langsung.
  // Tetap ber-CORS karena halaman di asal lain boleh menyematkannya.
  //
  // Lapis kedua setelah daftar putih ekstensi di routes/video.js. Keduanya
  // ada karena folder ini berisi berkas kiriman pengguna yang dilayani dari
  // origin aplikasi: kalau satu berkas .html pernah lolos — lewat bug, lewat
  // berkas lama, atau lewat jalur yang belum terpikir — peramban akan
  // menjalankannya sebagai halaman, dan script di dalamnya bisa membaca
  // localStorage tempat token JWT disimpan. `nosniff` mematikan tebakan tipe
  // oleh peramban, dan Content-Security-Policy kosong mematikan eksekusi
  // script seandainya berkasnya tetap terlanjur dilayani sebagai HTML.
  app.use(
    '/unggahan',
    cekCors,
    express.static(config.folderUnggahan, {
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
      },
    }),
  )

  // Token dibaca sekali di sini; seluruh rute tinggal memakai req.pengguna.
  app.use(bacaPengguna)

  app.get('/api/kesehatan', (_req, res) =>
    res.json({ status: 'sehat', waktu: new Date().toISOString(), versi: '1.0.0', batasUnggahMb: config.batasUnggahMb, modeDemo: config.modeDemo }),
  )

  // Rute akun adalah satu-satunya yang bisa dipanggil tanpa token sekaligus
  // menghasilkan efek nyata (mengirim email, menebak kata sandi), jadi hanya
  // di sini pembatas laju per-IP dipasang. Pagar yang mengikat alur OTP itu
  // sendiri ada di routes/auth.js dan bersandar pada basis data, bukan memori.
  app.use('/api/auth', batasLaju({ maks: 60, detik: 60 }), rutaAuth)
  app.use('/api/kampanye', rutaKampanye)
  app.use('/api/produk', rutaProduk)
  app.use('/api/kreator', rutaKreator)
  app.use('/api/dompet', rutaDompet)
  app.use('/api/pembayaran', rutaPembayaran)
  app.use('/api/video', rutaVideo)
  app.use('/api/tayangan', rutaTayangan)
  app.use('/api/ulasan', rutaUlasan)
  app.use('/api/notifikasi', rutaNotifikasi)
  app.use('/api/sengketa', rutaSengketa)
  app.use('/api/ai', rutaAi)
  app.use('/api/dashboard', rutaDashboard)
  app.use('/api/admin', rutaAdmin)

  // ------------------------------------------------------------------
  //  Frontend hasil build, dilayani dari asal yang sama
  // ------------------------------------------------------------------
  //
  // Dinyalakan dengan mengisi FOLDER_WEB. Tanpa itu, backend berperilaku
  // persis seperti sebelumnya (API saja) dan `npm run dev` di lokalboost-web
  // tetap jadi cara kerja sehari-hari.
  //
  // Gunanya satu asal: berbagi lewat satu alamat saja. Dengan dua alamat
  // terpisah, setiap kali alamatnya berubah kita harus membangun ulang
  // frontend (karena VITE_API_URL ditanam Vite SAAT BUILD, bukan saat jalan)
  // sekaligus menambahkan alamat barunya ke ASAL_DIIZINKAN. Satu asal
  // menghapus dua-duanya: frontend memanggil `/api/...` secara relatif, dan
  // CORS tidak pernah ikut bermain karena tidak ada permintaan lintas asal.
  if (config.folderWeb && fs.existsSync(config.folderWeb)) {
    const indexHtml = path.join(config.folderWeb, 'index.html')

    // Aset ber-hash (index-a1b2c3.js) aman di-cache lama; index.html tidak
    // boleh, karena itulah berkas yang menunjuk ke nama aset terbaru.
    app.use(express.static(config.folderWeb, { index: false, maxAge: '1h' }))

    // React Router memakai jalur sungguhan (/kreator/dompet), jadi permintaan
    // langsung ke alamat itu harus dijawab index.html — biar router di sisi
    // klien yang memutuskan. Rute /api dan /unggahan sudah tertangani di atas.
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next()
      res.sendFile(indexHtml)
    })
  }

  app.use((req, res) => {
    res.status(404).json({ galat: `Rute ${req.method} ${req.path} tidak ada.` })
  })

  // Penanganan galat terpusat: pesan yang sudah ramah pengguna diteruskan
  // apa adanya, sisanya diganti pesan umum agar detail internal tidak bocor.
  app.use((err, _req, res, _next) => {
    if (err instanceof GalatHttp) {
      return res.status(err.status).json({ galat: err.message, ...(err.rincian ? { rincian: err.rincian } : {}) })
    }
    if (err instanceof multer.MulterError) {
      const pesan =
        err.code === 'LIMIT_FILE_SIZE'
          ? `Ukuran video maksimal ${config.batasUnggahMb} MB.`
          : `Gagal mengunggah berkas: ${err.message}`
      return res.status(400).json({ galat: pesan })
    }
    if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ galat: 'Data serupa sudah ada.' })
    }

    console.error('[GALAT]', err)
    res.status(500).json({ galat: 'Terjadi kesalahan di server. Coba lagi sebentar lagi.' })
  })

  return app
}
