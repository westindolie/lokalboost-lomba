import { Router } from 'express'
import { db } from '../lib/db.js'
import { config } from '../config.js'
import { wajibPeran } from '../lib/auth.js'
import { batasLaju } from '../lib/batas.js'
import { bungkus, galat400, galat404, galat409, wajibAda } from '../lib/util.js'
import { rekomendasiKampanye } from '../services/matchmaker.js'
import {
  bangunPortofolio,
  bentukTerukur,
  konfirmasiTikTok,
  tebakPlatform,
} from '../services/portofolio.js'
import {
  PLATFORM_PROFIL,
  ambilProfil,
  bioMemuatKode,
  cekProfilAktif,
  hitungMetrik,
  kodeVerifikasi,
  nilaiProfil,
  uraiTautanProfil,
} from '../services/profil-sosial.js'
import { bentukKampanye } from './kampanye.js'
import { akunSosialKreator } from '../services/akun-sosial.js'

export const rutaKreator = Router()

/** Profil publik kreator + reputasi yang dihitung dari ulasan nyata. */
function bentukKreator(baris) {
  const ulasan = db
    .prepare('SELECT AVG(bintang) AS rerata, COUNT(*) AS jumlah FROM ulasan WHERE dinilai_id = ?')
    .get(baris.id)
  const selesai = db
    .prepare(`SELECT COUNT(*) AS n FROM kampanye k WHERE EXISTS (SELECT 1 FROM lamaran lp WHERE lp.kampanye_id = k.id AND lp.kreator_id = ? AND lp.status = 'disetujui') AND k.status = 'selesai'`)
    .get(baris.id).n

  return {
    id: baris.id,
    nama: baris.nama,
    niche: baris.niche,
    lokasi: baris.lokasi,
    pengikut: baris.pengikut,
    bio: baris.bio,
    portofolioUrl: baris.portofolio_url,
    gradasi: baris.gradasi,
    foto: baris.foto || null,
    sosial: akunSosialKreator(baris.id, baris),
    terverifikasi: Boolean(baris.terverifikasi),
    contoh: Boolean(baris.contoh),
    rating: ulasan.jumlah ? Number(ulasan.rerata.toFixed(2)) : null,
    jumlahUlasan: ulasan.jumlah,
    kampanyeSelesai: selesai,
  }
}

// --- Rute "/saya" harus didaftarkan sebelum "/:id" agar tidak tertangkap. ---

/** GET /api/kreator/saya/kampanye — kampanye yang sedang/pernah dikerjakan. */
rutaKreator.get(
  '/saya/kampanye',
  wajibPeran('kreator'),
  bungkus((req, res) => {
    const daftar = db
      .prepare(`SELECT * FROM kampanye k WHERE EXISTS (SELECT 1 FROM lamaran lp WHERE lp.kampanye_id = k.id AND lp.kreator_id = ? AND lp.status = 'disetujui') ORDER BY k.dibuat_pada DESC`)
      .all(req.pengguna.id)
    res.json({ modeDemo: config.modeDemo, kampanye: daftar.map((k) => bentukKampanye(k, { ringkas: true })) })
  }),
)

/** GET /api/kreator/saya/lamaran — kampanye yang diikuti kreator. */
rutaKreator.get(
  '/saya/lamaran',
  wajibPeran('kreator'),
  bungkus((req, res) => {
    const daftar = db
      .prepare(
        `SELECT l.*, k.nama AS nama_kampanye, k.kategori, k.lokasi, k.tarif_per_view, k.target_views, k.status AS status_kampanye
         FROM lamaran l JOIN kampanye k ON k.id = l.kampanye_id
         WHERE l.kreator_id = ? AND l.status = 'disetujui' ORDER BY l.dibuat_pada DESC`,
      )
      .all(req.pengguna.id)

    res.json({
      lamaran: daftar.map((l) => ({
        id: l.id,
        kampanyeId: l.kampanye_id,
        namaKampanye: l.nama_kampanye,
        kategori: l.kategori,
        lokasi: l.lokasi,
        tarifPerView: l.tarif_per_view,
        targetViews: l.target_views,
        statusKampanye: l.status_kampanye,
        jenis: l.jenis,
        status: l.status,
        pesan: l.pesan,
        kecocokan: l.skor_kecocokan,
        dibuatPada: l.dibuat_pada,
      })),
    })
  }),
)

/** GET /api/kreator/saya/rekomendasi — kampanye yang cocok menurut AI. */
rutaKreator.get(
  '/saya/rekomendasi',
  wajibPeran('kreator'),
  bungkus((req, res) => {
    const daftar = rekomendasiKampanye(req.pengguna.id, { batas: Number(req.query.batas) || 10 })
    res.json({
      rekomendasi: daftar.map((k) => ({
        ...bentukKampanye(k, { ringkas: true }),
        kecocokan: k.kecocokan,
        alasan: k.alasan,
        rincianKecocokan: k.rincian,
      })),
    })
  }),
)

/**
 * GET /api/kreator/saya/portofolio — portofolio milik sendiri.
 * Isinya sama persis dengan versi publik. Endpoint terpisah hanya supaya
 * halaman kelola tidak perlu tahu id penggunanya sendiri.
 */
rutaKreator.get(
  '/saya/portofolio',
  wajibPeran('kreator'),
  bungkus((req, res) => {
    res.json(bangunPortofolio(req.pengguna.id))
  }),
)

/**
 * POST /api/kreator/saya/portofolio/tautan — tempel tautan karya.
 *
 * Konfirmasi ke oEmbed TikTok dilakukan di server, bukan di peramban, supaya
 * `terkonfirmasi` tidak pernah bisa dikirim pengguna. Gagal konfirmasi TIDAK
 * menggagalkan penyimpanan: tautannya tetap masuk, hanya tanpa centang, dan
 * balasan menyebutkan alasannya.
 */
rutaKreator.post(
  '/saya/portofolio/tautan',
  wajibPeran('kreator'),
  /*
   * Satu-satunya endpoint di aplikasi ini yang memanggil KELUAR ke pihak
   * ketiga atas perintah pengguna. Tanpa batas laju, satu kreator yang
   * me-loop panggilan ini membuat server menghantam oEmbed TikTok sampai
   * alamat IP-nya diblokir, dan blokir itu mematikan lapis "Dikonfirmasi
   * TikTok" untuk SEMUA kreator, bukan cuma pelakunya. Dihitung per pengguna,
   * bukan per IP, supaya berpindah jaringan tidak membuka kunci.
   */
  batasLaju({
    maks: 20,
    detik: 60,
    kunci: (req) => req.pengguna?.id,
    pesan: 'Terlalu banyak tautan sekaligus. Tunggu sebentar lalu coba lagi.',
  }),
  bungkus(async (req, res) => {
    const { url } = wajibAda(req.body, ['url'])
    const bersih = String(url).trim()

    const platform = tebakPlatform(bersih)
    if (!platform) throw galat400('Tautan tidak sah. Salin alamat lengkapnya, termasuk https://')

    const sudahAda = db
      .prepare('SELECT id FROM portofolio_tautan WHERE kreator_id = ? AND url = ?')
      .get(req.pengguna.id, bersih)
    if (sudahAda) throw galat409('Tautan ini sudah ada di portofolio Anda.')

    const oembed = platform === 'tiktok' ? await konfirmasiTikTok(bersih) : null

    const hasil = db
      .prepare(
        `INSERT INTO portofolio_tautan
           (kreator_id, platform, url, judul, penulis, penulis_akun, thumbnail, terkonfirmasi)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        req.pengguna.id,
        platform,
        bersih,
        oembed?.judul ?? null,
        oembed?.penulis ?? null,
        oembed?.penulisAkun ?? null,
        oembed?.thumbnail ?? null,
        oembed ? 1 : 0,
      )

    res.status(201).json({
      id: Number(hasil.lastInsertRowid),
      platform,
      terkonfirmasi: Boolean(oembed),
      // Kalimat ini muncul apa adanya di antarmuka, jadi harus menjelaskan
      // sebabnya dan bukan sekadar bilang "gagal".
      keterangan: oembed
        ? `Dikonfirmasi TikTok sebagai karya @${oembed.penulisAkun || oembed.penulis}.`
        : platform === 'tiktok'
          ? 'TikTok tidak membalas untuk tautan ini, jadi kepemilikannya belum terkonfirmasi.'
          : 'Hanya tautan TikTok yang bisa dikonfirmasi otomatis. Tautan ini disimpan tanpa centang.',
      portofolio: bangunPortofolio(req.pengguna.id),
    })
  }),
)

/** DELETE /api/kreator/saya/portofolio/tautan/:tautanId — cabut satu tautan. */
rutaKreator.delete(
  '/saya/portofolio/tautan/:tautanId',
  wajibPeran('kreator'),
  bungkus((req, res) => {
    // Pemilik ikut di klausa WHERE, jadi kreator lain tidak bisa menghapus
    // tautan orang hanya dengan menebak id yang berurutan.
    const hasil = db
      .prepare('DELETE FROM portofolio_tautan WHERE id = ? AND kreator_id = ?')
      .run(Number(req.params.tautanId), req.pengguna.id)
    if (!hasil.changes) throw galat404('Tautan tidak ditemukan di portofolio Anda.')

    res.json({ dihapus: true, portofolio: bangunPortofolio(req.pengguna.id) })
  }),
)

/**
 * GET /api/kreator/saya/portofolio/profil — status Cek Profil untuk halaman
 * kelola: apakah fiturnya hidup, kode bio milik kreator ini, dan hasil ukur.
 */
rutaKreator.get(
  '/saya/portofolio/profil',
  wajibPeran('kreator'),
  bungkus((req, res) => {
    const baris = db
      .prepare('SELECT * FROM statistik_terukur WHERE kreator_id = ? ORDER BY platform')
      .all(req.pengguna.id)
    res.json({
      aktif: cekProfilAktif(),
      kode: kodeVerifikasi(req.pengguna.id),
      profil: baris.map(bentukTerukur),
    })
  }),
)

/**
 * POST /api/kreator/saya/portofolio/profil — ukur profil dari tautannya.
 *
 * Dua hasil yang sama-sama 200:
 *   - `terbukti: false` : kode belum ada di bio. Angkanya ikut dikirim
 *     sebagai pratinjau untuk kreator sendiri, tapi TIDAK disimpan, jadi
 *     tidak pernah sampai ke UMKM.
 *   - `terbukti: true`  : disimpan ke `statistik_terukur` dan masuk portofolio.
 */
rutaKreator.post(
  '/saya/portofolio/profil',
  wajibPeran('kreator'),
  /*
   * Setiap panggilan memotong kredit berbayar. Longgar cukup untuk alur
   * "cek, taruh kode di bio, cek lagi" beberapa kali, ketat cukup supaya
   * satu akun tidak bisa menghabiskan kredit seluruh platform.
   */
  batasLaju({
    maks: 6,
    detik: 600,
    kunci: (req) => req.pengguna?.id,
    pesan: 'Cek profil dibatasi 6 kali per 10 menit. Tunggu sebentar lalu coba lagi.',
  }),
  bungkus(async (req, res) => {
    const { url } = wajibAda(req.body, ['url'])
    const { platform, akun } = uraiTautanProfil(url)

    const diklaim = db
      .prepare('SELECT kreator_id FROM statistik_terukur WHERE platform = ? AND akun = ? AND kreator_id != ?')
      .get(platform, akun, req.pengguna.id)
    if (diklaim) throw galat409(`Akun @${akun} sudah terhubung ke kreator lain di LokalBoost.`)

    const profil = await ambilProfil(platform, akun)

    // Cek ulang dengan nama akun KANONIK dari penyedia: satu channel YouTube
    // bisa ditulis @handle atau /channel/UC..., dan cek di atas hanya melihat
    // bentuk yang diketik.
    const diklaimKanonik = db
      .prepare('SELECT kreator_id FROM statistik_terukur WHERE platform = ? AND akun = ? AND kreator_id != ?')
      .get(platform, profil.akun, req.pengguna.id)
    if (diklaimKanonik) throw galat409(`Akun @${profil.akun} sudah terhubung ke kreator lain di LokalBoost.`)

    const metrik = hitungMetrik(profil)
    const penilaian = nilaiProfil(platform, metrik)
    const kode = kodeVerifikasi(req.pengguna.id)

    const ringkas = {
      platform,
      akun: profil.akun,
      namaTampilan: profil.namaTampilan,
      centangPlatform: profil.centangPlatform,
      ...metrik,
      ...penilaian,
    }

    if (!bioMemuatKode(profil.bio, kode)) {
      return res.json({
        terbukti: false,
        kode,
        hasil: ringkas,
        keterangan:
          `Akun @${profil.akun} berhasil diukur, tapi belum terbukti milik Anda. ` +
          `Tambahkan kode ${kode} di bio akun itu, simpan, lalu cek lagi. ` +
          'Setelah terbukti, kodenya boleh dihapus dari bio.',
      })
    }

    db.prepare(
      `INSERT INTO statistik_terukur
         (kreator_id, platform, akun, nama_tampilan, centang_platform, pengikut, rerata_views,
          median_views, engagement, dasar_engagement, konten_diukur, konten_30_hari, skor,
          penilaian, diukur_pada)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT (kreator_id, platform) DO UPDATE SET
         akun = excluded.akun, nama_tampilan = excluded.nama_tampilan,
         centang_platform = excluded.centang_platform, pengikut = excluded.pengikut,
         rerata_views = excluded.rerata_views, median_views = excluded.median_views,
         engagement = excluded.engagement, dasar_engagement = excluded.dasar_engagement,
         konten_diukur = excluded.konten_diukur, konten_30_hari = excluded.konten_30_hari,
         skor = excluded.skor, penilaian = excluded.penilaian, diukur_pada = excluded.diukur_pada`,
    ).run(
      req.pengguna.id,
      platform,
      profil.akun,
      profil.namaTampilan,
      profil.centangPlatform ? 1 : 0,
      metrik.pengikut,
      metrik.rerataViews,
      metrik.medianViews,
      metrik.engagement,
      metrik.dasarEngagement,
      metrik.kontenDiukur,
      metrik.konten30Hari,
      penilaian.skor,
      JSON.stringify({
        predikat: penilaian.predikat,
        komponen: penilaian.komponen,
        peringatan: penilaian.peringatan,
      }),
    )

    res.json({
      terbukti: true,
      kode,
      hasil: ringkas,
      keterangan: `Akun @${profil.akun} terbukti milik Anda dan statistiknya masuk portofolio.`,
      portofolio: bangunPortofolio(req.pengguna.id),
    })
  }),
)

/** DELETE /api/kreator/saya/portofolio/profil/:platform — lepas akun terukur. */
rutaKreator.delete(
  '/saya/portofolio/profil/:platform',
  wajibPeran('kreator'),
  bungkus((req, res) => {
    if (!PLATFORM_PROFIL.includes(req.params.platform)) throw galat400('Platform tidak dikenal.')
    const hasil = db
      .prepare('DELETE FROM statistik_terukur WHERE kreator_id = ? AND platform = ?')
      .run(req.pengguna.id, req.params.platform)
    if (!hasil.changes) throw galat404('Belum ada akun terukur untuk platform ini.')
    res.json({ dihapus: true, portofolio: bangunPortofolio(req.pengguna.id) })
  }),
)

/** GET /api/kreator — direktori kreator dengan filter niche & lokasi. */
rutaKreator.get(
  '/',
  bungkus((req, res) => {
    const { niche, lokasi, q, terverifikasi } = req.query
    const syarat = ["p.peran = 'kreator'"]
    const nilai = []

    if (niche) {
      syarat.push('lower(pk.niche) = lower(?)')
      nilai.push(niche)
    }
    if (lokasi) {
      syarat.push('lower(pk.lokasi) = lower(?)')
      nilai.push(lokasi)
    }
    if (terverifikasi === 'true') syarat.push('pk.terverifikasi = 1')
    if (q) {
      syarat.push('(lower(p.nama) LIKE lower(?) OR lower(pk.bio) LIKE lower(?))')
      nilai.push(`%${q}%`, `%${q}%`)
    }

    const daftar = db
      .prepare(
        `SELECT p.id, p.nama, p.contoh, pk.*
         FROM pengguna p JOIN profil_kreator pk ON pk.pengguna_id = p.id
         WHERE ${syarat.join(' AND ')}
         ORDER BY pk.pengikut DESC`,
      )
      .all(...nilai)

    res.json({ jumlah: daftar.length, kreator: daftar.map(bentukKreator) })
  }),
)

/**
 * GET /api/kreator/:id/portofolio — portofolio publik hasil auto-builder.
 *
 * Sengaja TIDAK dijaga login, sama seperti profil kreator: justru UMKM yang
 * belum punya akun adalah pembaca yang paling perlu diyakinkan.
 */
rutaKreator.get(
  '/:id/portofolio',
  bungkus((req, res) => {
    const portofolio = bangunPortofolio(req.params.id)
    if (!portofolio) throw galat404('Kreator tidak ditemukan.')
    res.json(portofolio)
  }),
)

/** GET /api/kreator/:id — profil publik + ulasan + portofolio kampanye. */
rutaKreator.get(
  '/:id',
  bungkus((req, res) => {
    const baris = db
      .prepare(
        `SELECT p.id, p.nama, p.contoh, pk.*
         FROM pengguna p JOIN profil_kreator pk ON pk.pengguna_id = p.id
         WHERE p.id = ?`,
      )
      .get(req.params.id)
    if (!baris) throw galat404('Kreator tidak ditemukan.')

    const ulasan = db
      .prepare(
        `SELECT u.bintang, u.komentar, u.dibuat_pada, p.nama AS penilai, k.nama AS kampanye
         FROM ulasan u
         JOIN pengguna p ON p.id = u.penilai_id
         JOIN kampanye k ON k.id = u.kampanye_id
         WHERE u.dinilai_id = ? ORDER BY u.dibuat_pada DESC LIMIT 20`,
      )
      .all(req.params.id)

    const portofolio = db
      .prepare(
        `SELECT k.id, k.nama, k.kategori, k.gradasi, k.gambar,
                ((SELECT COUNT(*) FROM tayangan t JOIN video v ON v.id = t.video_id
                  WHERE t.kampanye_id = k.id AND t.valid = 1 AND v.kreator_id = k_kr.id)
               + (SELECT COALESCE(SUM(v.views_diakui), 0) FROM video v
                  WHERE v.kampanye_id = k.id AND v.kreator_id = k_kr.id AND v.sumber = 'tautan' AND v.status = 'tayang')) AS views
         FROM kampanye k JOIN pengguna k_kr ON k_kr.id = ?
         WHERE EXISTS (SELECT 1 FROM lamaran lp WHERE lp.kampanye_id = k.id AND lp.kreator_id = k_kr.id AND lp.status = 'disetujui') AND k.status = 'selesai'
         ORDER BY k.selesai_pada DESC LIMIT 10`,
      )
      .all(req.params.id)

    res.json({ kreator: bentukKreator(baris), ulasan, portofolio })
  }),
)
